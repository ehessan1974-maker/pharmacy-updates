# -*- coding: utf-8 -*-
"""db_adapters/migrate.py — الترحيل والنسخ بين أي قاعدين من المدعومين.

مثال: Access → SQLite، أو SQLite → مجلد TXT/JSON، أو العكس.
- شريط تقدم عبر progress_cb(done, total, table_name)
- تحقق تطابق السجلات بعد كل جدول
- نسخة احتياطية تلقائية من المخزن الهدف إن كان ملفيًا
"""
import os

from .base import DBError
from . import factory

PROTECTED_TABLES = ()   # كل الجداول تُرحَّل


def migrate(src_adapter, dst_adapter, progress_cb=None, backup=True, overwrite=True):
    tables = [t for t in src_adapter.list_tables() if t not in PROTECTED_TABLES]
    total = len(tables)
    results = []
    if progress_cb:
        progress_cb(0, total, "")
    if backup and dst_adapter.kind in ("sqlite", "txtjson", "csv", "excel", "access"):
        try:
            bak = factory.backup_active(tag="قبل-الترحيل")
        except Exception:
            bak = None
    else:
        bak = None
    for i, t in enumerate(tables, start=1):
        payload = src_adapter.read_table(t)
        cols, rows = payload["cols"], payload["rows"]
        existing = dst_adapter.list_tables()
        if t in existing and not overwrite:
            dst_adapter.close()
            raise DBError(
                "الجدول «%s» موجود في القاعدة الهدف و«عدم الاستبدال» مفعّل." % t
            )
        dst_adapter.write_table(t, cols, rows)
        # تحقق تطابق السجلات
        back = dst_adapter.read_table(t)
        ok = len(back["rows"]) == len(rows)
        results.append({"table": t, "rows": len(rows), "verified": ok})
        if progress_cb:
            progress_cb(i, total, t)
    return {"total": total, "tables": results, "backup": bak}
