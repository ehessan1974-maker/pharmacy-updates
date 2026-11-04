# -*- coding: utf-8 -*-
"""
جسر قاعدة البيانات — فاتورة مشتريات (نسخة أكسس HTML)
=====================================================
يربط برنامج «فاتورة مشتريات.html» مباشرة بقاعدة أكسس الأصلية MDB_be.accdb
بدون أي تحويل: الملف نفسه هو قاعدة البيانات الوحيدة — قراءة وكتابة فورية.

التشغيل:  python جسر_أكسس.py      (أو انقر تشغيل_الجسر.bat)
الإعدادات: ملف إعدادات_الجسر.json بجانب هذا الملف (يُنشأ تلقائيًا):
    db_path    = مسار قاعدة البيانات (الافتراضي E:\\تقسيم قاعدة البيانات\\MDB_be.accdb)
    port       = منفذ الخادم المحلي (الافتراضي 8765)
    read_only  = true لمنع أي كتابة (الافتراضي false)

البرنامج (HTML) يكتشف الجسر تلقائيًا عند فتحه على نفس الجهاز.
"""
import json
import os
import sys
import threading
import datetime
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
ALLOWED_TABLES = ["مشتريات", "بطاقات المواد", "المستخدم"]

CFG = {"db_path": DEFAULT_DB, "port": DEFAULT_PORT, "read_only": False}


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


# ================== طبقة الوصول لقاعدة الأكسس ==================
class Dao:
    """واجهة موحدة فوق pyodbc (ODBC) أو adodbapi (OLE DB) — تُجرّب بالترتيب"""

    def __init__(self, db_path):
        self.db_path = db_path
        self.kind = "odbc"
        self.lock = threading.RLock()
        self.conn = None
        self.backend = ""
        self.cols = {}       # table -> {col: odbc_type_code}
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
                "\nصحّح المسار في ملف إعدادات_الجسر.json")
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

    def _conv_in(self, col, t, v):
        """قيمة قادمة من البرنامج → قيمة تُكتب في أكسس"""
        if v is None or v == "":
            return None
        if self._is_num(t):
            s = str(v).replace("،", "").replace(",", "").strip()
            f = float(s)
            return int(f) if f == int(f) and t in (2, 4, 5, 16, 17, 18, 19, 20, 21, -5, -6) else f
        if self._is_date(t):
            s = str(v).strip()
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
                        "%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
                try:
                    return datetime.datetime.strptime(s, fmt)
                except ValueError:
                    pass
            raise ValueError("تاريخ غير مفهوم: " + s)
        return str(v)

    @staticmethod
    def _conv_out(v):
        if isinstance(v, (datetime.datetime, datetime.date)):
            if isinstance(v, datetime.datetime) and (v.hour or v.minute or v.second):
                return v.strftime("%Y-%m-%d %H:%M:%S")
            return v.strftime("%Y-%m-%d")
        return v

    # ---------- العمليات ----------
    def ping(self):
        with self.lock:
            return {"ok": True, "db": self.db_path, "backend": self.backend,
                    "read_only": bool(CFG.get("read_only")),
                    "tables": [t for t in ALLOWED_TABLES if t in self.cols]}

    def table(self, name):
        if name not in ALLOWED_TABLES or name not in self.cols:
            raise ValueError("جدول غير مسموح: " + name)
        with self.lock:
            cur = self.conn.cursor()
            cur.execute("SELECT * FROM [" + name + "]")
            names = [d[0] for d in cur.description]
            rows = [dict(zip(names, (self._conv_out(v) for v in row)))
                    for row in cur.fetchall()]
            cur.close()
        return {"ok": True, "cols": names, "rows": rows}

    def _validate(self, name, data):
        if name not in ALLOWED_TABLES or name not in self.cols:
            raise ValueError("جدول غير مسموح: " + name)
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


DAO = None


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
                self._send(DAO.ping())
            elif p.startswith("/api/table/"):
                from urllib.parse import unquote
                self._send(DAO.table(unquote(p[len("/api/table/"):])))
            else:
                self._send({"ok": False, "error": "مسار غير معروف"}, 404)
        except Exception as e:
            self._send({"ok": False, "error": str(e)[:300]}, 500)

    def do_POST(self):
        p = self.path.split("?")[0]
        try:
            ln = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(ln).decode("utf-8") or "{}")
            parts = [x for x in p.split("/") if x]  # api/<table>/<op>
            if len(parts) != 3:
                raise ValueError("مسار غير صحيح")
            _, t, op = parts
            from urllib.parse import unquote
            t = unquote(t)
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


def main():
    global DAO
    load_cfg()
    print("=" * 56)
    print("   جسر قاعدة البيانات — فاتورة مشتريات (أكسس بدون تحويل)")
    print("=" * 56)
    print("القاعدة: " + CFG["db_path"])
    try:
        DAO = Dao(CFG["db_path"])
    except Exception as e:
        print(str(e))
        input("اضغط Enter للإغلاق...")
        return 1
    port = int(CFG.get("port") or DEFAULT_PORT)
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("الجسر يعمل الآن: http://127.0.0.1:%d" % port)
    print("افتح «فاتورة مشتريات.html» كالمعتاد — سيكتشف الجسر تلقائيًا.")
    print("(اترك هذه النافذة مفتوحة أثناء العمل — إغلاقها يفصل البرنامج عن القاعدة)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nأُغلق الجسر.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
