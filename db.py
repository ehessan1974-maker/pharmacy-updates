# db.py — اتصال قاعدة البيانات SQLite الجديدة (بدون أوفيس نهائياً)
import os
import sqlite3
import sys


INVOICE_TABLE_COLUMNS = (
    "المادة",
    "الكمية",
    "سعر المبيع",
    "حسم %",
    "قيمة الحسم",
    "الإجمالي بعد الحسم",
    "رقم الطبخة",
    "التكلفة",
    "إجمالي التكلفة",
    "الإجمالي قبل الحسم",
    "إجمالي الربح",
    "المبلغ المقبوض من مادة واحدة",
    "إيصال نسبة الربح إلى",
    "نسبة الربح",
)


def get_db_path():
    """تحديد مسار قاعدة البيانات — يعمل في التطوير والحزمة المجمعة"""
    if getattr(sys, 'frozen', False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    env_path = os.getenv("DB_PATH")
    if env_path:
        return env_path
    # داخل مجلد data أولاً ثم بجانب السيرفر
    candidate = os.path.join(base, "data", "pharmacy.db")
    if os.path.exists(candidate):
        return candidate
    return os.path.join(base, "pharmacy.db")


def get_conn():
    """فتح اتصال SQLite جديد لكل عملية — آمن مع تعدد الخيوط"""
    path = get_db_path()
    if not os.path.exists(path):
        raise FileNotFoundError(f"❌ قاعدة البيانات غير موجودة: {path}")
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


def ensure_invoice_schema(conn):
    """Create the invoice record source with the columns supplied in its schema."""
    numeric_columns = (
        "الكمية",
        "سعر المبيع",
        "حسم %",
        "قيمة الحسم",
        "الإجمالي بعد الحسم",
        "التكلفة",
        "إجمالي التكلفة",
        "الإجمالي قبل الحسم",
        "إجمالي الربح",
        "المبلغ المقبوض من مادة واحدة",
        "إيصال نسبة الربح إلى",
        "نسبة الربح",
    )
    declarations = [
        f'"{column}" {"REAL" if column in numeric_columns else "TEXT"}'
        for column in INVOICE_TABLE_COLUMNS
    ]
    conn.execute(
        'CREATE TABLE IF NOT EXISTS "فاتورة مبيعات" (' +
        ", ".join(declarations) + ")"
    )

    actual_columns = tuple(
        row["name"] for row in conn.execute('PRAGMA table_info("فاتورة مبيعات")')
    )
    if actual_columns != INVOICE_TABLE_COLUMNS:
        raise RuntimeError(
            'بنية جدول «فاتورة مبيعات» لا تطابق الحقول المطلوبة في ملف المخطط'
        )

    conn.execute("""
        CREATE TABLE IF NOT EXISTS "فاتورة مبيعات رؤوس" (
            "رقم الفاتورة" TEXT PRIMARY KEY,
            "المستخدم" TEXT,
            "من" TEXT,
            "إلى" TEXT,
            "التاريخ" TEXT,
            "الوقت" TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS "فاتورة مبيعات ربط" (
            "row_id" INTEGER PRIMARY KEY,
            "رقم الفاتورة" TEXT NOT NULL,
            FOREIGN KEY ("رقم الفاتورة")
                REFERENCES "فاتورة مبيعات رؤوس" ("رقم الفاتورة")
                ON DELETE CASCADE
        )
    """)

    record_count = conn.execute('SELECT COUNT(*) FROM "فاتورة مبيعات"').fetchone()[0]
    legacy_view = conn.execute("""
        SELECT type FROM sqlite_master WHERE name = 'معلومات مبيعات'
    """).fetchone()
    if record_count == 0 and legacy_view:
        legacy_rows = conn.execute("""
            SELECT
                "المادة", "الكمية", "سعر المبيع", "حسم %", "رقم الطبخة",
                "رقم الفاتورة", "المستخدم", "من", "إلى", "التاريخ", "الوقت",
                "التكلفة", "إجمالي التكلفة", "إجمالي الربح", "الإجمالي بعد الحسم"
            FROM "معلومات مبيعات"
            ORDER BY "التاريخ", "الوقت", "ترقيم"
        """).fetchall()
        for row in legacy_rows:
            invoice_number = row["رقم الفاتورة"]
            if not invoice_number or not row["المادة"]:
                continue
            conn.execute("""
                INSERT OR IGNORE INTO "فاتورة مبيعات رؤوس"
                ("رقم الفاتورة", "المستخدم", "من", "إلى", "التاريخ", "الوقت")
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                invoice_number, row["المستخدم"], row["من"], row["إلى"],
                row["التاريخ"], row["الوقت"],
            ))
            quantity = row["الكمية"] or 0
            sell_price = row["سعر المبيع"] or 0
            discount_percent = row["حسم %"] or 0
            discount_value = quantity * sell_price * discount_percent / 100
            total_after = row["الإجمالي بعد الحسم"] or 0
            total_cost = row["إجمالي التكلفة"] or 0
            total_profit = row["إجمالي الربح"] or (total_after - total_cost)
            profit_percent = total_profit * 100 / total_after if total_after else 0
            profit_receipt_to = 100 - total_cost * 100 / total_after if total_after else 0
            cur = conn.execute("""
                INSERT INTO "فاتورة مبيعات"
                ("المادة", "الكمية", "سعر المبيع", "حسم %", "قيمة الحسم",
                 "الإجمالي بعد الحسم", "رقم الطبخة", "التكلفة", "إجمالي التكلفة",
                 "الإجمالي قبل الحسم", "إجمالي الربح", "المبلغ المقبوض من مادة واحدة",
                 "إيصال نسبة الربح إلى", "نسبة الربح")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row["المادة"], quantity, sell_price, discount_percent, discount_value,
                total_after, row["رقم الطبخة"], row["التكلفة"] or 0, total_cost,
                quantity * sell_price, total_profit, total_after,
                profit_receipt_to, profit_percent,
            ))
            conn.execute("""
                INSERT INTO "فاتورة مبيعات ربط" ("row_id", "رقم الفاتورة")
                VALUES (?, ?)
            """, (cur.lastrowid, invoice_number))

    conn.commit()
