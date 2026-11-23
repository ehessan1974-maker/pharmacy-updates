# -*- coding: utf-8 -*-
"""db_adapters/sqlite_adapter.py — SQLite الملفية بوضع WAL (الخيار الافتراضي السريع)."""
import os
import sqlite3

from .base import BaseAdapter, DBError, is_write_sql, err_not_found
from .proxy import ProxyConnection


class SqliteAdapter(BaseAdapter):
    kind = "sqlite"
    label = "SQLite (.db / .sqlite / .sqlite3)"

    def __init__(self, config):
        super().__init__(config)
        self._conn = None

    def _path(self):
        p = self.path
        if not p:
            raise DBError("لم يُحدَّد مسار ملف SQLite.\nحدّد المسار من لوحة إعدادات الاتصال.")
        return p

    def connect(self):
        p = self._path()
        if not os.path.exists(p):
            if self.read_only:
                raise err_not_found(p)
            # إنشاء قاعدة SQLite جديدة فارغة بالمخطط الكامل عند التفعيل
            os.makedirs(os.path.dirname(os.path.abspath(p)) or ".", exist_ok=True)
            sqlite3.connect(p).close()
        conn = sqlite3.connect(p, timeout=15, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=15000")
        self._conn = conn
        return True

    def close(self):
        if self._conn is not None:
            try:
                self._conn.close()
            finally:
                self._conn = None
        return True

    def track_sql(self, sql):
        pass

    def flush_changes(self, conn):
        pass

    def notify_closed(self, pc):
        pass

    def get_conn(self):
        if self._conn is None:
            self.connect()
        return ProxyConnection(self, self._conn)

    # ---------- المخطط ----------
    def list_tables(self):
        if self._conn is None:
            self.connect()
        cur = self._conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        return [r[0] for r in cur.fetchall()]

    def read_table(self, name):
        if self._conn is None:
            self.connect()
        info = self._conn.execute('PRAGMA table_info("%s")' % name.replace('"', '""')).fetchall()
        cols = [r[1] for r in info]
        cur = self._conn.execute('SELECT * FROM "%s"' % name.replace('"', '""'))
        keys = [d[0] for d in cur.description]
        rows = [dict(zip(keys, r)) for r in cur.fetchall()]
        return {"cols": cols, "rows": rows}

    def write_table(self, name, cols, rows):
        if self.read_only:
            raise DBError("وضع القراءة فقط مفعّل — لا يمكن الكتابة.")
        if self._conn is None:
            self.connect()
        q = '"%s"' % name.replace('"', '""')
        with self._conn:
            self._conn.execute("DROP TABLE IF EXISTS " + q)
            decls = ", ".join('"%s" NUMERIC' % c.replace('"', '""') for c in cols) or '"x" NUMERIC'
            self._conn.execute("CREATE TABLE %s (%s)" % (q, decls))
            if rows:
                ph = ", ".join("?" for _ in cols)
                sql = "INSERT INTO %s (%s) VALUES (%s)" % (
                    q, ", ".join('"%s"' % c.replace('"', '""') for c in cols), ph)
                self._conn.executemany(sql, [[r.get(c) for c in cols] for r in rows])
        return True
