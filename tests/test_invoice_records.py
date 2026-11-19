import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from db import INVOICE_TABLE_COLUMNS
from server import app


class InvoiceRecordSourceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test.db")
        sqlite3.connect(self.db_path).close()
        self.env = patch.dict(os.environ, {"DB_PATH": self.db_path})
        self.env.start()
        self.client = app.test_client()

    def tearDown(self):
        self.env.stop()
        self.temp_dir.cleanup()

    def test_invoice_uses_excel_fields_and_restores_all_item_values(self):
        payload = {
            "header": {
                "invoiceNumber": "عميل 2026-11-19",
                "date": "2026-11-19",
                "time": "09:00",
                "user": "مدير",
                "from": "الصندوق",
                "to": "عميل",
            },
            "items": [{
                "name": "دواء",
                "quantity": 2,
                "sellPrice": 10,
                "discountPercent": 5,
                "discountValue": 1,
                "totalAfterDiscount": 19,
                "batchNo": "7",
                "cost": 4,
                "totalCost": 8,
                "totalBeforeDiscount": 20,
                "totalProfit": 11,
                "receivedAmount": 19,
                "إيصال_نسبة_الربح_إلى": 57.89,
                "profitPercentReal": 57.89,
            }],
        }

        saved = self.client.post("/save_invoice", json=payload)
        self.assertEqual(saved.json["status"], "success")

        conn = sqlite3.connect(self.db_path)
        columns = tuple(row[1] for row in conn.execute('PRAGMA table_info("فاتورة مبيعات")'))
        self.assertEqual(columns, INVOICE_TABLE_COLUMNS)
        conn.close()

        loaded = self.client.get("/invoice", query_string={"number": "عميل 2026-11-19"})
        self.assertEqual(loaded.json["header"]["to"], "عميل")
        self.assertEqual(loaded.json["items"][0]["discountValue"], 1)
        self.assertEqual(loaded.json["items"][0]["receivedAmount"], 19)
        self.assertEqual(loaded.json["items"][0]["إيصال_نسبة_الربح_إلى"], 57.89)

        sales = self.client.get("/api/sales", query_string={"date": "2026-11-19"})
        self.assertEqual(sales.json["totals"]["total_items"], 1)
        self.assertEqual(sales.json["data"][0]["name"], "دواء")

    def test_replacing_invoice_removes_its_records(self):
        payload = {
            "header": {
                "invoiceNumber": "حذف",
                "date": "2026-11-19",
                "time": "09:00",
            },
            "items": [{"name": "دواء", "quantity": 1, "sellPrice": 5}],
        }
        self.assertEqual(self.client.post("/save_invoice", json=payload).json["status"], "success")
        payload["force"] = True
        payload["items"] = []
        self.assertEqual(self.client.post("/save_invoice", json=payload).json["status"], "success")
        self.assertEqual(self.client.get("/invoice", query_string={"number": "حذف"}).json, {})
        self.assertEqual(self.client.get("/invoices_numbers").json, [])

    def test_existing_sales_view_is_migrated_to_the_new_record_source(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            CREATE TABLE "معلومات مبيعات" (
                "المادة" TEXT, "الكمية" REAL, "سعر المبيع" REAL, "حسم %" REAL,
                "رقم الطبخة" TEXT, "رقم الفاتورة" TEXT, "المستخدم" TEXT, "من" TEXT,
                "إلى" TEXT, "التاريخ" TEXT, "الوقت" TEXT, "التكلفة" REAL,
                "إجمالي التكلفة" REAL, "إجمالي الربح" REAL,
                "الإجمالي بعد الحسم" REAL, "ترقيم" INTEGER
            )
        """)
        conn.execute("""
            INSERT INTO "معلومات مبيعات"
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "قديم", 2, 10, 5, "3", "قديمة-1", "مدير", "الصندوق", "عميل",
            "2026-11-18", "09:00:00", 4, 8, 11, 19, 1,
        ))
        conn.commit()
        conn.close()

        loaded = self.client.get("/invoice", query_string={"number": "قديمة-1"})
        self.assertEqual(loaded.json["items"][0]["name"], "قديم")
        self.assertEqual(loaded.json["items"][0]["totalProfit"], 11)
        self.assertEqual(self.client.get("/invoices_numbers").json, ["قديمة-1"])


if __name__ == "__main__":
    unittest.main()
