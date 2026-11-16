# -*- coding: utf-8 -*-
"""
جسر قاعدة البيانات — Apotheca (نسخة أكسس HTML)
=====================================================
يربط برنامج «Apotheca.html» مباشرة بقاعدة أكسس الأصلية MDB_be.accdb
بدون أي تحويل: الملف نفسه هو قاعدة البيانات الوحيدة — قراءة وكتابة فورية.

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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

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


DAO = None          # يبقى None حتى ينجح الاتصال — يمكن اختيار القاعدة من البرنامج


def connect_dao(path):
    """اتصال جديد بمسار قاعدة — يُستخدم عند الإقلاع وعند اختيار ملف من البرنامج"""
    global DAO
    d = Dao(path)
    DAO = d
    return d


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
                                "tables": []})
            elif p == "/pick":
                self._pick()
            elif p.startswith("/api/table/"):
                if DAO is None:
                    raise ValueError("لم يتم اختيار قاعدة البيانات بعد — استخدم زر اختيار القاعدة في البرنامج")
                from urllib.parse import unquote
                self._send(DAO.table(unquote(p[len("/api/table/"):])))
            else:
                self._send({"ok": False, "error": "مسار غير معروف"}, 404)
        except Exception as e:
            self._send({"ok": False, "error": str(e)[:300]}, 500)

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
    print("   جسر قاعدة البيانات — Apotheca (أكسس بدون تحويل)")
    print("=" * 56)
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
    print("الجسر يعمل الآن: http://127.0.0.1:%d" % port)
    print("افتح «Apotheca.html» كالمعتاد — سيكتشف الجسر تلقائيًا.")
    print("(اترك هذه النافذة مفتوحة أثناء العمل — إغلاقها يفصل البرنامج عن القاعدة)")
    try:
        pick_loop()   # الخيط الرئيسي حصريًا لنوافذ اختيار الملف
    except KeyboardInterrupt:
        print("\nأُغلق الجسر.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
