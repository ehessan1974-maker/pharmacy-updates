# -*- coding: utf-8 -*-
"""db_adapters/factory.py — إنشاء المحوّلات وتفعيلها وحفظ إعدادات الاتصال.

المصادر بترتيب الأولوية:
  1) data/db_config.json (يُكتب من لوحة الإعدادات في البرنامج فقط)
  2) متغيرات البيئة DB_ADAPTER / DB_PATH / DB_CONNECTION_STRING
  3) SQLite الافتراضية (data/pharmacy.db)
  — مسار أكسس من «إعدادات_الجسر.json» يُعرض كاقتراح في اللوحة (access_hint)
    ولا يُفعَّل محرك SQL تلقائيًا أبدًا (إصلاح انحدار v110: كان كل طلب API
    يفتح اتصال ODBC على أكسس ثم يُنفّذ عليه SQL بصيغة SQLite فيفشل،
    ويتنافس مع الجسر على ملف أكسس نفسه — فتتأخر الشاشات دقائق).
"""
import os
import json
import shutil
import threading
import time

from .base import BaseAdapter, DBError
from .sqlite_adapter import SqliteAdapter
from .txtjson_adapter import TxtJsonAdapter
from .csv_adapter import CsvAdapter
from .excel_adapter import ExcelAdapter
from .access_adapter import AccessAdapter, AccessSimAdapter
from .network_adapter import NetworkAdapter
from .proxy import ProxyAdapter  # noqa: F401


ADAPTER_CLASSES = {
    "sqlite": SqliteAdapter,
    "txtjson": TxtJsonAdapter,
    "csv": CsvAdapter,
    "excel": ExcelAdapter,
    "access": AccessAdapter,
    "access-sim": AccessSimAdapter,
    "network": NetworkAdapter,
}

KIND_LABELS = {
    "sqlite": "SQLite (.db / .sqlite / .sqlite3)",
    "txtjson": "ملفات TXT / JSON مهيكلة",
    "csv": "ملفات CSV",
    "excel": "مصنف Excel (.xlsx)",
    "access": "Microsoft Access (.accdb / .mdb)",
    "access-sim": "محاكي Access (ذاكرة — تجريب)",
    "network": "قاعدة شبكية (رابط اتصال)",
}

CONFIG_FILE = "data/db_config.json"
BRIDGE_CONFIG = "إعدادات_الجسر.json"

_lock = threading.RLock()
_active = None
_active_cfg = None

# v111: تراجع بعد فشل التفعيل — محاولة اتصال فاشلة (أكسس مقفول/سائق ناقص/خادم متوقف)
# لا تُعاد كل طلبٍ (كان يجمّد الشاشات دقائق)؛ تُعاد المحاولة بعد مهلة فقط برسالة فورية.
_FAILURE = {"key": None, "at": 0.0, "error": None}
_FAILURE_BACKOFF = 60.0


def base_dir():
    import sys
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _abs(p):
    if not p:
        return p
    return p if os.path.isabs(p) else os.path.join(base_dir(), p)


def load_saved_config():
    """إعدادات الاتصال المحفوظة — أول مصدر موجود (بدون تفعيل تلقائي لأكسس)."""
    for f in (os.path.join(base_dir(), CONFIG_FILE), _abs(CONFIG_FILE)):
        if f and os.path.exists(f):
            try:
                cfg = json.load(open(f, encoding="utf-8"))
                if isinstance(cfg, dict) and cfg.get("kind"):
                    cfg.setdefault("source", "saved")
                    return cfg
            except Exception:
                pass
    env_kind = os.getenv("DB_ADAPTER")
    if env_kind:
        return {
            "kind": env_kind,
            "path": os.getenv("DB_PATH") or "",
            "connection_string": os.getenv("DB_CONNECTION_STRING") or "",
            "read_only": os.getenv("DB_READ_ONLY") == "1",
            "source": "env",
        }
    # الافتراضي: SQLite — مع احترام DB_PATH (توافق رجعي مع النشر القديم والاختبارات)
    return {"kind": "sqlite",
            "path": os.getenv("DB_PATH") or "data/pharmacy.db",
            "source": "default"}


def access_hint():
    """مسار أكسس من إعدادات_الجسر.json — ليعبّئه زر الاستعراض في اللوحة تلقائيًا."""
    bridge = os.path.join(base_dir(), BRIDGE_CONFIG)
    if os.path.exists(bridge):
        try:
            cfg = json.load(open(bridge, encoding="utf-8"))
            p = cfg.get("db_path")
            if p and str(p).lower().endswith((".accdb", ".mdb")):
                return {"path": p, "read_only": bool(cfg.get("read_only", False))}
        except Exception:
            pass
    return None


def activate(cfg):
    """تفويض المحوّل الحالي وتفعيل الجديد (أو إعادة تفعيل الحالي)."""
    global _active, _active_cfg
    with _lock:
        cfg = dict(cfg)
        key = (cfg.get("kind"), cfg.get("path"), cfg.get("connection_string"),
               bool(cfg.get("read_only")))
        if key == _FAILURE["key"] and (time.time() - _FAILURE["at"]) < _FAILURE_BACKOFF:
            raise DBError(
                "تعذر الاتصال مؤخرًا بنفس الإعدادات: " + str(_FAILURE["error"]) +
                "\nتُعاد المحاولة تلقائيًا بعد دقيقة، أو صحّح الإعدادات ثم «حفظ وتفعيل فورًا»."
            )
        adapter = create_adapter(cfg)
        try:
            adapter.connect()
        except Exception as e:
            _FAILURE.update({"key": key, "at": time.time(),
                             "error": getattr(e, "message_ar", str(e))})
            raise
        _FAILURE.update({"key": None, "at": 0.0, "error": None})
        if _active is not None:
            try:
                _active.close()
            except Exception:
                pass
        _active = adapter
        _active_cfg = cfg
        return adapter


def save_config(cfg):
    """حفظ الإعدادات في data/db_config.json (+ توافق إعدادات_الجسر.json لأكسس)."""
    os.makedirs(os.path.join(base_dir(), "data"), exist_ok=True)
    p = os.path.join(base_dir(), CONFIG_FILE)
    json.dump(cfg, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if cfg.get("kind") == "access" and cfg.get("path"):
        bp = os.path.join(base_dir(), BRIDGE_CONFIG)
        try:
            bridge = json.load(open(bp, encoding="utf-8")) if os.path.exists(bp) else {}
        except Exception:
            bridge = {}
        bridge["db_path"] = cfg["path"]
        bridge["read_only"] = bool(cfg.get("read_only", False))
        json.dump(bridge, open(bp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return p


def create_adapter(cfg):
    kind = (cfg or {}).get("kind")
    cls = ADAPTER_CLASSES.get(kind)
    if not cls:
        raise DBError(
            "نوع قاعدة بيانات غير مدعوم: %s\nالمدعوم: %s" % (kind, "، ".join(sorted(ADAPTER_CLASSES)))
        )
    c = dict(cfg)
    if c.get("path"):
        c["path"] = _abs(c["path"])
    return cls(c)



def get_adapter(force=False):
    """المحوّل النشط — يُنشأ من الإعدادات المحفوظة عند أول طلب."""
    global _active, _active_cfg
    with _lock:
        if _active is None or force:
            activate(load_saved_config())
        return _active


def get_active_config():
    get_adapter()
    return dict(_active_cfg or {})


def backup_active(tag=""):
    """نسخة احتياطية تلقائية من مخزن القاعدة النشطة قبل أي تبديل أو تعديل حساس."""
    a = get_adapter()
    stamp = __import__("datetime").datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = os.path.join(base_dir(), "data", "backups", (tag or "auto") + "-" + stamp)
    os.makedirs(out_dir, exist_ok=True)
    kind = a.kind
    copied = []
    if kind == "sqlite" and a.path and os.path.exists(a.path):
        for ext in ("", "-wal", "-shm"):
            src = a.path + ext
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(out_dir, os.path.basename(src)))
                copied.append(os.path.basename(src))
    elif kind in ("txtjson", "csv") and a.path and os.path.isdir(a.path):
        for fn in os.listdir(a.path):
            src = os.path.join(a.path, fn)
            if os.path.isfile(src) and not fn.endswith(".lock"):
                shutil.copy2(src, os.path.join(out_dir, fn))
                copied.append(fn)
    elif kind == "excel" and a.path and os.path.exists(a.path):
        shutil.copy2(a.path, os.path.join(out_dir, os.path.basename(a.path)))
        copied.append(os.path.basename(a.path))
    elif kind in ("access",) and a.path and os.path.exists(a.path):
        shutil.copy2(a.path, os.path.join(out_dir, os.path.basename(a.path)))
        copied.append(os.path.basename(a.path))
    return {"dir": out_dir, "files": copied, "kind": kind}
