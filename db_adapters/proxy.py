# -*- coding: utf-8 -*-
"""db_adapters/proxy.py — وكيل SQLite في الذاكرة: قلب توافق الصيغ الملفية والشبكية.

يفتح قاعدة SQLite :memory: ويحمّل فيها جداول المخزن، فيعمل عليه كامل SQL
الحالي (server.py) كما هو — وعند كل commit تُزامَن الجداول الملموسة فقط
إلى مخزن الملفات بكتابة ذرية. القراءة فقط تُمنع بأي عبارة كتابة برسالة عربية.
"""
import sqlite3

from .base import (
    BaseAdapter, DBError, is_write_sql, sql_touched_tables,
)


class ProxyCursor:
    """مؤشر ملفوف: يتحقق من القراءة-فقط ويتتبّع الجداول الملموسة."""

    def __init__(self, adapter, cur):
        self._adapter = adapter
        self._cur = cur

    def execute(self, sql, params=()):
        if self._adapter.read_only and is_write_sql(sql):
            raise DBError(
                "قاعدة البيانات مفتوحة بوضع «القراءة فقط» — لا يمكن التعديل.\n"
                "أوقف الخيار من لوحة «إعدادات الاتصال بقاعدة البيانات»."
            )
        self._adapter.track_sql(sql)
        return self._cur.execute(sql, params)

    def executemany(self, sql, seq):
        if self._adapter.read_only and is_write_sql(sql):
            raise DBError(
                "قاعدة البيانات مفتوحة بوضع «القراءة فقط» — لا يمكن التعديل.\n"
                "أوقف الخيار من لوحة «إعدادات الاتصال بقاعدة البيانات»."
            )
        self._adapter.track_sql(sql)
        return self._cur.executemany(sql, seq)

    def __getattr__(self, name):
        return getattr(self._cur, name)


class ProxyConnection:
    """غلاف اتصال يتحكّم بالكتابة ويزامن المخزن عند commit.

    الاتصال السفلي يملكه المحوّل (اتصال واحد مشترك للذاكرة) — إغلاق الغلاف
    لا يغلق الذاكرة بل يحرّر المقبض فقط، وكُل get_conn يعيد غلافًا جديدًا.
    """

    def __init__(self, adapter, conn):
        self._adapter = adapter
        self._conn = conn

    # --- واجهة DB-API الشائعة ---
    def cursor(self):
        return ProxyCursor(self._adapter, self._conn.cursor())

    def execute(self, sql, params=()):
        if self._adapter.read_only and is_write_sql(sql):
            raise DBError(
                "قاعدة البيانات مفتوحة بوضع «القراءة فقط» — لا يمكن التعديل.\n"
                "أوقف الخيار من لوحة «إعدادات الاتصال بقاعدة البيانات»."
            )
        self._adapter.track_sql(sql)
        return self._conn.execute(sql, params)

    def commit(self):
        self._conn.commit()
        self._adapter.flush_changes(self._conn)

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._adapter.notify_closed(self)

    # --- تفويض الباقي ---
    def __getattr__(self, name):
        return getattr(self._conn, name)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self.commit()
        else:
            self.rollback()


class ProxyAdapter(BaseAdapter):
    """أساس المحوّلات عبر وكيل الذاكرة — الفئة الفرعية تنفّذ التحميل والكتابة."""

    kind = "proxy"

    def __init__(self, config):
        super().__init__(config)
        self._mem = None
        self._open_wrappers = []
        self._touched_log = []

    # ---------- دورة الحياة ----------
    def connect(self):
        self._mem = sqlite3.connect(":memory:", check_same_thread=False)
        self._mem.row_factory = sqlite3.Row
        loaded = self._load_tables()
        with self._mem:
            for name, payload in loaded.items():
                self._create_in_memory(self._mem, name, payload["cols"], payload["rows"])
        return True

    def close(self):
        if self._mem is not None:
            try:
                self._mem.close()
            finally:
                self._mem = None
        self._open_wrappers = []
        return True

    def notify_closed(self, proxy_conn):
        if proxy_conn in self._open_wrappers:
            self._open_wrappers.remove(proxy_conn)

    # ---------- المخطط داخل الذاكرة ----------
    @staticmethod
    def _quote(name):
        return '"' + str(name).replace('"', '""') + '"'

    def _create_in_memory(self, mem, name, cols, rows):
        # NUMERIC affinity: تحفظ الأرقام أرقامًا والنصوص نصوصًا — تُبقي المجاميع والترتيب سليمة
        decls = ", ".join(self._quote(c) + " NUMERIC" for c in cols) or '"x" NUMERIC'
        mem.execute("CREATE TABLE IF NOT EXISTS " + self._quote(name) + " (" + decls + ")")
        if rows:
            ph = ", ".join("?" for _ in cols)
            sql = "INSERT INTO " + self._quote(name) + " (" + \
                  ", ".join(self._quote(c) for c in cols) + ") VALUES (" + ph + ")"
            mem.executemany(sql, [[r.get(c) for c in cols] for r in rows])

    def _snapshot_cols(self, mem, name):
        cur = mem.execute("PRAGMA table_info(" + self._quote(name) + ")")
        return [r[1] for r in cur.fetchall()]

    # ---------- الاتصال ----------
    def get_conn(self):
        if self._mem is None:
            self.connect()
        wrapper = ProxyConnection(self, self._mem)
        self._open_wrappers.append(wrapper)
        return wrapper

    # ---------- التتبّع والمزامنة ----------
    def track_sql(self, sql):
        if sql:
            self._touched_log.extend(sql_touched_tables(sql))

    def flush_changes(self, mem_conn):
        """مزامنة الجداول الملموسة منذ آخر حفظ — تُستدعى من ProxyConnection.commit."""
        if self.read_only:
            return
        names = set(self._touched_log)
        self._touched_log = []
        if not names:
            return
        try:
            cur = mem_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
            known = {r[0] for r in cur.fetchall()}
        except sqlite3.Error:
            known = set(self.list_tables())
        targets = [t for t in names if t in known]
        if not targets:
            return
        with self._lock:
            for name in targets:
                self._flush_table_from_memory(mem_conn, name)

    def _flush_table_from_memory(self, mem_conn, name):
        cols = self._snapshot_cols(mem_conn, name)
        cur = mem_conn.execute("SELECT * FROM " + self._quote(name))
        keys = [d[0] for d in cur.description]
        rows = [dict(zip(keys, r)) for r in cur.fetchall()]
        self._write_store(name, cols or keys, rows)
        # الذاكرة هي المصدر — لا حاجة لإعادة التحميل هنا

    def _sync_memory(self, name, cols, rows):
        """تحديث نسخة الذاكرة بعد كتابة خارجية (ترحيل/مزامنة مباشرة)."""
        if self._mem is None:
            return
        with self._mem:
            self._mem.execute("DROP TABLE IF EXISTS " + self._quote(name))
            self._create_in_memory(self._mem, name, cols, rows)

    # ---------- الكتابة الموحدة ----------
    def write_table(self, name, cols, rows):
        """كتابة المخزن الملفي/الشبكي + مزامنة نسخة الذاكرة (الواجهة الموحدة)."""
        if self.read_only:
            raise DBError("وضع القراءة فقط مفعّل — لا يمكن الكتابة.")
        self._write_store(name, cols, rows)
        self._sync_memory(name, cols, rows)
        return True

    def _write_store(self, name, cols, rows):
        raise NotImplementedError

    # ---------- القراءة الموحدة ----------
    def list_tables(self):
        if self._mem is None:
            self.connect()
        cur = self._mem.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        return [r[0] for r in cur.fetchall()]

    def read_table(self, name):
        if self._mem is None:
            self.connect()
        cols = self._snapshot_cols(self._mem, name)
        cur = self._mem.execute("SELECT * FROM " + self._quote(name))
        keys = [d[0] for d in cur.description]
        rows = [dict(zip(keys, r)) for r in cur.fetchall()]
        return {"cols": cols, "rows": rows}

    def test(self):
        if self._mem is None:
            self.connect()
        return super().test()
