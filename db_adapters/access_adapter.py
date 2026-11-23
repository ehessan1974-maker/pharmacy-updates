# -*- coding: utf-8 -*-
"""db_adapters/access_adapter.py — Access (.accdb / .mdb) + محاكي الذاكرة للاختبارات.

الاتصال الحقيقي عبر ODBC (pyodbc) — مع اكتشاف نقص «Access Database Engine»
وإظهار رسالة توجيهية واضحة. السحب والكتابة عبر الجسر المحلي القائم (access_bridge.py)
يظل مسارهما كما هما؛ هذا المحوّل يضيف طبقة الاختبار والفحص والترحيل.
"""
import os

from .base import (
    BaseAdapter, DBError, err_not_found, err_missing_lib,
)
from .proxy import ProxyAdapter, ProxyConnection


ACCESS_DRIVERS = (
    "Microsoft Access Driver (*.mdb, *.accdb)",
    "Microsoft Access Driver (*.mdb)",
)


def _check_engine():
    try:
        import pyodbc  # noqa: F401
    except ImportError:
        raise err_missing_lib("pyodbc", "pip install pyodbc")
    try:
        drivers = [d for d in pyodbc.drivers()]
    except Exception:
        drivers = []
    for want in ACCESS_DRIVERS:
        if any(want in d for d in drivers):
            return True
    raise DBError(
        "تعريف «Microsoft Access Database Engine» غير مثبّت على هذا الجهاز، "
        "وهو شرط للاتصال بملفات .accdb / .mdb.\n"
        "نزّل وثبّت Access Database Engine Redistributable المطابق لنظامك "
        "(64-bit لو البرنامج 64-bit) ثم أعد المحاولة."
    )


class AccessAdapter(BaseAdapter):
    """Access عبر ODBC — فحص اتصال وسرد جداول وقراءة/كتابة جداول للترحيل."""

    kind = "access"
    label = "Microsoft Access (.accdb / .mdb)"

    def test(self):
        self._check_path()
        _check_engine()
        import pyodbc
        cs = self._conn_string()
        try:
            conn = pyodbc.connect(cs, timeout=10)
            cur = conn.cursor()
            tables = [r.tables_in_catalog if hasattr(r, "tables_in_catalog") else r[2]
                      for r in cur.tables(tableType="TABLE")]
            conn.close()
            return {"ok": True, "tables": tables}
        except pyodbc.Error as e:
            raise DBError(
                f"فشل الاتصال بقاعدة Access: {self.path}\n"
                "تأكد أن الملف غير مقفول من برنامج آخر ومن صحة المسار.",
                technical=str(e)
            )

    def _check_path(self):
        if not self.path or not os.path.exists(self.path):
            raise err_not_found(self.path or "(بدون مسار)")

    def _conn_string(self):
        driver = ACCESS_DRIVERS[0]
        suffix = self.path.lower().endswith(".mdb")
        if suffix:
            driver = ACCESS_DRIVERS[1]
        cs = f"Driver={{{driver}}};Dbq={self.path};"
        if self.config.get("password"):
            cs += f"PWD={self.config['password']};"
        return cs

    def get_conn(self):
        # server.py لا يعمل SQL مباشرة على أكسس — اتصاله يمر بالجسر أو SQLite؛
        # نوفّر اتصال pyodbc حقيقي للقراءة/الكتابة المباشرة عند الحاجة.
        self._check_path()
        _check_engine()
        import pyodbc
        conn = pyodbc.connect(self._conn_string(), timeout=15)
        return conn

    def list_tables(self):
        r = self.test()
        return r["tables"]

    def read_table(self, name):
        q = "[%s]" % str(name).replace("]", "]]")
        conn = self.get_conn()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM " + q)
            keys = [d[0] for d in cur.description]
            rows = [dict(zip(keys, r)) for r in cur.fetchall()]
            return {"cols": keys, "rows": rows}
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def write_table(self, name, cols, rows):
        raise DBError(
            "الكتابة المباشرة على Access من المحوّل غير مفعّلة حفاظًا على سلامة القاعدة — "
            "استعمل الترحيل إلى Access عبر الجسر المحلي (تشغيل_الجسر.bat) أو اختر SQLite."
        )

    def meta(self):
        m = super().meta()
        m["bridge"] = True
        return m


class AccessSimAdapter(ProxyAdapter):
    """محاكي Access في الذاكرة (للاختبارات والتجريب دون أوفيس نهائيًا)."""

    kind = "access-sim"
    label = "محاكي Access (ذاكرة)"

    def _load_tables(self):
        return {}

    def _write_store(self, name, cols, rows):
        return True   # الذاكرة فقط — بلا مخزن ملفي

    def meta(self):
        m = super().meta()
        m["simulated"] = True
        return m
