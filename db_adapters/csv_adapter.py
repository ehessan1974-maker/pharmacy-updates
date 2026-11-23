# -*- coding: utf-8 -*-
"""db_adapters/csv_adapter.py — ملفات CSV: جدول لكل ملف داخل المجلد المختار."""
import os
import csv

from .base import atomic_write_bytes, acquire_lock, release_lock, err_not_found
from .proxy import ProxyAdapter


class CsvAdapter(ProxyAdapter):
    kind = "csv"
    label = "ملفات CSV"

    def _load_tables(self):
        if not self.path:
            raise err_not_found("(لم يُحدَّد مسار المجلد)")
        if not os.path.isdir(self.path):
            if self.read_only:
                raise err_not_found(self.path)
            os.makedirs(self.path, exist_ok=True)
            return {}
        tables = {}
        for fn in sorted(os.listdir(self.path)):
            if not fn.lower().endswith(".csv") or fn.startswith("_"):
                continue
            name = fn[:-4]
            rows, cols = [], []
            with open(os.path.join(self.path, fn), "r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                cols = list(reader.fieldnames or [])
                for r in reader:
                    rows.append({k: (v if v is not None else "") for k, v in r.items() if k is not None})
            tables[name] = {"cols": cols, "rows": rows}
        return tables

    def _table_path(self, name):
        safe = str(name).replace("/", "_").replace("\\", "_")
        return os.path.join(self.path, safe + ".csv")

    def _write_store(self, name, cols, rows):
        if not self.path:
            raise err_not_found("(لم يُحدَّد مسار المجلد)")
        os.makedirs(self.path, exist_ok=True)
        lock = None
        try:
            lock = acquire_lock(os.path.join(self.path, "_قفل"))
            data = []
            cols = cols or (list(rows[0].keys()) if rows else ["x"])
            for r in rows:
                data.append([r.get(c, "") if r.get(c) is not None else "" for c in cols])
            import io
            buf = io.StringIO()
            w = csv.writer(buf, lineterminator="\n")
            w.writerow(cols)
            w.writerows(data)
            atomic_write_bytes(self._table_path(name), b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8"))
        finally:
            release_lock(lock)
        return True
