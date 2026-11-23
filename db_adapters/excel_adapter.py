# -*- coding: utf-8 -*-
"""db_adapters/excel_adapter.py — مصنف Excel (.xlsx) كقاعدة بيانات: كل ورقة = جدول."""
import os

from .base import atomic_write_bytes, acquire_lock, release_lock, err_not_found, err_missing_lib, err_file_locked
from .proxy import ProxyAdapter


class ExcelAdapter(ProxyAdapter):
    kind = "excel"
    label = "مصنف Excel (.xlsx)"

    def _wb(self):
        try:
            from openpyxl import load_workbook
        except ImportError:
            raise err_missing_lib("openpyxl", "pip install openpyxl")
        if not os.path.exists(self.path):
            if self.read_only:
                raise err_not_found(self.path)
            from openpyxl import Workbook
            return Workbook()
        return load_workbook(self.path, data_only=True)

    def _load_tables(self):
        if not self.path:
            raise err_not_found("(لم يُحدَّد مسار ملف Excel)")
        if not os.path.exists(self.path):
            if self.read_only:
                raise err_not_found(self.path)
            return {}
        wb = self._wb()
        tables = {}
        for ws in wb.worksheets:
            rows_iter = ws.iter_rows(values_only=True)
            try:
                header = next(rows_iter)
            except StopIteration:
                continue
            cols = [str(c) if c is not None else "" for c in header]
            if not any(cols):
                continue
            rows = []
            for vals in rows_iter:
                if vals is None or all(v is None for v in vals):
                    continue
                r = {}
                for i, c in enumerate(cols):
                    if c:
                        r[c] = vals[i] if i < len(vals) else None
                rows.append(r)
            tables[ws.title] = {"cols": cols, "rows": rows}
        wb.close()
        return tables

    def _write_store(self, name, cols, rows):
        try:
            from openpyxl import load_workbook
        except ImportError:
            raise err_missing_lib("openpyxl", "pip install openpyxl")
        lock = None
        try:
            lock = acquire_lock(self.path)
            wb = self._wb()
            # إزالة ورقة بنفس الاسم إن وجدت ثم الإنشاء
            if name in wb.sheetnames:
                del wb[name]
            ws = wb.create_sheet(title=str(name)[:31])
            ws.append(list(cols))
            for r in rows:
                ws.append([r.get(c) for c in cols])
            # حفظ ذري عبر ملف مؤقت
            tmp = self.path + ".tmp.xlsx"
            wb.save(tmp)
            wb.close()
            os.replace(tmp, self.path)
        except PermissionError:
            raise err_file_locked(self.path)
        finally:
            release_lock(lock)
        return True
