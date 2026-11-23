# -*- coding: utf-8 -*-
"""db_adapters/txtjson_adapter.py — ملفات نصية مهيكلة TXT / JSON Lines.

وضعان:
  A) مجلد: جدول لكل ملف «اسم الجدول.json» (مصفوفة JSON مقروءة ونسخة احتياطية سهلة)
     + ملف «_مخطط.json» يحفظ ترتيب الأعمدة.
  B) ملف حزمة واحد (.json / .jsonl / .txt): كائن {اسم الجدول: [صفوف]}.
الكتابة ذرية مع قفل حماية — لا تلف الملف عند الكتابة المتزامنة.
"""
import os
import json

from .base import (
    atomic_write_bytes, acquire_lock, release_lock, err_not_found, err_bad_format,
)
from .proxy import ProxyAdapter


class TxtJsonAdapter(ProxyAdapter):
    kind = "txtjson"
    label = "ملفات TXT / JSON مهيكلة"

    def _is_package(self):
        if os.path.isfile(self.path):
            return True
        # النمط الحزمي بالامتداد حتى قبل إنشاء الملف
        return bool(self.path) and self.path.lower().endswith(('.json', '.jsonl', '.txt'))

    # ---------- التحميل ----------
    def _load_tables(self):
        if not self.path:
            raise err_not_found("(لم يُحدَّد مسار المجلد أو الملف)")
        if self._is_package():
            return self._load_package(self.path)
        if not os.path.isdir(self.path):
            if self.read_only:
                raise err_not_found(self.path)
            os.makedirs(self.path, exist_ok=True)
            return {}
        return self._load_dir(self.path)

    def _decode_rows(self, name, raw):
        try:
            data = json.loads(raw)
        except ValueError as e:
            raise err_bad_format(self.path, f"الجدول «{name}»: {e}")
        if isinstance(data, dict):
            data = data.get("rows", [])
        out = []
        for r in data or []:
            if isinstance(r, dict):
                out.append(r)
            elif isinstance(r, list):
                out.append({"c%d" % i: v for i, v in enumerate(r)})
        return out

    def _cols_of(self, rows):
        cols = []
        for r in rows:
            for k in r.keys():
                if k not in cols:
                    cols.append(k)
        return cols

    def _load_package(self, p):
        if not os.path.exists(p):
            if self.read_only:
                raise err_not_found(p)
            return {}
        raw = open(p, "rb").read().decode("utf-8-sig")
        tables = {}
        if p.lower().endswith(".jsonl"):
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except ValueError as e:
                    raise err_bad_format(p, str(e))
                tname = obj.get("table") or obj.get("جدول")
                if not tname:
                    continue
                rows = obj.get("rows") or obj.get("صفوف") or []
                tables[tname] = {"cols": self._cols_of(rows), "rows": rows}
            return tables
        try:
            obj = json.loads(raw)
        except ValueError as e:
            raise err_bad_format(p, str(e))
        if not isinstance(obj, dict):
            raise err_bad_format(p, "المتوقع كائن {اسم الجدول: [صفوف]}")
        for tname, payload in obj.items():
            if tname.startswith("_"):
                continue
            rows = payload.get("rows") if isinstance(payload, dict) else payload
            rows = [r for r in (rows or []) if isinstance(r, dict)]
            tables[tname] = {"cols": self._cols_of(rows), "rows": rows}
        return tables

    def _load_dir(self, d):
        tables = {}
        for fn in sorted(os.listdir(d)):
            if not fn.lower().endswith((".json", ".jsonl", ".txt")) or fn.startswith("_"):
                continue
            name = fn.rsplit(".", 1)[0]
            raw = open(os.path.join(d, fn), "rb").read().decode("utf-8-sig")
            rows = self._decode_rows(name, raw)
            tables[name] = {"cols": self._cols_of(rows), "rows": rows}
        return tables

    # ---------- الكتابة ----------
    def _table_path(self, name):
        safe = str(name).replace("/", "_").replace("\\", "_")
        return os.path.join(self.path, safe + ".json")

    def _lock_path(self):
        return self.path if self._is_package() else os.path.join(self.path, "_قفل")

    def _write_store(self, name, cols, rows):
        lock = None
        try:
            lock = acquire_lock(self._lock_path())
            payload = {"_مخطط": cols, "rows": rows}
            data = json.dumps(payload, ensure_ascii=False, indent=1).encode("utf-8")
            if self._is_package():
                tables = self._load_package(self.path) if os.path.exists(self.path) else {}
                tables[name] = {"cols": cols, "rows": rows}
                packed = {t: {"rows": v["rows"]} for t, v in tables.items()}
                data = json.dumps(packed, ensure_ascii=False, indent=1).encode("utf-8")
                atomic_write_bytes(self.path, data)
            else:
                os.makedirs(self.path, exist_ok=True)
                atomic_write_bytes(self._table_path(name), data)
                atomic_write_bytes(os.path.join(self.path, "_مخطط.json"),
                                   json.dumps({name: cols}, ensure_ascii=False, indent=1).encode("utf-8"))
        finally:
            release_lock(lock)
        return True
