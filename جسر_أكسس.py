# -*- coding: utf-8 -*-
"""
جسر قاعدة البيانات — فاتورة مشتريات (نسخة أكسس HTML) — إصدار v101 الموسّع
=====================================================
يربط برنامج «فاتورة مشتريات.html» مباشرة بقاعدة أكسس الأصلية MDB_be.accdb
بدون أي تحويل: الملف نفسه هو قاعدة البيانات الوحيدة — قراءة وكتابة فورية.

v101 يضيف (مع الحفاظ على كل الوظائف الأصلية):
  - مسار /dashboard يخدم لوحة معلومات بصرية كاملة
  - 19 مسار API جديد: تقارير، مدفوعات، طلبات، شركات، تنبيهات مخزون، سجل أسعار
  - آلية تحديث ذاتي: يفحص GitHub عند الإقلاع ويحدّث نفسه ولوحة المعلومات تلقائيًا

التشغيل:  python جسر_أكسس.py      (أو انقر تشغيل_الجسر.bat)
الإعدادات: ملف إعدادات_الجسر.json بجانب هذا الملف (يُنشأ تلقائيًا):
    db_path    = مسار قاعدة البيانات (الافتراضي E:\\تقسيم قاعدة البيانات\\MDB_be.accdb)
    port       = منفذ الخادم المحلي (الافتراضي 8765)
    read_only  = true لمنع أي كتابة (الافتراضي false)

البرنامج (HTML) يكتشف الجسر تلقائيًا عند فتحه، وفي أول فتح يعرض حوار
«الاتصال بقاعدة البيانات» حيث يمكن للمستخدم اختيار ملف القاعدة بنافذة
أصلية (زر «اختيار قاعدة أخرى…» يستدعي /pick الذي يفتح نافذة اختيار ملف
على هذا الجهاز) — والاختيار يُحفظ في إعدادات_الجسر.json.
إن لم تُختر قاعدة بعد يعمل الجسر رغم ذلك ليصلك حوار الاختيار في البرنامج.
"""
import json
import os
import sys
import threading
import datetime
import queue
import time
import urllib.request
import urllib.parse
import shutil
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

# ================== إصدار الجسر والتحديث الذاتي (v101) ==================
BRIDGE_VERSION = "101"
UPDATE_REPO = "ehessan1974-maker/pharmacy-updates"
UPDATE_BRANCH = "main"
UPDATE_SOURCES = [
    "https://raw.githubusercontent.com/" + UPDATE_REPO + "/" + UPDATE_BRANCH + "/",
    "https://cdn.jsdelivr.net/gh/" + UPDATE_REPO + "@" + UPDATE_BRANCH + "/",
]
UPDATE_FILES = [
    ("جسر_أكسس.py", "جسر_أكسس.py"),
    ("templates/dashboard.html", "dashboard.html"),
]
AUTO_UPDATE_ENABLED = True   # يمكن تعطيله بتعيينه False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(BASE_DIR, "إعدادات_الجسر.json")
DEFAULT_DB = r"E:\تقسيم قاعدة البيانات\MDB_be.accdb"
DEFAULT_PORT = 8765

# الجداول المسموح الوصول إليها (حماية من أي وصول عرضي لجداول أخرى)
# 06al: أُضيفا «مبيعات» و«مدفوعات» — نظام فاتورة المبيعات المدمج في فاتورة مشتريات
#       يقرؤهما ويكتب فيهما في نفس قاعدة أكسس هذه عبر نفس الجسر
# 06av: الجدول المسموح الغائب عن القاعدة لا يبقى غائباً — يُعاد فحص مخططه آلياً
#       (عند كل طلب له، وعلى ping كل 15 ثانية) فإذا أُنشئ لاحقاً في أكسس صار متاحاً
#       بلا إعادة تشغيل الجسر — ورسالة الغياب صارت صريحة: «غير موجود في قاعدة
#       البيانات المتصلة» بدل «غير مسموح» الواحدة المضللة (بلاغ المستخدم:
#       «لا دفعات إلى هذا المستودع — جدول غير مسموح: مدفوعات»)
ALLOWED_TABLES = ["مشتريات", "بطاقات المواد", "المستخدم", "مبيعات", "مدفوعات", "جديد", "حصص", "مطلوب"]   # 06an: جداول الطلبية المساندة — تُتجاهل إن غابت من القاعدة

CFG = {"db_path": DEFAULT_DB, "port": DEFAULT_PORT, "read_only": False}

# طلبات فتح نافذة اختيار الملف — تُنفَّذ في الخيط الرئيسي (متطلب tkinter)
PICK_Q = queue.Queue()
TK_OK = True
try:
    import tkinter  # noqa: F401
except Exception:
    TK_OK = False


def load_cfg():
    global CFG
    try:
        with open(CFG_PATH, "r", encoding="utf-8") as f:
            user = json.load(f)
        for k in CFG:
            if k in user:
                CFG[k] = user[k]
    except Exception:
        pass
    with open(CFG_PATH, "w", encoding="utf-8") as f:
        json.dump(CFG, f, ensure_ascii=False, indent=2)


def save_cfg():
    try:
        with open(CFG_PATH, "w", encoding="utf-8") as f:
            json.dump(CFG, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ================== طبقة الوصول لقاعدة الأكسس ==================
class Dao:
    """واجهة موحدة فوق pyodbc (ODBC) أو adodbapi (OLE DB) — تُجرّب بالترتيب"""

    # أكسس يخزّن القيم الزمنية «وقتًا فقط» فوق تاريخ أساس 1899-12-30
    ACCESS_EPOCH = datetime.datetime(1899, 12, 30)

    def __init__(self, db_path):
        self.db_path = db_path
        self.kind = "odbc"
        self.lock = threading.RLock()
        self.conn = None
        self.backend = ""
        self.cols = {}       # table -> {col: odbc_type_code}
        self._last_reprobe = 0.0   # 06av: آخر إعادة فحص شاملة للجداول الغائبة (على ping)
        self._connect()

    def _candidates(self):
        """سلاسل الاتصال الممكنة بالترتيب"""
        p = self.db_path
        return [
            ("pyodbc/ODBC-Access", "odbc",
             "Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=" + p + ";"),
            ("adodbapi/ACE-OLEDB", "ado",
             "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + p + ";"),
            ("adodbapi/Jet-OLEDB", "ado",
             "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=" + p + ";"),
        ]

    def _connect(self):
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(
                "لا يوجد ملف قاعدة البيانات في المسار:\n  " + self.db_path +
                "\nاختر الملف الصحيح من زر «اختيار قاعدة أخرى…» في البرنامج")
        errs = []
        for label, kind, cs in self._candidates():
            try:
                if kind == "odbc":
                    import pyodbc  # noqa
                    self.conn = pyodbc.connect(cs, timeout=10)
                else:
                    import adodbapi  # noqa
                    self.conn = adodbapi.connect(cs, timeout=10)
                self.backend = label
                self.kind = kind
                self._read_schema()
                print("✓ اتصل بقاعدة البيانات عبر: " + label)
                self._print_tables()
                return
            except Exception as e:
                errs.append(label + ": " + str(e).split("\n")[0][:160])
        msg = ["✗ تعذر الاتصال بقاعدة الأكسس. التفاصيل:"]
        msg += ["  - " + e for e in errs]
        try:
            import pyodbc
            drv = [d for d in pyodbc.drivers() if "Access" in d or "dBASE" in d]
            msg.append("محركات ODBC المثبتة المتعلقة بأكسس: " +
                       (", ".join(drv) if drv else "لا يوجد إطلاقًا"))
            if not drv:
                msg.append("الحل: ثبّت «Microsoft Access Database Engine 2016 Redistributable» "
                           "بنفس إصدار بايثون (x64 لبايثون 64-bit)، أو ثبّت بايثون 32-bit.")
        except Exception:
            msg.append("ثبّت pyodbc أولاً:  python -m pip install pyodbc")
        raise RuntimeError("\n".join(msg))

    def _read_schema(self):
        """قراءة أعمدة الجداول المسموحة وأنواعها من القاعدة نفسها"""
        with self.lock:
            cur = self.conn.cursor()
            for t in ALLOWED_TABLES:
                try:
                    cur.execute("SELECT * FROM [" + t + "] WHERE 1=0")
                    desc = cur.description
                    if desc:
                        self.cols[t] = {d[0]: d[1] for d in desc}
                except Exception:
                    pass  # جدول غير موجود — يُستبعد
            cur.close()

    def _print_tables(self):
        """06av: طباعة حالة الجداول المسموحة عند الاتصال — يرى المستخدم فوراً
        هل قاعدته تحوي «مدفوعات» وما إلى ذلك بدل اكتشاف ذلك من رسالة خطأ لاحقة"""
        found = [t for t in ALLOWED_TABLES if t in self.cols]
        missing = [t for t in ALLOWED_TABLES if t not in self.cols]
        print("  الجداول الموجودة في القاعدة: " + ("، ".join("«" + t + "»" for t in found) if found else "لا شيء"))
        if missing:
            print("  جداول غير موجودة (تُفحص آلياً إن أُنشئت لاحقاً): " + "، ".join("«" + t + "»" for t in missing))

    def _reprobe(self, name):
        """06av: إعادة فحص مخطط جدول مسموح غائب عن القاعدة — يغطي الجدول المُنشأ
        بعد تشغيل الجسر أو ملف القاعدة المُستبدل بعد الاتصال (المخطط كان يُقرأ مرة واحدة فقط)"""
        with self.lock:
            try:
                cur = self.conn.cursor()
                cur.execute("SELECT * FROM [" + name + "] WHERE 1=0")
                desc = cur.description
                if desc:
                    self.cols[name] = {d[0]: d[1] for d in desc}
                cur.close()
            except Exception:
                pass

    def _check(self, name):
        """06av: فصل رسالتَي الخطأ — «غير مسموح» لجدول خارج قائمة الحماية،
        و«غير موجود في قاعدة البيانات المتصلة» لجدول مسموح غائب (كانت الرسالتان
        واحدة: «جدول غير مسموح» حتى لجدول مسموح غير موجود — فأوهمت المستخدم)"""
        if name not in ALLOWED_TABLES:
            raise ValueError("جدول غير مسموح: " + name)
        if name not in self.cols:
            self._reprobe(name)   # ربما أُنشئ بعد تشغيل الجسر — فحص أخير قبل الفشل
        if name not in self.cols:
            found = "، ".join("«" + t + "»" for t in ALLOWED_TABLES if t in self.cols)
            raise ValueError("الجدول «" + name + "» غير موجود في قاعدة البيانات المتصلة"
                             + (" — الجداول الموجودة: " + found if found else " — القاعدة بلا جداول من القائمة"))

    # ---------- أنواع البيانات ----------
    # كودات النوع تختلف بين pyodbc (ODBC) وadodbapi (ADO) — وأحيانًا يُرجع النوع كنوع بايثون
    ODBC_NUM = (2, 3, 4, 5, 8, 16, 17, 18, 19, 20, 21, -5, -6, -7)   # SQL_REAL=7 رقمي أيضًا
    ODBC_DATE = (9, 10, 11, 91, 92, 93)
    ADO_NUM = (2, 3, 4, 5, 6, 14, 16, 17, 18, 19, 20, 21, 131, 139)
    ADO_DATE = (7, 135)

    def _is_num(self, t):
        if isinstance(t, type):
            return t in (int, float)
        try:
            return int(t) in (self.ODBC_NUM if self.kind == "odbc" else self.ADO_NUM)
        except Exception:
            return False

    def _is_date(self, t):
        if isinstance(t, type):
            return t is datetime.datetime or t is datetime.date
        try:
            return int(t) in (self.ODBC_DATE if self.kind == "odbc" else self.ADO_DATE)
        except Exception:
            return False

    @staticmethod
    def _norm_digits(s):
        """تحويل الأرقام العربية-الهندية ٠-٩ / ۰-۹ إلى لاتينية قبل التحليل"""
        return str(s).translate(str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹",
                                              "01234567890123456789"))

    def _conv_in(self, col, t, v):
        """قيمة قادمة من البرنامج → قيمة تُكتب في أكسس"""
        if v is None or v == "":
            return None
        if self._is_num(t):
            s = self._norm_digits(v).replace("،", "").replace(",", "").strip()
            f = float(s)
            return int(f) if f == int(f) and t in (2, 4, 5, 16, 17, 18, 19, 20, 21, -5, -6) else f
        if self._is_date(t):
            s = self._norm_digits(v).strip()
            if not s:
                return None
            # وقت فقط؟ (12/24 ساعة، مع ص/م أو AM/PM — تدعم الصيغ العربية)
            tstr = s
            for ar, en in (("صباحًا", "AM"), ("صباحا", "AM"), ("ص", "AM"),
                           ("مساءً", "PM"), ("مساء", "PM"), ("م", "PM")):
                if tstr.endswith(ar):
                    tstr = tstr[:-len(ar)].strip() + " " + en
                    break
            for fmt in ("%H:%M:%S", "%H:%M", "%I:%M:%S %p", "%I:%M %p"):
                try:
                    d = datetime.datetime.strptime(tstr, fmt)
                    return self.ACCESS_EPOCH + datetime.timedelta(
                        hours=d.hour, minutes=d.minute, seconds=d.second)
                except ValueError:
                    pass
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
                        "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d",
                        "%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
                try:
                    return datetime.datetime.strptime(s, fmt)
                except ValueError:
                    pass
            raise ValueError("تاريخ/وقت غير مفهوم: " + s)
        return str(v)

    @staticmethod
    def _conv_out(v):
        """قيمة قادمة من أكسس → قيمة JSON للبرنامج"""
        if isinstance(v, datetime.datetime):
            if v.date() == Dao.ACCESS_EPOCH.date():   # «وقت فقط» بصيغة أكسس الداخلية
                return v.strftime("%H:%M:%S")
            if v.hour or v.minute or v.second:
                return v.strftime("%Y-%m-%d %H:%M:%S")
            return v.strftime("%Y-%m-%d")
        if isinstance(v, datetime.time):              # بعض المحركات تُرجع وقتًا صريحًا
            return v.strftime("%H:%M:%S")
        if isinstance(v, datetime.date):
            return v.strftime("%Y-%m-%d")
        return v

    # ---------- العمليات ----------
    def ping(self):
        with self.lock:
            # 06av: كل 15 ثانية كحد أقصى — أعِد فحص الجداول المسموحة الغائبة
            # فتصير متاحة تلقائياً إن أُنشئت في أكسس أثناء عمل الجسر (وحدثّ قائمة ping)
            now = time.time()
            if now - self._last_reprobe > 15:
                self._last_reprobe = now
                for t in ALLOWED_TABLES:
                    if t not in self.cols:
                        self._reprobe(t)
            return {"ok": True, "connected": True, "db": self.db_path,
                    "backend": self.backend,
                    "read_only": bool(CFG.get("read_only")),
                    "tables": [t for t in ALLOWED_TABLES if t in self.cols]}

    def table(self, name):
        self._check(name)   # 06av: فصل «غير مسموح» عن «غير موجود» + إعادة الفحص
        with self.lock:
            cur = self.conn.cursor()
            cur.execute("SELECT * FROM [" + name + "]")
            names = [d[0] for d in cur.description]
            rows = [dict(zip(names, (self._conv_out(v) for v in row)))
                    for row in cur.fetchall()]
            cur.close()
        return {"ok": True, "cols": names, "rows": rows}

    def _validate(self, name, data):
        self._check(name)   # 06av: فصل «غير مسموح» عن «غير موجود» + إعادة الفحص
        types = self.cols[name]
        if CFG.get("read_only"):
            raise PermissionError("القاعدة مفتوحة بوضع القراءة فقط (إعدادات_الجسر.json)")
        out = []
        for d in data:
            o = {}
            for k, v in d.items():
                if k not in types:
                    continue  # تجاهل الأعمدة غير الموجودة في الجدول فعليًا (شهر/سنة المشتقة)
                o[k] = self._conv_in(k, types[k], v)
            out.append(o)
        return out

    def insert(self, name, rows):
        rows = self._validate(name, rows)
        if not rows:
            return {"ok": True, "count": 0}
        with self.lock:
            cur = self.conn.cursor()
            cols = list(rows[0].keys())
            sql = ("INSERT INTO [" + name + "] (" +
                   ",".join("[" + c + "]" for c in cols) + ") VALUES (" +
                   ",".join("?" * len(cols)) + ")")
            n = 0
            for r in rows:
                cur.execute(sql, [r.get(c) for c in cols])
                n += 1
            self.conn.commit()
            cur.close()
        return {"ok": True, "count": n}

    def update(self, name, items):
        items = self._validate(name, [it.get("set", {}) for it in items])
        keys = [self._validate(name, [it.get("keys", {})])[0] for it in items]
        n = 0
        with self.lock:
            cur = self.conn.cursor()
            for kr, sr in zip(keys, items):
                if not sr or not kr:
                    continue
                sets = ",".join("[" + c + "]=?" for c in sr)
                whs = " AND ".join("([" + c + "]=? OR ([" + c + "] IS NULL AND ? IS NULL))" for c in kr)
                cur.execute("UPDATE [" + name + "] SET " + sets + " WHERE " + whs,
                            list(sr.values()) + list(kr.values()) + list(kr.values()))
                n += cur.rowcount if cur.rowcount > 0 else 0
            self.conn.commit()
            cur.close()
        return {"ok": True, "count": n}

    def delete(self, name, rows):
        rows = self._validate(name, rows)
        n = 0
        with self.lock:
            cur = self.conn.cursor()
            for kr in rows:
                if not kr:
                    continue
                whs = " AND ".join("([" + c + "]=? OR ([" + c + "] IS NULL AND ? IS NULL))" for c in kr)
                cur.execute("DELETE FROM [" + name + "] WHERE " + whs,
                            list(kr.values()) + list(kr.values()))
                n += max(cur.rowcount, 0)
            self.conn.commit()
            cur.close()
        return {"ok": True, "count": n}

    # ================== استعلامات SELECT الموسّعة (v101) ==================
    # كل المسارات الجديدة تستخدم هذه الدوال. كل SQL متوافق مع Access:
    #   - TOP N بدل LIMIT N
    #   - IIF(x IS NULL, 0, x) بدل COALESCE
    #   - & بدل || للنصوص
    #   - COUNT(*) FROM (SELECT DISTINCT ...) بدل COUNT(DISTINCT ...)
    # ---------------------------------------------------------

    def query(self, sql, params=None):
        """استعلام SELECT عام — يعيد list of dicts. للقراءة فقط."""
        with self.lock:
            cur = self.conn.cursor()
            if params:
                cur.execute(sql, params)
            else:
                cur.execute(sql)
            names = [d[0] for d in cur.description]
            rows = [dict(zip(names, (self._conv_out(v) for v in row)))
                    for row in cur.fetchall()]
            cur.close()
        return rows

    def scalar(self, sql, params=None):
        """استعلام يعيد قيمة واحدة فقط (أول صف، أول عمود)."""
        with self.lock:
            cur = self.conn.cursor()
            if params:
                cur.execute(sql, params)
            else:
                cur.execute(sql)
            row = cur.fetchone()
            cur.close()
            if row is None:
                return None
            return self._conv_out(row[0])

    def _table_exists(self, name):
        """فحص إذا كان الجدول موجودًا في القاعدة"""
        try:
            cur = self.conn.cursor()
            cur.execute("SELECT * FROM [" + name + "] WHERE 1=0")
            cur.close()
            return True
        except Exception:
            return False

    def _try_query(self, sql, params=None, fallback=None):
        """تنفيذ استعلام مع تسامح: إن فشل، يسجّل ويعيد fallback"""
        try:
            return self.query(sql, params)
        except Exception as e:
            print("⚠️ استعلام فشل:", str(e)[:120])
            print("   SQL:", sql[:200])
            return fallback if fallback is not None else []

    def _try_scalar(self, sql, params=None, fallback=0):
        try:
            v = self.scalar(sql, params)
            return v if v is not None else fallback
        except Exception as e:
            print("⚠️ scalar فشل:", str(e)[:120])
            return fallback

    # ---------------------------------------------------------
    # تقارير لوحة المعلومات
    # ---------------------------------------------------------

    def dashboard_stats(self):
        """إحصائيات سريعة لليوم والشهر وكل الوقت + التنبيهات"""
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        first_of_month = datetime.datetime.now().replace(day=1).strftime("%Y-%m-%d")
        result = {
            "today": {"sales_count": 0, "sales_total": 0.0, "purchases_total": 0.0, "payments_total": 0.0},
            "month": {"sales_count": 0, "sales_total": 0.0, "purchases_total": 0.0,
                      "payments_total": 0.0, "payments_count": 0},
            "all_time": {"sales_count": 0, "sales_total": 0.0, "purchases_total": 0.0},
            "materials_count": 0, "low_stock_count": 0, "expiring_count": 0,
            "generated_at": datetime.datetime.now().isoformat(),
            "bridge_version": BRIDGE_VERSION,
        }
        if DAO is None:
            return result

        # مبيعات اليوم (count + sum)
        try:
            r = self.query("""
                SELECT COUNT(*) AS cnt,
                       SUM([مبيعات].[الكمية] * [مبيعات].[سعر المبيع]) AS total
                FROM مبيعات WHERE [مبيعات].[التاريخ] = ?
            """, (today,))
            if r:
                result["today"]["sales_count"] = int(r[0].get("cnt", 0) or 0)
                result["today"]["sales_total"] = float(r[0].get("total", 0) or 0)
        except Exception as e: print("⚠️ today sales:", str(e)[:80])

        # مشتريات اليوم
        try:
            v = self._try_scalar("""
                SELECT SUM([الكمية] * [سعر الشراء]) FROM مشتريات WHERE [التاريخ] = ?
            """, (today,), 0)
            result["today"]["purchases_total"] = float(v or 0)
        except Exception: pass

        # مبيعات الشهر
        try:
            r = self.query("""
                SELECT COUNT(*) AS cnt,
                       SUM([الكمية] * [سعر المبيع]) AS total
                FROM مبيعات WHERE [التاريخ] >= ?
            """, (first_of_month,))
            if r:
                result["month"]["sales_count"] = int(r[0].get("cnt", 0) or 0)
                result["month"]["sales_total"] = float(r[0].get("total", 0) or 0)
        except Exception as e: print("⚠️ month sales:", str(e)[:80])

        # مشتريات الشهر
        try:
            v = self._try_scalar("""
                SELECT SUM([الكمية] * [سعر الشراء]) FROM مشتريات WHERE [التاريخ] >= ?
            """, (first_of_month,), 0)
            result["month"]["purchases_total"] = float(v or 0)
        except Exception: pass

        # مصاريف الشهر (مدفوعات)
        try:
            r = self.query("""
                SELECT COUNT(*) AS cnt, SUM([القيمة]) AS total
                FROM مدفوعات WHERE [التاريخ] >= ?
            """, (first_of_month,))
            if r:
                result["month"]["payments_count"] = int(r[0].get("cnt", 0) or 0)
                result["month"]["payments_total"] = float(r[0].get("total", 0) or 0)
        except Exception as e: print("⚠️ month payments:", str(e)[:80])

        # كل الوقت: عدد الفواتير المختلفة + إجمالي
        try:
            v = self._try_scalar("SELECT COUNT(*) FROM (SELECT DISTINCT [رقم الفاتورة] FROM مبيعات) AS t", None, 0)
            result["all_time"]["sales_count"] = int(v or 0)
        except Exception: pass
        try:
            v = self._try_scalar("SELECT SUM([الكمية] * [سعر المبيع]) FROM مبيعات", None, 0)
            result["all_time"]["sales_total"] = float(v or 0)
        except Exception: pass
        try:
            v = self._try_scalar("SELECT SUM([الكمية] * [سعر الشراء]) FROM مشتريات", None, 0)
            result["all_time"]["purchases_total"] = float(v or 0)
        except Exception: pass

        # عدد المواد
        try:
            v = self._try_scalar('SELECT COUNT(*) FROM "بطاقات المواد"', None, 0)
            result["materials_count"] = int(v or 0)
        except Exception: pass

        # تنبيهات: نقص المخزون وقرب الانتهاء — إن توفّر عرض «ك صيدلية»
        try:
            soon = (datetime.datetime.now() + datetime.timedelta(days=30)).strftime("%Y-%m-%d")
            v = self._try_scalar('SELECT COUNT(*) FROM "ك صيدلية" WHERE [ك صيدلية] < 10', None, 0)
            result["low_stock_count"] = int(v or 0)
            v = self._try_scalar(
                'SELECT COUNT(*) FROM "ك صيدلية" WHERE [تاريخ انتهاء الفعالية] <= ?', (soon,), 0)
            result["expiring_count"] = int(v or 0)
        except Exception:
            pass   # العرض غير موجود في بعض القواعد — تجاهل

        return result

    def sales_summary(self, start_date, end_date, group_by="day"):
        """ملخص المبيعات المجمّع يوميًا أو شهريًا"""
        if group_by == "month":
            group_expr = "LEFT([التاريخ], 7)"   # YYYY-MM
        else:
            group_expr = "[التاريخ]"

        rows = self._try_query(f"""
            SELECT {group_expr} AS period,
                   COUNT(*) AS rows_cnt,
                   SUM([الكمية]) AS qty,
                   SUM([الكمية] * [سعر المبيع]) AS gross,
                   SUM([الكمية] * [سعر المبيع] * (1 - IIF([حسم %] IS NULL, 0, [حسم %]) / 100.0)) AS net
            FROM مبيعات
            WHERE [التاريخ] BETWEEN ? AND ?
            GROUP BY {group_expr}
            ORDER BY period
        """, (start_date, end_date), [])

        # عدّ الفواتير المختلفة في كل فترة
        periods = []
        for r in rows:
            p = r.get("period", "")
            inv_cnt = self._try_scalar(
                "SELECT COUNT(*) FROM (SELECT DISTINCT [رقم الفاتورة] FROM مبيعات WHERE [التاريخ] BETWEEN ? AND ? " +
                (f"AND LEFT([التاريخ], 7) = ?" if group_by == "month" else "AND [التاريخ] = ?") +
                ") AS t",
                (start_date, end_date, p), 0)
            periods.append({
                "period": p,
                "invoices": int(inv_cnt or 0),
                "rows": int(r.get("rows_cnt", 0) or 0),
                "qty": float(r.get("qty", 0) or 0),
                "gross": float(r.get("gross", 0) or 0),
                "net": float(r.get("net", 0) or 0),
            })

        # الإجماليات
        totals = self._try_query("""
            SELECT COUNT(*) AS rows_cnt,
                   SUM([الكمية]) AS qty,
                   SUM([الكمية] * [سعر المبيع]) AS gross,
                   SUM([الكمية] * [سعر المبيع] * (1 - IIF([حسم %] IS NULL, 0, [حسم %]) / 100.0)) AS net
            FROM مبيعات WHERE [التاريخ] BETWEEN ? AND ?
        """, (start_date, end_date), [{"rows_cnt": 0, "qty": 0, "gross": 0, "net": 0}])
        t = totals[0] if totals else {}
        total_invoices = self._try_scalar(
            "SELECT COUNT(*) FROM (SELECT DISTINCT [رقم الفاتورة] FROM مبيعات WHERE [التاريخ] BETWEEN ? AND ?) AS t",
            (start_date, end_date), 0)

        return {
            "start_date": start_date, "end_date": end_date, "group_by": group_by,
            "periods": periods,
            "totals": {
                "invoices": int(total_invoices or 0),
                "qty": float(t.get("qty", 0) or 0),
                "gross": float(t.get("gross", 0) or 0),
                "net": float(t.get("net", 0) or 0),
            },
        }

    def top_selling(self, start_date, end_date, limit=20):
        """الأكثر مبيعًا في فترة"""
        rows = self._try_query(f"""
            SELECT TOP {int(limit)} [المادة],
                   COUNT(*) AS cnt,
                   SUM([الكمية]) AS qty,
                   SUM([الكمية] * [سعر المبيع]) AS revenue
            FROM مبيعات
            WHERE [التاريخ] BETWEEN ? AND ? AND [المادة] IS NOT NULL
            GROUP BY [المادة]
            ORDER BY SUM([الكمية]) DESC
        """, (start_date, end_date), [])
        return {"items": [
            {"name": r.get("المادة", ""),
             "qty": float(r.get("qty", 0) or 0),
             "revenue": float(r.get("revenue", 0) or 0),
             "invoices": int(r.get("cnt", 0) or 0)}
            for r in rows
        ]}

    def sales_by_buyer(self, start_date, end_date):
        """المبيعات حسب الزبون"""
        rows = self._try_query("""
            SELECT IIF([إلى] IS NULL, 'بدون زبون', [إلى]) AS buyer,
                   COUNT(*) AS cnt,
                   SUM([الكمية]) AS qty,
                   SUM([الكمية] * [سعر المبيع]) AS gross
            FROM مبيعات WHERE [التاريخ] BETWEEN ? AND ?
            GROUP BY [إلى]
            ORDER BY SUM([الكمية] * [سعر المبيع]) DESC
        """, (start_date, end_date), [])
        return {"items": [
            {"buyer": r.get("buyer", ""),
             "qty": float(r.get("qty", 0) or 0),
             "gross": float(r.get("gross", 0) or 0),
             "invoices": int(r.get("cnt", 0) or 0)}
            for r in rows
        ]}

    def purchases_summary(self, start_date, end_date):
        """ملخص المشتريات حسب المورد"""
        rows = self._try_query("""
            SELECT IIF([إلى] IS NULL, 'بدون مورد', [إلى]) AS supplier,
                   COUNT(*) AS cnt,
                   SUM([الكمية]) AS qty,
                   SUM([المجاني]) AS free_qty,
                   SUM([الكمية] * [سعر الشراء]) AS total_cost
            FROM مشتريات WHERE [التاريخ] BETWEEN ? AND ?
            GROUP BY [إلى]
            ORDER BY SUM([الكمية] * [سعر الشراء]) DESC
        """, (start_date, end_date), [])
        suppliers = [
            {"supplier": r.get("supplier", ""),
             "qty": float(r.get("qty", 0) or 0),
             "free_qty": float(r.get("free_qty", 0) or 0),
             "total_cost": float(r.get("total_cost", 0) or 0),
             "invoices": int(r.get("cnt", 0) or 0)}
            for r in rows
        ]
        totals = {
            "invoices": sum(s["invoices"] for s in suppliers),
            "qty": sum(s["qty"] for s in suppliers),
            "free_qty": sum(s["free_qty"] for s in suppliers),
            "total_cost": sum(s["total_cost"] for s in suppliers),
        }
        return {"suppliers": suppliers, "totals": totals}

    # ---------------------------------------------------------
    # المدفوعات والمصاريف
    # ---------------------------------------------------------

    def payments_list(self, start_date, end_date, group=None, limit=500):
        """قائمة المدفوعات في فترة"""
        where = "WHERE [التاريخ] BETWEEN ? AND ?"
        params = [start_date, end_date]
        if group:
            where += " AND [المجموعة] = ?"
            params.append(group)
        rows = self._try_query(f"""
            SELECT TOP {int(limit)} [ترقيم تلقائي], [البيان], [القيمة], [التاريخ],
                   [المستخدم], [من], [إلى], [رقم الفاتورة], [المجموعة]
            FROM مدفوعات {where}
            ORDER BY [التاريخ] DESC, [ترقيم تلقائي] DESC
        """, params, [])
        total_cnt = self._try_scalar(f"SELECT COUNT(*) FROM مدفوعات {where}", params, 0)
        total_val = self._try_scalar(f"SELECT SUM([القيمة]) FROM مدفوعات {where}", params, 0)
        return {
            "data": [{"id": r.get("ترقيم تلقائي"), "statement": r.get("البيان", ""),
                      "value": float(r.get("القيمة", 0) or 0), "date": r.get("التاريخ", ""),
                      "user": r.get("المستخدم", ""), "from": r.get("من", ""),
                      "to": r.get("إلى", ""), "invoice_no": r.get("رقم الفاتورة", ""),
                      "group": r.get("المجموعة", "")} for r in rows],
            "totals": {"count": int(total_cnt or 0), "value": float(total_val or 0)},
        }

    def payments_totals(self, start_date, end_date):
        """إجمالي المدفوعات مجمعًا حسب المجموعة والجهة"""
        grand_cnt = self._try_scalar(
            "SELECT COUNT(*) FROM مدفوعات WHERE [التاريخ] BETWEEN ? AND ?",
            (start_date, end_date), 0)
        grand_val = self._try_scalar(
            "SELECT SUM([القيمة]) FROM مدفوعات WHERE [التاريخ] BETWEEN ? AND ?",
            (start_date, end_date), 0)

        by_group = self._try_query("""
            SELECT IIF([المجموعة] IS NULL, 'بدون مجموعة', [المجموعة]) AS grp,
                   COUNT(*) AS cnt, SUM([القيمة]) AS val
            FROM مدفوعات WHERE [التاريخ] BETWEEN ? AND ?
            GROUP BY [المجموعة]
            ORDER BY SUM([القيمة]) DESC
        """, (start_date, end_date), [])
        by_dest = self._try_query("""
            SELECT TOP 50 IIF([إلى] IS NULL, 'بدون جهة', [إلى]) AS dest,
                   COUNT(*) AS cnt, SUM([القيمة]) AS val
            FROM مدفوعات WHERE [التاريخ] BETWEEN ? AND ?
            GROUP BY [إلى]
            ORDER BY SUM([القيمة]) DESC
        """, (start_date, end_date), [])

        return {
            "grand_total": {"count": int(grand_cnt or 0), "value": float(grand_val or 0)},
            "by_group": [{"group": r.get("grp", ""), "count": int(r.get("cnt", 0) or 0),
                          "value": float(r.get("val", 0) or 0)} for r in by_group],
            "by_destination": [{"destination": r.get("dest", ""), "count": int(r.get("cnt", 0) or 0),
                                "value": float(r.get("val", 0) or 0)} for r in by_dest],
        }

    def payments_search(self, q, limit=200):
        """بحث نصي في المدفوعات"""
        like = "%" + q + "%"
        rows = self._try_query(f"""
            SELECT TOP {int(limit)} [ترقيم تلقائي], [البيان], [القيمة], [التاريخ],
                   [المستخدم], [من], [إلى], [رقم الفاتورة], [المجموعة]
            FROM مدفوعات
            WHERE [البيان] LIKE ? OR [إلى] LIKE ? OR [رقم الفاتورة] LIKE ?
                  OR [المجموعة] LIKE ? OR [المستخدم] LIKE ?
            ORDER BY [التاريخ] DESC, [ترقيم تلقائي] DESC
        """, (like, like, like, like, like), [])
        total_cnt = self._try_scalar("""
            SELECT COUNT(*) FROM مدفوعات
            WHERE [البيان] LIKE ? OR [إلى] LIKE ? OR [رقم الفاتورة] LIKE ?
                  OR [المجموعة] LIKE ? OR [المستخدم] LIKE ?
        """, (like, like, like, like, like), 0)
        total_val = self._try_scalar("""
            SELECT SUM([القيمة]) FROM مدفوعات
            WHERE [البيان] LIKE ? OR [إلى] LIKE ? OR [رقم الفاتورة] LIKE ?
                  OR [المجموعة] LIKE ? OR [المستخدم] LIKE ?
        """, (like, like, like, like, like), 0)
        return {
            "data": [{"id": r.get("ترقيم تلقائي"), "statement": r.get("البيان", ""),
                      "value": float(r.get("القيمة", 0) or 0), "date": r.get("التاريخ", ""),
                      "to": r.get("إلى", ""), "group": r.get("المجموعة", ""),
                      "user": r.get("المستخدم", "")} for r in rows],
            "totals": {"count": int(total_cnt or 0), "value": float(total_val or 0)},
        }

    def payment_add(self, data):
        """إضافة دفعة جديدة"""
        if not data.get("value"):
            return {"success": False, "error": "القيمة مطلوبة"}
        iso_date = data.get("date") or datetime.datetime.now().strftime("%Y-%m-%d")
        return self.insert("مدفوعات", [{
            "البيان": data.get("statement", ""),
            "القيمة": data.get("value"),
            "التاريخ": iso_date,
            "المستخدم": data.get("user", ""),
            "من": data.get("from", ""),
            "إلى": data.get("to", ""),
            "رقم الفاتورة": data.get("invoice_no", ""),
            "المجموعة": data.get("group", ""),
        }])

    def payment_delete(self, pid):
        """حذف دفعة بمعرّفها"""
        return self.delete("مدفوعات", [{"ترقيم تلقائي": int(pid)}])

    # ---------------------------------------------------------
    # الطلبيات والشركات
    # ---------------------------------------------------------

    def orders_list(self, company=None, only_required=False, limit=500):
        """قائمة جدول الطلبية"""
        if not self._table_exists("جدول الطلبية"):
            return {"data": [], "count": 0, "total": 0, "has_more": False,
                    "note": "جدول «جدول الطلبية» غير موجود في القاعدة"}
        where_parts = []
        params = []
        if company:
            where_parts.append("[الشركة] = ?")
            params.append(company)
        if only_required:
            where_parts.append("[مطلوب] > 0")
        where = "WHERE " + " AND ".join(where_parts) if where_parts else ""

        rows = self._try_query(f"""
            SELECT TOP {int(limit)} [الشركة], [المادة], [مطلوب], [الرصيد],
                   [ك مشتريات], [ك مبيعات], [المستودع]
            FROM [جدول الطلبية] {where}
            ORDER BY [مطلوب] DESC
        """, params, [])
        total = self._try_scalar(f"SELECT COUNT(*) FROM [جدول الطلبية] {where}", params, 0)

        return {
            "data": [{"company": r.get("الشركة", ""), "material": r.get("المادة", ""),
                      "required_qty": float(r.get("مطلوب", 0) or 0),
                      "balance": float(r.get("الرصيد", 0) or 0),
                      "purchases_qty": float(r.get("ك مشتريات", 0) or 0),
                      "sales_qty": float(r.get("ك مبيعات", 0) or 0),
                      "warehouse": r.get("المستودع", "")} for r in rows],
            "count": len(rows), "total": int(total or 0),
            "has_more": len(rows) < int(total or 0),
        }

    def orders_by_company(self):
        """تجميع الطلبيات حسب الشركة"""
        if not self._table_exists("جدول الطلبية"):
            return {"companies": [], "totals": {"companies_count": 0, "items_count": 0,
                    "total_required": 0, "total_balance": 0},
                    "note": "جدول الطلبية غير موجود"}
        rows = self._try_query("""
            SELECT [الشركة], COUNT(*) AS cnt,
                   SUM([مطلوب]) AS req, SUM([الرصيد]) AS bal,
                   SUM([ك مشتريات]) AS pur, SUM([ك مبيعات]) AS sal
            FROM [جدول الطلبية]
            WHERE [الشركة] IS NOT NULL
            GROUP BY [الشركة]
            ORDER BY SUM([مطلوب]) DESC
        """, None, [])
        companies = [
            {"company": r.get("الشركة", ""), "items_count": int(r.get("cnt", 0) or 0),
             "total_required": float(r.get("req", 0) or 0),
             "total_balance": float(r.get("bal", 0) or 0),
             "total_purchases": float(r.get("pur", 0) or 0),
             "total_sales": float(r.get("sal", 0) or 0)}
            for r in rows
        ]
        return {
            "companies": companies,
            "totals": {
                "companies_count": len(companies),
                "items_count": sum(c["items_count"] for c in companies),
                "total_required": sum(c["total_required"] for c in companies),
                "total_balance": sum(c["total_balance"] for c in companies),
            },
        }

    def companies_list(self, only_required=False):
        """دليل الشركات"""
        if not self._table_exists("جدول الشركات"):
            return {"count": 0, "items": [], "note": "جدول الشركات غير موجود"}
        where = "WHERE [مطلوب] > 0" if only_required else ""
        rows = self._try_query(f"SELECT [الشركة], [مطلوب] FROM [جدول الشركات] {where} ORDER BY [الشركة]", None, [])
        return {"count": len(rows), "items": [
            {"name": r.get("الشركة", ""), "required_flag": bool(r.get("مطلوب", 0))}
            for r in rows
        ]}

    # ---------------------------------------------------------
    # سجل تغيّر الأسعار
    # ---------------------------------------------------------

    def audit_price_changes(self, q=None, manufacturer=None, limit=200):
        """سجل تغيّر الأسعار"""
        if not self._table_exists("آخر تعديل"):
            return {"data": [], "count": 0, "total": 0, "has_more": False,
                    "note": "جدول آخر تعديل غير موجود"}
        where_parts, params = [], []
        if q:
            like = "%" + q + "%"
            where_parts.append("([اسم المستحضر] LIKE ? OR [التركيب] LIKE ? OR [اسم المعمل] LIKE ?)")
            params.extend([like, like, like])
        if manufacturer:
            where_parts.append("[اسم المعمل] = ?")
            params.append(manufacturer)
        where = "WHERE " + " AND ".join(where_parts) if where_parts else ""

        rows = self._try_query(f"""
            SELECT TOP {int(limit)} [الرقم], [اسم المستحضر], [اسم المعمل], [التركيب],
                   [عيار المستحضر], [الشكل الصيدلاني], [التعبئة],
                   [السعر للصيدلي], [السعر للعموم], [ملاحظة]
            FROM [آخر تعديل] {where}
            ORDER BY [الرقم] DESC
        """, params, [])
        total = self._try_scalar(f"SELECT COUNT(*) FROM [آخر تعديل] {where}", params, 0)

        return {
            "data": [{"id": r.get("الرقم"), "product_name": r.get("اسم المستحضر", ""),
                      "manufacturer": r.get("اسم المعمل", ""),
                      "composition": r.get("التركيب", ""),
                      "strength": r.get("عيار المستحضر", ""),
                      "pharm_form": r.get("الشكل الصيدلاني", ""),
                      "packaging": r.get("التعبئة", ""),
                      "pharmacist_price": float(r.get("السعر للصيدلي", 0) or 0),
                      "public_price": float(r.get("السعر للعموم", 0) or 0),
                      "note": r.get("ملاحظة", "")} for r in rows],
            "count": len(rows), "total": int(total or 0),
            "has_more": len(rows) < int(total or 0),
        }

    def manufacturers(self):
        """قائمة المعامل من سجل الأسعار"""
        if not self._table_exists("آخر تعديل"):
            return {"count": 0, "items": [], "note": "جدول آخر تعديل غير موجود"}
        rows = self._try_query("""
            SELECT TOP 500 [اسم المعمل], COUNT(*) AS cnt, AVG([السعر للعموم]) AS avg
            FROM [آخر تعديل]
            WHERE [اسم المعمل] IS NOT NULL
            GROUP BY [اسم المعمل]
            ORDER BY COUNT(*) DESC
        """, None, [])
        return {"count": len(rows), "items": [
            {"name": r.get("اسم المعمل", ""), "items_count": int(r.get("cnt", 0) or 0),
             "avg_public_price": float(r.get("avg", 0) or 0)}
            for r in rows
        ]}

    # ---------------------------------------------------------
    # تنبيهات المخزون
    # ---------------------------------------------------------

    def low_stock(self, threshold=10):
        """المواد التي رصيدها أقل من حد"""
        rows = self._try_query(f"""
            SELECT TOP 500 [المادة], [الشركة], [ك صيدلية], [رقم الطبخة],
                   [تاريخ انتهاء الفعالية], [رمز الباركود], [السعر الأساسي]
            FROM [ك صيدلية]
            WHERE [ك صيدلية] < ? AND [ك صيدلية] >= 0
            ORDER BY [ك صيدلية] ASC
        """, (threshold,), [])
        if rows:
            return {"threshold": threshold, "count": len(rows), "items": [
                {"name": r.get("المادة", ""), "company": r.get("الشركة", ""),
                 "stock": float(r.get("ك صيدلية", 0) or 0),
                 "batch_no": r.get("رقم الطبخة", ""),
                 "exp_date": r.get("تاريخ انتهاء الفعالية", ""),
                 "barcode": r.get("رمز الباركود", ""),
                 "base_price": float(r.get("السعر الأساسي", 0) or 0)}
                for r in rows
            ], "source": "view"}
        # بديل من بطاقات المواد
        rows = self._try_query('SELECT TOP 500 [المادة], [الشركة], [رمز الباركود], [السعر الأساسي] FROM "بطاقات المواد" ORDER BY [المادة]', None, [])
        return {"threshold": threshold, "count": len(rows), "items": [
            {"name": r.get("المادة", ""), "company": r.get("الشركة", ""),
             "barcode": r.get("رمز الباركود", ""),
             "base_price": float(r.get("السعر الأساسي", 0) or 0),
             "note": "الرصيد غير متاح — فعّل عرض ك صيدلية"}
            for r in rows
        ], "source": "materials_table"}

    def expiring(self, days=90):
        """قرب الانتهاء خلال N يومًا"""
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        soon = (datetime.datetime.now() + datetime.timedelta(days=days)).strftime("%Y-%m-%d")
        rows = self._try_query(f"""
            SELECT TOP 500 [المادة], [الشركة], [ك صيدلية], [رقم الطبخة],
                   [تاريخ انتهاء الفعالية], [رمز الباركود], [السعر الأساسي]
            FROM [ك صيدلية]
            WHERE [تاريخ انتهاء الفعالية] IS NOT NULL
              AND [تاريخ انتهاء الفعالية] >= ?
              AND [تاريخ انتهاء الفعالية] <= ?
            ORDER BY [تاريخ انتهاء الفعالية] ASC
        """, (today, soon), [])
        items = []
        for r in rows:
            exp = str(r.get("تاريخ انتهاء الفعالية", ""))[:10]
            days_left = None
            try:
                d = datetime.datetime.strptime(exp, "%Y-%m-%d")
                days_left = (d - datetime.datetime.now()).days
            except Exception: pass
            items.append({
                "name": r.get("المادة", ""), "company": r.get("الشركة", ""),
                "stock": float(r.get("ك صيدلية", 0) or 0),
                "batch_no": r.get("رقم الطبخة", ""),
                "exp_date": exp, "days_left": days_left,
                "barcode": r.get("رمز الباركود", ""),
                "base_price": float(r.get("السعر الأساسي", 0) or 0),
            })
        return {"today": today, "until": soon, "days": days, "count": len(items), "items": items}

    def expired(self):
        """المنتهي صلاحيته"""
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        rows = self._try_query("""
            SELECT TOP 500 [المادة], [الشركة], [ك صيدلية], [رقم الطبخة],
                   [تاريخ انتهاء الفعالية], [رمز الباركود], [السعر الأساسي]
            FROM [ك صيدلية]
            WHERE [تاريخ انتهاء الفعالية] IS NOT NULL
              AND [تاريخ انتهاء الفعالية] < ?
            ORDER BY [تاريخ انتهاء الفعالية] ASC
        """, (today,), [])
        items = []
        for r in rows:
            exp = str(r.get("تاريخ انتهاء الفعالية", ""))[:10]
            days_overdue = None
            try:
                d = datetime.datetime.strptime(exp, "%Y-%m-%d")
                days_overdue = (datetime.datetime.now() - d).days
            except Exception: pass
            items.append({
                "name": r.get("المادة", ""), "company": r.get("الشركة", ""),
                "stock": float(r.get("ك صيدلية", 0) or 0),
                "batch_no": r.get("رقم الطبخة", ""),
                "exp_date": exp, "days_overdue": days_overdue,
                "barcode": r.get("رمز الباركود", ""),
                "base_price": float(r.get("السعر الأساسي", 0) or 0),
            })
        return {"today": today, "count": len(items), "items": items}

    def valuation(self):
        """تقييم قيمة المخزون"""
        rows = self._try_query("""
            SELECT COUNT(*) AS cnt,
                   SUM([ك صيدلية]) AS qty,
                   SUM([ك صيدلية] * [التكلفة]) AS cost_val,
                   SUM([ك صيدلية] * [السعر الأساسي]) AS retail_val
            FROM [ك صيدلية]
            WHERE [ك صيدلية] > 0
        """, None, [])
        r = rows[0] if rows else {}
        result = {
            "items_count": int(r.get("cnt", 0) or 0),
            "total_units": float(r.get("qty", 0) or 0),
            "total_cost_value": float(r.get("cost_val", 0) or 0),
            "total_retail_value": float(r.get("retail_val", 0) or 0),
            "expected_profit": 0.0,
            "by_category": [], "by_company": [],
        }
        result["expected_profit"] = result["total_retail_value"] - result["total_cost_value"]

        # تجميع حسب الشركة
        try:
            rows = self.query("""
                SELECT IIF([الشركة] IS NULL, 'غير محدد', [الشركة]) AS company,
                       COUNT(*) AS cnt, SUM([ك صيدلية]) AS qty,
                       SUM([ك صيدلية] * [السعر الأساسي]) AS val
                FROM [ك صيدلية]
                WHERE [ك صيدلية] > 0
                GROUP BY [الشركة]
                ORDER BY SUM([ك صيدلية] * [السعر الأساسي]) DESC
            """)
            result["by_company"] = [
                {"company": r.get("company", ""), "count": int(r.get("cnt", 0) or 0),
                 "qty": float(r.get("qty", 0) or 0), "value": float(r.get("val", 0) or 0)}
                for r in rows
            ]
        except Exception: pass
        return result

    # ---------------------------------------------------------
    # المستخدمون
    # ---------------------------------------------------------

    def users_list(self):
        """قائمة المستخدمين — تكتشف الأعمدة تلقائيًا"""
        cols = self.cols.get("المستخدم", {})
        if not cols:
            return {"available": False, "users": [], "message": "جدول المستخدم غير موجود"}
        name_col = "المستخدم" if "المستخدم" in cols else ("الاسم" if "الاسم" in cols else None)
        if not name_col:
            return {"available": False, "users": [], "message": "لا يوجد عمود اسم"}
        rows = self._try_query(f'SELECT [{name_col}] AS name FROM [المستخدم]', None, [])
        return {
            "available": True, "columns": list(cols.keys()),
            "count": len(rows), "users": [{"name": r.get("name", ""), "role": "user"} for r in rows],
        }


DAO = None          # يبقى None حتى ينجح الاتصال — يمكن اختيار القاعدة من البرنامج


def connect_dao(path):
    """اتصال جديد بمسار قاعدة — يُستخدم عند الإقلاع وعند اختيار ملف من البرنامج"""
    global DAO
    d = Dao(path)
    DAO = d
    return d


# ================== دوال التحديث الذاتي من GitHub (v101) ==================
def _fetch_bytes(rel, timeout=10):
    """تنزيل ملف من GitHub (تجربة مصدرَين) — يعيد bytes أو يرمي"""
    last_err = None
    for base in UPDATE_SOURCES:
        try:
            url = base + urllib.parse.quote(rel)
            req = urllib.request.Request(url, headers={"User-Agent": "apotheca-bridge-v" + BRIDGE_VERSION})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            last_err = e
    raise last_err if last_err else IOError("no source worked")


def _fetch_text(rel, timeout=10):
    """تنزيل ملف نصي من GitHub"""
    return _fetch_bytes(rel, timeout).decode("utf-8", errors="replace")


def auto_update_on_startup():
    """يفحص وجود إصدار جديد عند الإقلاع، ويحدّث الملفات تلقائيًا (صامت)"""
    if not AUTO_UPDATE_ENABLED:
        return
    print("[تحديث ذاتي] فحص GitHub عن إصدار جديد...")
    try:
        remote_v = _fetch_text("version.txt", 10).strip()
        if not remote_v:
            print("[تحديث ذاتي] تعذر قراءة version.txt البعيد — أكمل بالإصدار الحالي.")
            return
        if remote_v == BRIDGE_VERSION:
            # حدّث dashboard.html فقط (قد يتغير دون تغيير رقم الإصدار)
            _try_update_file("templates/dashboard.html", "dashboard.html", min_bytes=1000)
            print("[تحديث ذاتي] أنت على آخر إصدار v" + BRIDGE_VERSION + ".")
            return
        print("[تحديث ذاتي] إصدار جديد متاح: v" + remote_v + " (المحلي v" + BRIDGE_VERSION + ").")
        # حدّث dashboard.html
        _try_update_file("templates/dashboard.html", "dashboard.html", min_bytes=1000)
        # حدّث الجسر نفسه — لكن لا يُطبَّق إلا بعد إعادة التشغيل
        updated_bridge = _try_update_file("جسر_أكسس.py", "جسر_أكسس.py", min_bytes=5000)
        if updated_bridge:
            print("[تحديث ذاتي] ✓ تم تحديث جسر_أكسس.py — أعد تشغيل تشغيل_الجسر.bat لتطبيقه.")
    except Exception as e:
        print("[تحديث ذاتي] ✗ تعذر الوصول لمصدر التحديث:", str(e)[:120])
        print("[تحديث ذاتي] أكمل بالإصدار الحالي — سيعاود المحاولة في الإقلاع القادم.")


def _try_update_file(remote_rel, local_name, min_bytes=1000):
    """تنزيل ملف من GitHub وحفظه بجانب الجسر مع نسخة احتياطية"""
    try:
        content = _fetch_bytes(remote_rel, 15)
        if not content or len(content) < min_bytes:
            return False
        local_path = os.path.join(BASE_DIR, local_name)
        if os.path.exists(local_path):
            bak = local_path + ".bak"
            try:
                shutil.copy2(local_path, bak)
            except Exception:
                pass
        with open(local_path, "wb") as f:
            f.write(content)
        print("[تحديث ذاتي] ✓ حدّث " + local_name + " (" + str(len(content)) + " bytes).")
        return True
    except Exception as e:
        print("[تحديث ذاتي] ✗ فشل تحديث " + local_name + ": " + str(e)[:100])
        return False


# ================== نافذة اختيار الملف الأصلية (tkinter في الخيط الرئيسي) ==================
def pick_loop():
    """حلقة الخيط الرئيسي: تفتح نافذة اختيار ملف أكسس عند طلب /pick"""
    while True:
        req = PICK_Q.get()
        if req is None:
            break
        ev, out = req
        path, err = None, None
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            try:
                root.attributes("-topmost", True)
            except Exception:
                pass
            initdir = ""
            try:
                d = os.path.dirname(CFG.get("db_path") or "")
                if os.path.isdir(d):
                    initdir = d
            except Exception:
                pass
            path = filedialog.askopenfilename(
                title="اختر ملف قاعدة بيانات أكسس",
                initialdir=initdir,
                filetypes=[("قواعد بيانات أكسس", "*.accdb *.mdb"),
                           ("كل الملفات", "*.*")])
            root.destroy()
        except Exception as e:
            err = str(e)
        out["path"] = path
        out["err"] = err
        ev.set()


# ================== خادم HTTP المحلي ==================
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, body, code=200, cache=False):
        """إرسال صفحة HTML مع رؤوس مناسبة"""
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        if not cache:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(data)

    def _send_file(self, path, mime="text/html; charset=utf-8"):
        """إرسال ملف من القرص"""
        try:
            with open(path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self._send({"ok": False, "error": "فشل قراءة الملف: " + str(e)[:200]}, 500)

    def _qs(self):
        """تحليل query string إلى dict"""
        parsed = urlparse(self.path)
        return {k: v[0] for k, v in parse_qs(parsed.query).items()}

    def log_message(self, *a):
        pass

    def do_GET(self):
        p = self.path.split("?")[0]
        try:
            if p in ("/", "/ping"):
                if DAO is not None:
                    self._send(DAO.ping())
                else:
                    self._send({"ok": True, "connected": False, "db": CFG.get("db_path", ""),
                                "backend": "", "read_only": bool(CFG.get("read_only")),
                                "tables": [], "bridge_version": BRIDGE_VERSION})
            elif p == "/pick":
                self._pick()
            elif p == "/dashboard":
                self._serve_dashboard()
            elif p == "/api/bridge-version":
                self._send({"version": BRIDGE_VERSION, "auto_update": AUTO_UPDATE_ENABLED,
                            "repo": UPDATE_REPO, "branch": UPDATE_BRANCH})
            elif p == "/api/bridge-update-check":
                self._bridge_update_check()
            elif p.startswith("/api/table/"):
                if DAO is None:
                    raise ValueError("لم يتم اختيار قاعدة البيانات بعد — استخدم زر اختيار القاعدة في البرنامج")
                from urllib.parse import unquote
                self._send(DAO.table(unquote(p[len("/api/table/"):])))
            elif p == "/api/reports/dashboard-stats":
                self._require_dao()
                self._send(DAO.dashboard_stats())
            elif p == "/api/reports/sales-summary":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.sales_summary(
                    qs.get("start_date", ""),
                    qs.get("end_date", ""),
                    qs.get("group_by", "day")))
            elif p == "/api/reports/top-selling":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.top_selling(
                    qs.get("start_date", ""),
                    qs.get("end_date", ""),
                    int(qs.get("limit", 20))))
            elif p == "/api/reports/sales-by-buyer":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.sales_by_buyer(qs.get("start_date", ""), qs.get("end_date", "")))
            elif p == "/api/reports/purchases-summary":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.purchases_summary(qs.get("start_date", ""), qs.get("end_date", "")))
            elif p == "/api/payments":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.payments_list(
                    qs.get("start_date", ""),
                    qs.get("end_date", ""),
                    qs.get("group"),
                    int(qs.get("limit", 500))))
            elif p == "/api/payments/totals":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.payments_totals(qs.get("start_date", ""), qs.get("end_date", "")))
            elif p == "/api/payments/search":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.payments_search(qs.get("q", ""), int(qs.get("limit", 200))))
            elif p == "/api/payments/export.csv":
                self._require_dao()
                qs = self._qs()
                self._payments_csv(qs.get("start_date", ""), qs.get("end_date", ""))
            elif p == "/api/export/sales.csv":
                self._require_dao()
                qs = self._qs()
                self._generic_csv("مبيعات",
                    ["المادة", "الكمية", "سعر المبيع", "حسم %", "رقم الطبخة",
                     "رقم الفاتورة", "المستخدم", "من", "إلى", "التاريخ", "الوقت"],
                    '"التاريخ" BETWEEN ? AND ?', [qs.get("start_date", "1970-01-01"), qs.get("end_date", datetime.datetime.now().strftime("%Y-%m-%d"))],
                    "sales_" + qs.get("start_date", "") + "_" + qs.get("end_date", "") + ".csv")
            elif p == "/api/export/purchases.csv":
                self._require_dao()
                qs = self._qs()
                self._generic_csv("مشتريات",
                    ["المادة", "الكمية", "المجاني", "سعر الشراء", "حسم %", "رقم الطبخة",
                     "تاريخ الصنع", "تاريخ انتهاء الفعالية", "رقم الفاتورة", "المستخدم",
                     "من", "إلى", "التاريخ", "الوقت", "ملاحظات", "البيان"],
                    '"التاريخ" BETWEEN ? AND ?', [qs.get("start_date", "1970-01-01"), qs.get("end_date", datetime.datetime.now().strftime("%Y-%m-%d"))],
                    "purchases_" + qs.get("start_date", "") + "_" + qs.get("end_date", "") + ".csv")
            elif p == "/api/export/materials.csv":
                self._require_dao()
                cols_list = list(self.cols.get("بطاقات المواد", {}).keys()) or ["المادة", "الشركة", "السعر الأساسي"]
                self._generic_csv("بطاقات المواد", cols_list, "", [], "materials.csv")
            elif p == "/api/export/backup.json":
                self._require_dao()
                self._backup_json()
            elif p == "/api/orders":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.orders_list(
                    qs.get("company"),
                    qs.get("only_required") == "1",
                    int(qs.get("limit", 500))))
            elif p == "/api/orders/by-company":
                self._require_dao()
                self._send(DAO.orders_by_company())
            elif p == "/api/companies":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.companies_list(qs.get("only_required") == "1"))
            elif p == "/api/audit/price-changes":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.audit_price_changes(
                    qs.get("q"),
                    qs.get("manufacturer"),
                    int(qs.get("limit", 200))))
            elif p == "/api/audit/manufacturers":
                self._require_dao()
                self._send(DAO.manufacturers())
            elif p == "/api/inventory/low-stock":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.low_stock(float(qs.get("threshold", 10))))
            elif p == "/api/inventory/expiring":
                self._require_dao()
                qs = self._qs()
                self._send(DAO.expiring(int(qs.get("days", 90))))
            elif p == "/api/inventory/expired":
                self._require_dao()
                self._send(DAO.expired())
            elif p == "/api/inventory/valuation":
                self._require_dao()
                self._send(DAO.valuation())
            elif p == "/api/users":
                self._require_dao()
                self._send(DAO.users_list())
            else:
                self._send({"ok": False, "error": "مسار غير معروف", "path": p}, 404)
        except Exception as e:
            self._send({"ok": False, "error": str(e)[:300]}, 500)

    def _require_dao(self):
        if DAO is None:
            raise ValueError("لم يتم اختيار قاعدة البيانات بعد — استخدم زر اختيار القاعدة في البرنامج")

    def _serve_dashboard(self):
        """Serve dashboard page from disk, or a fallback page if missing."""
        dash_path = os.path.join(BASE_DIR, "dashboard.html")
        if os.path.exists(dash_path):
            self._send_file(dash_path)
            return
        # Fallback simple page if dashboard.html is not installed yet
        html = (
            '<!DOCTYPE html>\n'
            '<html lang="ar" dir="rtl"><head><meta charset="UTF-8">'
            '<title>لوحة المعلومات — غير منصبة</title>'
            '<style>body{font-family:Tahoma;background:#f5f6fa;color:#2c3e50;padding:40px;text-align:center}'
            '.box{max-width:600px;margin:auto;background:white;padding:30px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}'
            'h1{color:#2a5298}code{background:#ecf0f1;padding:2px 6px;border-radius:4px;font-family:Consolas}</style>'
            '</head><body><div class="box">'
            '<h1>لوحة المعلومات غير منصبة بعد</h1>'
            '<p>ملف <code>dashboard.html</code> غير موجود بجانب جسر_أكسس.py</p>'
            '<p>ضع الملف بجانب الجسر ثم أعد فتح هذه الصفحة.</p>'
            '<p style="margin-top:20px;color:#7f8c8d">إصدار الجسر: v' + BRIDGE_VERSION + '</p>'
            '</div></body></html>'
        )
        self._send_html(html)

    def _payments_csv(self, start_date, end_date):
        """تصدير المدفوعات CSV مع UTF-8 BOM"""
        data = DAO.payments_list(start_date, end_date, limit=10000)
        import io
        buf = io.StringIO()
        buf.write("\ufeff")
        buf.write("ترقيم,البيان,القيمة,التاريخ,المستخدم,من,إلى,رقم الفاتورة,المجموعة\r\n")
        for p in data.get("data", []):
            row = [str(p.get("id", "")), p.get("statement", ""), str(p.get("value", "")),
                   p.get("date", ""), p.get("user", ""), p.get("from", ""),
                   p.get("to", ""), p.get("invoice_no", ""), p.get("group", "")]
            # csv_quote_minimal
            out = []
            for v in row:
                s = "" if v is None else str(v)
                if any(c in s for c in [",", '"', "\n", "\r"]):
                    s = '"' + s.replace('"', '""') + '"'
                out.append(s)
            buf.write(",".join(out) + "\r\n")
        body = buf.getvalue().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Disposition",
                         'attachment; filename="payments_' + start_date + '_' + end_date + '.csv"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _generic_csv(self, table, columns, where_clause, where_params, filename):
        """تصدير عام لأي جدول إلى CSV — يستخدم DAO.query"""
        import io
        col_sql = ", ".join("[" + c + "]" for c in columns)
        where_sql = (" WHERE " + where_clause) if where_clause else ""
        sql = "SELECT " + col_sql + " FROM [" + table + "]" + where_sql
        try:
            rows = DAO.query(sql, where_params if where_params else None)
        except Exception as e:
            self._send({"ok": False, "error": "فشل الاستعلام: " + str(e)[:200]}, 500)
            return
        buf = io.StringIO()
        buf.write("\ufeff")  # UTF-8 BOM
        # رأس
        def csv_row(vals):
            out = []
            for v in vals:
                s = "" if v is None else str(v)
                if any(c in s for c in [",", '"', "\n", "\r"]):
                    s = '"' + s.replace('"', '""') + '"'
                out.append(s)
            return ",".join(out)
        buf.write(csv_row(columns) + "\r\n")
        for r in rows:
            buf.write(csv_row([r.get(c, "") for c in columns]) + "\r\n")
        body = buf.getvalue().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Disposition", 'attachment; filename="' + filename + '"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _backup_json(self):
        """نسخة احتياطية JSON لكل الجداول المسموحة"""
        backup = {
            "metadata": {
                "app": "Apotheca Bridge",
                "bridge_version": BRIDGE_VERSION,
                "exported_at": datetime.datetime.now().isoformat(),
                "tables": ALLOWED_TABLES,
            },
            "tables": {},
        }
        for table in ALLOWED_TABLES:
            try:
                if table not in DAO.cols:
                    backup["tables"][table] = {"count": 0, "rows": [],
                                                "note": "غير موجود في القاعدة المتصلة"}
                    continue
                result = DAO.table(table)
                rows = result.get("rows", [])
                backup["tables"][table] = {"count": len(rows), "rows": rows}
            except Exception as e:
                backup["tables"][table] = {"count": 0, "rows": [], "error": str(e)[:200]}
        body = json.dumps(backup, ensure_ascii=False, indent=2, default=str).encode("utf-8")
        fname = "apotheca_backup_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S") + ".json"
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Disposition", 'attachment; filename="' + fname + '"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _bridge_update_check(self):
        """يفحص GitHub عن إصدار أحدث من الجسر ولوحة المعلومات، ثم يحدّثهما تلقائيًا"""
        if not AUTO_UPDATE_ENABLED:
            self._send({"enabled": False, "message": "التحديث الذاتي معطّل"})
            return
        info = {"current_version": BRIDGE_VERSION, "checked_at": datetime.datetime.now().isoformat(),
                "updates": [], "errors": []}
        # اقرأ version.txt البعيد
        try:
            remote_v = _fetch_text("version.txt").strip()
            info["remote_version"] = remote_v
            if remote_v and remote_v != BRIDGE_VERSION:
                info["update_available"] = True
                info["message"] = "إصدار جديد متاح: v" + remote_v + " — سيُحدّث الجسر نفسه"
            else:
                info["update_available"] = False
                info["message"] = "أنت على آخر إصدار"
        except Exception as e:
            info["errors"].append("version.txt: " + str(e)[:120])
            info["update_available"] = False
        # حدّث dashboard.html من GitHub دائمًا (لأنه قد يتغير دون تغيير رقم الإصدار)
        try:
            content = _fetch_bytes("templates/dashboard.html")
            if content and len(content) > 1000:
                dash_path = os.path.join(BASE_DIR, "dashboard.html")
                # احفظ نسخة احتياطية إن وُجدت
                if os.path.exists(dash_path):
                    bak = dash_path + ".bak"
                    try: shutil.copy2(dash_path, bak)
                    except Exception: pass
                with open(dash_path, "wb") as f:
                    f.write(content)
                info["updates"].append({"file": "dashboard.html", "bytes": len(content)})
        except Exception as e:
            info["errors"].append("dashboard.html: " + str(e)[:120])
        # حدّث الجسر نفسه إن توفّر إصدار جديد
        if info.get("update_available"):
            try:
                content = _fetch_bytes("جسر_أكسس.py")
                if content and len(content) > 5000:
                    bridge_path = os.path.join(BASE_DIR, "جسر_أكسس.py")
                    bak = bridge_path + ".bak"
                    if os.path.exists(bridge_path):
                        try: shutil.copy2(bridge_path, bak)
                        except Exception: pass
                    with open(bridge_path, "wb") as f:
                        f.write(content)
                    info["updates"].append({"file": "جسر_أكسس.py", "bytes": len(content),
                                            "note": "أعد تشغيل الجسر لتطبيق التحديث"})
            except Exception as e:
                info["errors"].append("جسر_أكسس.py: " + str(e)[:120])
        self._send(info)

    def _pick(self):
        """يفتح نافذة اختيار ملف القاعدة على هذا الجهاز ويعيد المسار"""
        if not TK_OK:
            self._send({"ok": False,
                        "error": "نافذة الاختيار غير متاحة (tkinter غير مثبت) — "
                                 "اكتب المسار يدويًا في ملف إعدادات_الجسر.json"}, 500)
            return
        ev = threading.Event()
        out = {}
        PICK_Q.put((ev, out))
        if not ev.wait(300):   # 5 دقائق كحد أقصى لاختيار الملف
            self._send({"ok": False, "error": "انتهت مهلة اختيار الملف"}, 500)
            return
        if out.get("err"):
            self._send({"ok": False, "error": str(out["err"])[:300]}, 500)
            return
        if not out.get("path"):
            self._send({"ok": True, "canceled": True})
            return
        self._send({"ok": True, "path": out["path"]})

    def do_POST(self):
        p = self.path.split("?")[0]
        try:
            ln = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(ln).decode("utf-8") or "{}")
            if p == "/api/config":
                self._config(body)
                return
            # v101: مسارات المدفوعات الجديدة
            if p == "/api/payments/add":
                self._require_dao()
                self._send(DAO.payment_add(body))
                return
            if p == "/api/payments/delete":
                self._require_dao()
                pid = body.get("id")
                if not pid:
                    self._send({"success": False, "error": "id مطلوب"})
                    return
                self._send(DAO.payment_delete(pid))
                return
            parts = [x for x in p.split("/") if x]  # api/<table>/<op>
            if len(parts) != 3:
                raise ValueError("مسار غير صحيح")
            _, t, op = parts
            from urllib.parse import unquote
            t = unquote(t)
            if DAO is None:
                raise ValueError("لم يتم اختيار قاعدة البيانات بعد — استخدم زر اختيار القاعدة في البرنامج")
            if op == "insert":
                self._send(DAO.insert(t, body.get("rows", [])))
            elif op == "update":
                self._send(DAO.update(t, body.get("rows", [])))
            elif op == "delete":
                self._send(DAO.delete(t, body.get("rows", [])))
            else:
                self._send({"ok": False, "error": "عملية غير معروفة"}, 404)
        except Exception as e:
            self._send({"ok": False, "error": str(e)[:300]}, 500)

    def _config(self, body):
        """اختيار قاعدة من البرنامج: db_path (إلزامي) + read_only (اختياري)"""
        global CFG
        p = str(body.get("db_path") or "").strip().strip('"')
        if not p:
            raise ValueError("لم يُرسل مسار قاعدة البيانات")
        if not os.path.exists(p):
            raise ValueError("الملف غير موجود: " + p)
        ro = bool(body.get("read_only", CFG.get("read_only") or False))
        connect_dao(p)          # يرمي خطأ واضحًا إن فشل الاتصال — يصل الحوار في البرنامج
        CFG["db_path"] = p
        CFG["read_only"] = ro
        save_cfg()
        print("✓ تغيّرت قاعدة البيانات من البرنامج إلى: " + p)
        self._send(DAO.ping())


def main():
    load_cfg()
    print("=" * 56)
    print("   جسر قاعدة البيانات — فاتورة مشتريات (أكسس بدون تحويل)")
    print("   إصدار الجسر: v" + BRIDGE_VERSION + " — مع لوحة معلومات وتحديث ذاتي")
    print("=" * 56)

    # v101: التحديث الذاتي عند الإقلاع (صامت — لا يوقف العمل عند الفشل)
    try:
        auto_update_on_startup()
    except Exception as e:
        print("[تحديث ذاتي] ✗ خطأ غير متوقع:", str(e)[:100])

    print("")
    print("القاعدة: " + CFG["db_path"])
    try:
        connect_dao(CFG["db_path"])
    except Exception as e:
        print(str(e))
        print("الجسر سيعمل رغم ذلك — اختر ملف القاعدة من داخل البرنامج")
        print("(حوار «الاتصال بقاعدة البيانات» عند أول فتح، أو من الإعدادات).")
    port = int(CFG.get("port") or DEFAULT_PORT)
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print("")
    print("الجسر يعمل الآن: http://127.0.0.1:%d" % port)
    print("افتح «فاتورة مشتريات.html» كالمعتاد — سيكتشف الجسر تلقائيًا.")
    print("لوحة المعلومات الجديدة: http://127.0.0.1:%d/dashboard" % port)
    print("(اترك هذه النافذة مفتوحة أثناء العمل — إغلاقها يفصل البرنامج عن القاعدة)")
    try:
        pick_loop()   # الخيط الرئيسي حصريًا لنوافذ اختيار الملف
    except KeyboardInterrupt:
        print("\nأُغلق الجسر.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
