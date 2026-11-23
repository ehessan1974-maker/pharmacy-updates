# -*- coding: utf-8 -*-
"""test_db_adapters.py — v110: دورة كاملة (حفظ فاتورة، قراءتها، تعديلها، حذفها، تحديث الرصيد)
على كل نوع قاعدة مدعوم: SQLite الملفية، TXT/JSON (مجلد + حزمة)، CSV، Excel، محاكي Access.
+ ترحيل بين النوعين مع تحقق تطابق السجلات.
تشغيل: python -m pytest tests/test_db_adapters.py -v   (أو unittest)
"""
import os
import sys
import json
import shutil
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import ensure_invoice_schema, INVOICE_TABLE_COLUMNS          # noqa: E402
from db_adapters.base import DBError                                  # noqa: E402
from db_adapters.factory import create_adapter, save_config, base_dir  # noqa: E402
from db_adapters import migrate                                       # noqa: E402

CREATE_K_TABLE = """CREATE TABLE IF NOT EXISTS "جدول ك صيدلية" (
    "المادة" TEXT, "الشركة" TEXT, "التكلفة" NUMERIC, "عموم" NUMERIC,
    "ك صيدلية" NUMERIC, "رقم الطبخة" TEXT, "تاريخ الصنع" TEXT,
    "تاريخ انتهاء الفعالية" TEXT, "رمز الباركود" TEXT, "ك مشتريات" NUMERIC,
    "ك مبيعات" NUMERIC, "التصنيف" TEXT, "التركيب الكيميائي" TEXT,
    "الرمز" TEXT, "السعر الأساسي" NUMERIC)"""

INVOICE_ITEM = {
    "name": "دواء تجريبي 500 ملغ",
    "quantity": 3,
    "sellPrice": 100.0,
    "discountPercent": 10.0,
    "discountValue": 30.0,
    "totalAfterDiscount": 270.0,
    "batchNo": "L77",
    "cost": 60.0,
    "totalCost": 180.0,
    "totalBeforeDiscount": 300.0,
    "totalProfit": 90.0,
    "receivedAmount": 270.0,
    "إيصال_نسبة_الربح_إلى": 33.33,
    "profitPercentReal": 25.0,
}

ITEM_COLUMNS = [
    "المادة", "الكمية", "سعر المبيع", "حسم %", "قيمة الحسم", "الإجمالي بعد الحسم",
    "رقم الطبخة", "التكلفة", "إجمالي التكلفة", "الإجمالي قبل الحسم",
    "إجمالي الربح", "المبلغ المقبوض من مادة واحدة", "إيصال نسبة الربح إلى", "نسبة الربح",
]


def item_row(item):
    return (
        item["name"], item["quantity"], item["sellPrice"], item["discountPercent"],
        item["discountValue"], item["totalAfterDiscount"], item["batchNo"], item["cost"],
        item["totalCost"], item["totalBeforeDiscount"], item["totalProfit"],
        item["receivedAmount"], item["إيصال_نسبة_الربح_إلى"], item["profitPercentReal"],
    )


class AdapterCycle:
    """دورة كاملة موحّدة تُنفَّذ على أي محوّل."""

    def __init__(self, adapter):
        self.adapter = adapter

    def run(self):
        a = self.adapter
        a.connect()
        try:
            # 1) إنشاء المخطط الكامل
            conn = a.get_conn()
            ensure_invoice_schema(conn)
            conn.execute(CREATE_K_TABLE)
            conn.commit()

            # 2) إنشاء فاتورة مبيعات (نفس منطق /save_invoice)
            conn.execute(
                'INSERT OR IGNORE INTO "فاتورة مبيعات رؤوس" '
                '("رقم الفاتورة", "المستخدم", "من", "إلى", "التاريخ", "الوقت") '
                'VALUES (?, ?, ?, ?, ?, ?)',
                ("عميل 2026-11-23", "مدير", "الصندوق", "عميل", "2026-11-23", "09:30:00"),
            )
            conn.execute(
                'INSERT INTO "فاتورة مبيعات" ("المادة", "الكمية", "سعر المبيع", "حسم %", '
                '"قيمة الحسم", "الإجمالي بعد الحسم", "رقم الطبخة", "التكلفة", "إجمالي التكلفة", '
                '"الإجمالي قبل الحسم", "إجمالي الربح", "المبلغ المقبوض من مادة واحدة", '
                '"إيصال نسبة الربح إلى", "نسبة الربح") '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                item_row(INVOICE_ITEM),
            )
            rid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.execute(
                'INSERT INTO "فاتورة مبيعات ربط" ("row_id", "رقم الفاتورة") VALUES (?, ?)',
                (rid, "عميل 2026-11-23"),
            )
            conn.commit()

            # 3) قراءة الفاتورة (نفس منطق /invoice)
            cur = conn.execute(
                'SELECT i."المادة" AS name, i."الكمية" AS quantity, i."سعر المبيع" AS sellPrice, '
                'i."رقم الطبخة" AS batchNo, i."المبلغ المقبوض من مادة واحدة" AS receivedAmount '
                'FROM "فاتورة مبيعات" i JOIN "فاتورة مبيعات ربط" l ON l."row_id" = i.rowid '
                'WHERE l."رقم الفاتورة" = ?',
                ("عميل 2026-11-23",),
            )
            rows = [dict(r) for r in cur.fetchall()]
            assert len(rows) == 1, rows
            assert rows[0]["name"] == INVOICE_ITEM["name"], rows[0]
            assert rows[0]["batchNo"] == "L77", rows[0]
            assert float(rows[0]["receivedAmount"]) == 270.0, rows[0]

            # 4) تعديل الفاتورة: حذف ثم إعادة إدخال بكمية جديدة (نفس منطق force=true)
            conn.execute(
                'DELETE FROM "فاتورة مبيعات" WHERE rowid IN '
                '(SELECT "row_id" FROM "فاتورة مبيعات ربط" WHERE "رقم الفاتورة" = ?)',
                ("عميل 2026-11-23",),
            )
            conn.execute('DELETE FROM "فاتورة مبيعات ربط" WHERE "رقم الفاتورة" = ?',
                         ("عميل 2026-11-23",))
            edited = dict(INVOICE_ITEM)
            edited["quantity"] = 5
            edited["totalCost"] = 300.0
            edited["totalBeforeDiscount"] = 500.0
            conn.execute(
                'INSERT INTO "فاتورة مبيعات" ("المادة", "الكمية", "سعر المبيع", "حسم %", '
                '"قيمة الحسم", "الإجمالي بعد الحسم", "رقم الطبخة", "التكلفة", "إجمالي التكلفة", '
                '"الإجمالي قبل الحسم", "إجمالي الربح", "المبلغ المقبوض من مادة واحدة", '
                '"إيصال نسبة الربح إلى", "نسبة الربح") '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                item_row(edited),
            )
            rid2 = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.execute(
                'INSERT INTO "فاتورة مبيعات ربط" ("row_id", "رقم الفاتورة") VALUES (?, ?)',
                (rid2, "عميل 2026-11-23"),
            )
            conn.commit()
            q = conn.execute(
                'SELECT i."الكمية" AS q FROM "فاتورة مبيعات" i '
                'JOIN "فاتورة مبيعات ربط" l ON l."row_id" = i.rowid '
                'WHERE l."رقم الفاتورة" = ?',
                ("عميل 2026-11-23",),
            ).fetchone()
            assert float(q[0]) == 5.0, q[0]

            # 5) تحديث الرصيد: إدخال طبخة، خصم الكمية المبيوعة (اختبار_ك_صيدلية)
            conn.execute(
                'INSERT INTO "جدول ك صيدلية" ("المادة", "الشركة", "التكلفة", "عموم", '
                '"ك صيدلية", "رقم الطبخة", "تاريخ انتهاء الفعالية") '
                'VALUES (?, ?, ?, ?, ?, ?, ?)',
                ("دواء تجريبي 500 ملغ", "شركة", 60.0, 100.0, 20.0, "L77", "01/06/2027"),
            )
            conn.commit()
            conn.execute(
                'UPDATE "جدول ك صيدلية" SET "ك صيدلية" = "ك صيدلية" - ? '
                'WHERE "المادة" = ? AND "رقم الطبخة" = ?',
                (edited["quantity"], edited["name"], edited["batchNo"]),
            )
            conn.commit()
            bal = conn.execute(
                'SELECT "ك صيدلية" FROM "جدول ك صيدلية" WHERE "المادة" = ? AND "رقم الطبخة" = ?',
                (edited["name"], edited["batchNo"]),
            ).fetchone()
            assert float(bal[0]) == 15.0, bal[0]

            # 6) حذف الفاتورة كاملة
            conn.execute(
                'DELETE FROM "فاتورة مبيعات" WHERE rowid IN '
                '(SELECT "row_id" FROM "فاتورة مبيعات ربط" WHERE "رقم الفاتورة" = ?)',
                ("عميل 2026-11-23",),
            )
            conn.execute('DELETE FROM "فاتورة مبيعات ربط" WHERE "رقم الفاتورة" = ?',
                         ("عميل 2026-11-23",))
            conn.execute('DELETE FROM "فاتورة مبيعات رؤوس" WHERE "رقم الفاتورة" = ?',
                         ("عميل 2026-11-23",))
            conn.commit()
            n = conn.execute('SELECT COUNT(*) FROM "فاتورة مبيعات"').fetchone()[0]
            assert n == 0, n
            conn.close()

            # 7) المخطط مطابق حرفيًا (توافق tests/test_invoice_records.py)
            payload = a.read_table("فاتورة مبيعات")
            assert tuple(payload["cols"]) == tuple(INVOICE_TABLE_COLUMNS), payload["cols"]
        finally:
            a.close()
        return True


class TestAdapters(unittest.TestCase):

    def _tmp(self):
        d = tempfile.mkdtemp(prefix="apotheca_adapters_")
        self.addCleanup(shutil.rmtree, d, ignore_errors=True)
        return d

    # ---------- SQLite الملفية ----------
    def test_sqlite_file_full_cycle(self):
        d = self._tmp()
        a = create_adapter({"kind": "sqlite", "path": os.path.join(d, "pharmacy.db")})
        AdapterCycle(a).run()
        self.assertTrue(os.path.exists(os.path.join(d, "pharmacy.db")))

    # ---------- TXT/JSON مجلد ----------
    def test_txtjson_dir_full_cycle(self):
        d = self._tmp()
        a = create_adapter({"kind": "txtjson", "path": os.path.join(d, "txtstore")})
        AdapterCycle(a).run()
        files = os.listdir(os.path.join(d, "txtstore"))
        self.assertIn("فاتورة مبيعات.json", files)
        data = json.load(open(os.path.join(d, "txtstore", "فاتورة مبيعات.json"), encoding="utf-8"))
        self.assertEqual(data["rows"], [])   # حُذفت الفاتورة في نهاية الدورة — الملف محدث ✓

    # ---------- TXT/JSON حزمة واحدة ----------
    def test_txtjson_package_full_cycle(self):
        d = self._tmp()
        p = os.path.join(d, "قاعدة.json")
        a = create_adapter({"kind": "txtjson", "path": p})
        AdapterCycle(a).run()
        self.assertTrue(os.path.exists(p))
        obj = json.load(open(p, encoding="utf-8"))
        self.assertIn("فاتورة مبيعات", obj)

    # ---------- CSV ----------
    def test_csv_full_cycle(self):
        d = self._tmp()
        a = create_adapter({"kind": "csv", "path": os.path.join(d, "csvstore")})
        AdapterCycle(a).run()
        self.assertIn("بطاقات المواد.csv".replace("بطاقات المواد", "جدول ك صيدلية"),
                      os.listdir(os.path.join(d, "csvstore")))

    # ---------- Excel ----------
    def test_excel_full_cycle(self):
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            self.skipTest("openpyxl غير مثبتة")
        d = self._tmp()
        p = os.path.join(d, "قاعدة.xlsx")
        a = create_adapter({"kind": "excel", "path": p})
        AdapterCycle(a).run()
        wb = __import__("openpyxl").load_workbook(p)
        self.assertIn("جدول ك صيدلية", wb.sheetnames)
        wb.close()

    # ---------- محاكي Access (ذاكرة) ----------
    def test_access_sim_full_cycle(self):
        a = create_adapter({"kind": "access-sim"})
        AdapterCycle(a).run()

    # ---------- ترحيل بين قاعدتين + تحقق ----------
    def test_migrate_sqlite_to_txtjson_and_back(self):
        d = self._tmp()
        src = create_adapter({"kind": "sqlite", "path": os.path.join(d, "src.db")})
        src.connect()
        conn = src.get_conn()
        ensure_invoice_schema(conn)
        conn.execute(CREATE_K_TABLE)
        conn.execute(
            'INSERT INTO "جدول ك صيدلية" ("المادة", "الشركة", "ك صيدلية", "رقم الطبخة") '
            'VALUES (?, ?, ?, ?)', ("مادة أ", "شركة", 12.0, "B1"))
        conn.commit()
        conn.close()

        dst = create_adapter({"kind": "txtjson", "path": os.path.join(d, "out")})
        dst.connect()
        progress = []

        def cb(done, total, name):
            progress.append((done, total, name))

        res = migrate.migrate(src, dst, progress_cb=cb)
        self.assertGreater(res["total"], 0)
        self.assertTrue(all(t["verified"] for t in res["tables"]))
        self.assertTrue(progress)
        back = dst.read_table("جدول ك صيدلية")
        self.assertEqual(len(back["rows"]), 1)
        self.assertEqual(back["rows"][0]["المادة"], "مادة أ")
        # عودة: TXT → SQLite جديدة
        dst2 = create_adapter({"kind": "sqlite", "path": os.path.join(d, "back.db")})
        dst2.connect()
        res2 = migrate.migrate(dst, dst2)
        self.assertTrue(all(t["verified"] for t in res2["tables"]))
        self.assertEqual(len(dst2.read_table("جدول ك صيدلية")["rows"]), 1)

    # ---------- القراءة فقط ----------
    def test_read_only_blocks_writes(self):
        d = self._tmp()
        import sqlite3 as _sq
        _sq.connect(os.path.join(d, "ro.db")).close()
        a = create_adapter({"kind": "sqlite", "path": os.path.join(d, "ro.db"), "read_only": True})
        a.connect()
        conn = a.get_conn()
        with self.assertRaises(DBError):
            conn.execute("CREATE TABLE t1 (x NUMERIC)")
        cur = conn.cursor()
        with self.assertRaises(DBError):
            cur.execute("INSERT INTO x VALUES (1)")
        conn.close()
        a.close()

    # ---------- حفظ وتفعيل الإعدادات ----------
    def test_save_and_activate_config(self):
        d = tempfile.mkdtemp(prefix="apotheca_cfg_")
        self.addCleanup(shutil.rmtree, d, ignore_errors=True)
        from unittest.mock import patch
        with patch("db_adapters.factory.base_dir", return_value=d):
            cfg = {"kind": "sqlite", "path": os.path.join(d, "cfg.db"), "read_only": False}
            p = save_config(cfg)
            self.assertTrue(os.path.exists(p))
            saved = json.load(open(p, encoding="utf-8"))
            self.assertEqual(saved["kind"], "sqlite")

    # ---------- أخطاء عربية واضحة ----------
    def test_arabic_errors(self):
        a = create_adapter({"kind": "excel", "path": "X_nonexistent.xlsx", "read_only": True})
        with self.assertRaises(DBError) as ctx:
            a.connect()
        self.assertIn("المسار غير موجود", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
