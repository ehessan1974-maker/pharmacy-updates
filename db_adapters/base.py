# -*- coding: utf-8 -*-
"""db_adapters/base.py — الواجهة الموحدة لكل محوّلات قواعد البيانات في أبوتيكا.

الفكرة الجوهرية (محرك التوافق):
  كل محوّل يقدّم اتصال DB-API متوافقًا عبر get_conn() — والصيغ الملفية
  (TXT/JSON/CSV/Excel) والشبكية تعمل عبر «وكيل SQLite في الذاكرة» تُزامَن
  جداوله إلى مخزن الملفات عند كل commit بكتابة ذرية. بهذا يعمل كامل SQL
  الحالي في server.py على أي نوع قاعدة دون أي كسر.
"""
import os
import re
import threading


class DBError(Exception):
    """خطأ قاعدة بيانات برسالة عربية واضحة للمستخدم."""

    def __init__(self, message_ar, technical=""):
        super().__init__(message_ar)
        self.message_ar = message_ar
        self.technical = technical


def err_file_locked(path):
    return DBError(
        f"الملف مقفول من برنامج آخر ولا يمكن الكتابة عليه: {path}\n"
        "أغلق البرنامج الذي يفتح الملف (Excel / Access / نسخة أخرى) ثم أعد المحاولة."
    )


def err_not_found(path):
    return DBError(
        f"المسار غير موجود: {path}\n"
        "تحقق من المسار أو أنشئ قاعدة جديدة من لوحة «إعدادات الاتصال بقاعدة البيانات»."
    )


def err_bad_format(path, detail=""):
    return DBError(
        f"صيغة الملف غير صالحة: {path}\n{detail}".rstrip()
    )


def err_missing_lib(lib, install_hint):
    return DBError(
        f"مكتبة {lib} غير مثبّتة على هذا الجهاز.\nثبّتها بالأمر: {install_hint}"
    )


class BaseAdapter:
    """العقد الموحد — كل المحوّلات تطبق نفس الواجهة."""

    kind = "base"           # sqlite / txtjson / csv / excel / access / access-sim / network
    label = "قاعدة بيانات"   # اسم عربي للعرض في الواجهة

    def __init__(self, config):
        self.config = dict(config or {})
        self.path = self.config.get("path") or ""
        self.read_only = bool(self.config.get("read_only", False))
        self._lock = threading.RLock()

    # ---------- دورة الحياة ----------
    def connect(self):
        """تهيئة المخزن (يُستدعى عند التفعيل)."""
        return True

    def close(self):
        return True

    def test(self):
        """اختبار الاتصال — يعيد قائمة الجداول الموجودة أو يرفع DBError."""
        return {"ok": True, "tables": self.list_tables()}

    # ---------- المخطط ----------
    def list_tables(self):
        raise NotImplementedError

    def table_exists(self, name):
        return name in self.list_tables()

    def read_table(self, name):
        """قراءة جدول كامل → {'cols': [...], 'rows': [ {عمود: قيمة} ]}"""
        raise NotImplementedError

    def write_table(self, name, cols, rows):
        """استبدال جدول كامل (يُستعمل للترحيل والمزامنة) — كتابة ذرية."""
        raise NotImplementedError

    # ---------- اتصال متوافق مع SQL ----------
    def get_conn(self):
        """اتصال DB-API (sqlite3 في الوكيل) — يستهلكه server.py كما هو."""
        raise NotImplementedError

    # ---------- وصف ----------
    def meta(self):
        return {
            "kind": self.kind,
            "label": self.label,
            "path": self.path,
            "read_only": self.read_only,
            "connected": True,
        }


# ---------- أدوات مشتركة ----------

SQL_WRITE_RE = re.compile(
    r"\b(insert|update|delete|create|drop|alter|replace|vacuum|reindex)\b", re.I
)
_TABLE_RE = re.compile(
    r"""(?:from|into|update|join|table)\s+(?:"([^"]+)"|\[([^\]]+)\]|`([^`]+)`|([^\s,;()"']+))""",
    re.I,
)


def sql_touched_tables(sql):
    """استخراج أسماء الجداول المذكورة في عبارة SQL (لمزامنة الملموس فقط) —
    يدعم المقتبس بأسماء عربية متعددة الكلمات مثل «فاتورة مبيعات رؤوس»."""
    out = []
    for m in _TABLE_RE.finditer(sql or ""):
        t = m.group(1) or m.group(2) or m.group(3) or m.group(4)
        if t and not t.startswith("("):
            out.append(t)
    return out


def is_write_sql(sql):
    return bool(SQL_WRITE_RE.search(sql or ""))


def atomic_write_bytes(path, data):
    """كتابة ذرية: ملف مؤقت في نفس المجلد ثم استبدال ذري — لا يَتلف الملف أبدًا."""
    d = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(d, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def acquire_lock(path, timeout=10.0):
    """قفل حماية بسيط ومتعدد المنصات عبر ملف قفل بإنشاء حصري."""
    import time
    lock_path = path + ".lock"
    start = time.time()
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return lock_path
        except FileExistsError:
            if time.time() - start > timeout:
                # قفل قديم معطوف — نقبله ونتحاوط عليه
                try:
                    if time.time() - os.path.getmtime(lock_path) > 300:
                        os.remove(lock_path)
                        continue
                except OSError:
                    continue
                raise err_file_locked(path)
            time.sleep(0.05)


def release_lock(lock_path):
    try:
        if lock_path and os.path.exists(lock_path):
            os.remove(lock_path)
    except OSError:
        pass
