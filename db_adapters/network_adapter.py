# -*- coding: utf-8 -*-
"""db_adapters/network_adapter.py — قواعد شبكية عبر رابط اتصال (Connection String).

يدعم PostgreSQL / MySQL / SQL Server بحسب توفّر السائق:
  postgresql://…  → psycopg2
  mysql://…       → pymysql
  sqlserver://… أو mssql://… → pyodbc

المحوّل يعمل بنفس آلية الوكيل: تُحمَّل الجداول في الذاكرة ويُزامَن التعديل
إلى الخادم بإعادة كتابة الجدول الملموس داخل معاملة.
"""
import re

from .base import DBError, err_missing_lib
from .proxy import ProxyAdapter


def _parse_conn_string(cs):
    m = re.match(r"^\s*(postgresql|postgres|mysql|mssql|sqlserver)://", cs or "", re.I)
    if not m:
        raise DBError(
            "رابط الاتصال غير مفهوم — الصيغ المدعومة:\n"
            "postgresql://user:pass@host:5432/dbname\n"
            "mysql://user:pass@host:3306/dbname\n"
            "sqlserver://user:pass@host:1433/dbname"
        )
    scheme = m.group(1).lower()
    if scheme in ("postgresql", "postgres"):
        return "postgres", cs
    if scheme == "mysql":
        return "mysql", cs
    return "mssql", cs


def _driver_mod(kind):
    if kind == "postgres":
        try:
            import psycopg2  # noqa: F401
            return "psycopg2"
        except ImportError:
            raise err_missing_lib("psycopg2", "pip install psycopg2-binary")
    if kind == "mysql":
        try:
            import pymysql  # noqa: F401
            return "pymysql"
        except ImportError:
            raise err_missing_lib("pymysql", "pip install pymysql")
    try:
        import pyodbc  # noqa: F401
        return "pyodbc"
    except ImportError:
        raise err_missing_lib("pyodbc", "pip install pyodbc")


class NetworkAdapter(ProxyAdapter):
    kind = "network"
    label = "قاعدة شبكية (PostgreSQL / MySQL / SQL Server)"

    def __init__(self, config):
        super().__init__(config)
        self.cs = config.get("connection_string") or self.path
        self.net_kind, _ = _parse_conn_string(self.cs)

    def _conn(self):
        _driver_mod(self.net_kind)   # رسالة عربية واضحة إن نقص السائق
        if self.net_kind == "postgres":
            import psycopg2
            return psycopg2.connect(self.cs)
        if self.net_kind == "mysql":
            import pymysql
            return pymysql.connect(self.cs)
        import pyodbc
        dsn = re.sub(r"^sqlserver://", "DRIVER={ODBC Driver 17 for SQL Server};", self.cs, flags=re.I)
        return pyodbc.connect(dsn, timeout=15)

    def test(self):
        conn = self._conn()
        try:
            cur = conn.cursor()
            cur.execute(self._list_tables_sql())
            tables = [r[0] for r in cur.fetchall()]
            return {"ok": True, "tables": tables}
        except Exception as e:
            raise DBError("فشل الاتصال بالخادم: تحقق من الرابط والشبكة.", technical=str(e))
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def _list_tables_sql(self):
        if self.net_kind == "postgres":
            return "SELECT tablename FROM pg_tables WHERE schemaname='public'"
        if self.net_kind == "mysql":
            return "SHOW TABLES"
        return "SELECT name FROM sys.tables WHERE type='U'"

    def _q(self, name):
        return '"' + str(name).replace('"', '""') + '"'

    # ---------- الوكيل ----------
    def _load_tables(self):
        conn = self._conn()
        try:
            cur = conn.cursor()
            cur.execute(self._list_tables_sql())
            names = [r[0] for r in cur.fetchall()]
            tables = {}
            for n in names:
                try:
                    cur.execute("SELECT * FROM " + self._q(n))
                    keys = [d[0] for d in cur.description]
                    rows = [dict(zip(keys, r)) for r in cur.fetchall()]
                    tables[n] = {"cols": keys, "rows": rows}
                except Exception:
                    continue
            return tables
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def _write_store(self, name, cols, rows):
        conn = self._conn()
        try:
            cur = conn.cursor()
            q = self._q(name)
            # إنشاء الجدول إن غاب (نصية جميع الأعمدة — الكمية عبر القيم)
            ctype = "TEXT"
            col_defs = ", ".join('%s %s' % (self._q(c), ctype) for c in cols) or '"x" TEXT'
            try:
                cur.execute("CREATE TABLE " + q + " (" + col_defs + ")")
            except Exception:
                conn.rollback()
            cur.execute("DELETE FROM " + q)
            ph = ", ".join("?" for _ in cols)
            ins = "INSERT INTO " + q + " (" + ", ".join(self._q(c) for c in cols) + ") VALUES (" + ph + ")"
            for r in rows:
                try:
                    cur.execute(ins, [r.get(c) for c in cols])
                except Exception:
                    # بعض السوائق تستخدم %s بدل ?
                    cur.execute(ins.replace("?", "%s"), [r.get(c) for c in cols])
            conn.commit()
        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            raise DBError("تعذر مزامنة الجدول «%s» مع الخادم." % name, technical=str(e))
        finally:
            try:
                conn.close()
            except Exception:
                pass
        return True
