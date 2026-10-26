# -*- coding: utf-8 -*-
# ================== server.py — الإصدار الجديد بدون أوفيس ==================
# قاعدة البيانات: SQLite (ملف واحد، صفر تثبيت، أسرع 10 مرات)
# إزيلات: تيليغرام، إيميل، أوفيس/Access
# إبقاء: نفس الواجهة، نفس كل مسارات API، QR، نفق Cloudflare اختياري

import os
import sys
from datetime import datetime, date
from pathlib import Path

# تحميل ملف .env إذا كان موجوداً
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip().strip('"').strip("'")

# ================== IMPORTS ==================
from flask import Flask, jsonify, request, render_template
import logging

from db import get_conn
from materials_routes import materials_bp

logging.basicConfig(level=logging.INFO)

# ================== APP ==================
app = Flask(__name__)
app.register_blueprint(materials_bp)

# قوالب وملفات ثابتة تتحدث فوراً بعد أي تحديث ذاتي (بدون إعادة تشغيل)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

PORT = int(os.getenv("PORT", "8080"))

# ================== أدوات التواريخ والأوقات ==================
DATE_FORMATS = ["%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%y", "%m/%d/%Y"]


def parse_date_flexible(value):
    """تحويل نص تاريخ بأي صيغة شائعة إلى ISO (YYYY-MM-DD)"""
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    s = str(value).strip()
    if not s:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_time_flexible(value):
    """تحويل نص وقت (12 ساعة مع ص/م أو 24 ساعة) إلى HH:MM:SS
    مهم: مؤشر ص/م يُفحص أولاً ثم يُحوّل 12h → 24h قبل أي تفسير"""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    is_pm = ("م" in s) or ("PM" in s.upper())
    is_am = ("ص" in s) or ("AM" in s.upper())
    s2 = (s.replace("ص", "").replace("م", "")
           .replace("AM", "").replace("PM", "")
           .replace("am", "").replace("pm", "").strip())
    for fmt in ["%I:%M:%S", "%I:%M", "%H:%M:%S", "%H:%M"]:
        try:
            t = datetime.strptime(s2, fmt)
            hour = t.hour
            if is_pm and hour < 12:
                hour += 12
            elif is_am and hour == 12:
                hour = 0
            return f"{hour:02d}:{t.minute:02d}:{t.second:02d}"
        except ValueError:
            continue
    return None


def fmt_date_dmy(iso_str):
    """تحويل ISO إلى DD/MM/YYYY للعرض"""
    if not iso_str:
        return ""
    try:
        return datetime.strptime(str(iso_str)[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return str(iso_str)


def fmt_time_ampm(hhmmss):
    """تحويل HH:MM:SS إلى hh:mm:ss ص/م للعرض"""
    if not hhmmss:
        return ""
    try:
        t = datetime.strptime(str(hhmmss)[:8], "%H:%M:%S")
        suffix = "ص" if t.hour < 12 else "م"
        return t.strftime("%I:%M:%S") + f" {suffix}"
    except ValueError:
        return str(hhmmss)


def safe_num(v, cast=float):
    try:
        return cast(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


# ================== الصفحات ==================
@app.route("/")
def index():
    if os.name == 'nt':
        machine_name = os.environ.get('COMPUTERNAME', 'Unknown')
        user_name = os.environ.get('USERNAME', 'Unknown')
    else:
        machine_name = os.uname().nodename
        user_name = os.environ.get('USER', os.environ.get('USERNAME', 'Unknown'))
    user_computer_info = f"{user_name} from : {machine_name}"
    return render_template("index.html", user_computer_info=user_computer_info)


@app.route('/sales_standalone_full')
def sales_standalone_full():
    return render_template('sales_standalone_full.html')


@app.route('/materials_standalone_full')
def materials_standalone_full():
    return render_template('materials_standalone_full.html')


@app.route('/purchases_standalone_full')
def purchases_standalone_full():
    return render_template('purchases_standalone_full.html')


@app.route("/health")
def health_check():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*) FROM "بطاقات المواد"')
        n = cur.fetchone()[0]
        conn.close()
        return jsonify({"status": "ok", "message": "السيرفر يعمل بنجاح", "materials": n})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ================== الأدوية (من العرض الحي — بديل جدول ك صيدلية) ==================
@app.route("/medicines")
def get_medicines():
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                "المادة", "الشركة", "التكلفة", "عموم", "ك صيدلية",
                "رقم الطبخة", "تاريخ الصنع", "تاريخ انتهاء الفعالية",
                "رمز الباركود", "ك مشتريات", "ك مبيعات",
                "التصنيف", "التركيب الكيميائي", "الرمز", "السعر الأساسي"
            FROM "جدول ك صيدلية"
        """)

        data = []
        for r in cur.fetchall():
            data.append({
                "name": r["المادة"] or "",
                "company": r["الشركة"] or "",
                "cost": safe_num(r["التكلفة"]),
                "general": safe_num(r["عموم"], int),
                "stock": safe_num(r["ك صيدلية"]),
                "batch_no": r["رقم الطبخة"] or "",
                "mfg_date": (r["تاريخ الصنع"][:10].replace("-", "/") if r["تاريخ الصنع"] else ""),
                "exp_date": (r["تاريخ انتهاء الفعالية"][:10].replace("-", "/") if r["تاريخ انتهاء الفعالية"] else ""),
                "barcode": r["رمز الباركود"] or "",
                "qty_buy": safe_num(r["ك مشتريات"]),
                "qty_sell": safe_num(r["ك مبيعات"]),
                "category": r["التصنيف"] or "",
                "chemical": r["التركيب الكيميائي"] or "",
                "code": r["الرمز"] or "",
                "base_price": safe_num(r["السعر الأساسي"]),
            })

        return jsonify(data)

    except Exception as e:
        print("🔥 خطأ في /medicines:", e)
        import traceback
        traceback.print_exc()
        return jsonify([])

    finally:
        if conn:
            conn.close()


# ================== حفظ الفاتورة ==================
@app.route("/save_invoice", methods=["POST"])
def save_invoice():
    conn = None
    try:
        data = request.get_json()
        header = data["header"]
        items = data["items"]
        force = data.get("force", False)

        invoice_number = header["invoiceNumber"]
        iso_date = parse_date_flexible(header["date"])
        iso_time = parse_time_flexible(header["time"])
        if not iso_date:
            iso_date = datetime.now().strftime("%Y-%m-%d")
        if not iso_time:
            iso_time = datetime.now().strftime("%H:%M:%S")

        conn = get_conn()
        cur = conn.cursor()

        cur.execute('SELECT COUNT(*) FROM "مبيعات" WHERE "رقم الفاتورة" = ?', (invoice_number,))
        exists = cur.fetchone()[0] > 0

        if exists and not force:
            conn.close()
            return jsonify({"status": "exists", "invoice_number": invoice_number})

        if exists:
            cur.execute('DELETE FROM "مبيعات" WHERE "رقم الفاتورة" = ?', (invoice_number,))

        for item in items:
            if not item.get("name"):
                continue
            cur.execute("""
                INSERT INTO "مبيعات"
                ("المادة", "الكمية", "سعر المبيع", "حسم %", "رقم الطبخة",
                 "المستخدم", "من", "إلى", "التاريخ", "الوقت", "رقم الفاتورة", "تحديد")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (
                item["name"],
                safe_num(item.get("quantity")) or None,
                safe_num(item.get("sellPrice")) or None,
                safe_num(item.get("discountPercent")) or None,
                item.get("batchNo") or None,
                header.get("user") or None,
                header.get("from") or None,
                header.get("to") or None,
                iso_date,
                iso_time,
                invoice_number,
            ))

        conn.commit()
        conn.close()
        return jsonify({"status": "success"})

    except Exception as e:
        print("🔥 ERROR save_invoice:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


# ================== أرقام الفواتير ==================
@app.route("/invoices_numbers")
def get_invoice_numbers():
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT "رقم الفاتورة"
            FROM "مبيعات"
            GROUP BY "رقم الفاتورة", "التاريخ", "الوقت"
            ORDER BY "التاريخ" DESC, "الوقت" DESC
        """)
        numbers = [str(r["رقم الفاتورة"]) for r in cur.fetchall() if r["رقم الفاتورة"]]
        return jsonify(numbers)

    except Exception as e:
        print("🔥 خطأ invoices_numbers:", e)
        return jsonify([])

    finally:
        if conn:
            conn.close()


# ================== جلب فاتورة واحدة ==================
@app.route("/invoice")
def get_invoice():
    invoice_number = request.args.get("number")
    if not invoice_number:
        return jsonify({})

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            "المستخدم", "من", "إلى", "التاريخ", "الوقت", "رقم الفاتورة"
        FROM "مبيعات"
        WHERE "رقم الفاتورة" = ?
        LIMIT 1
    """, (invoice_number,))
    header_row = cur.fetchone()

    if not header_row:
        conn.close()
        return jsonify({})

    header = {
        "user": header_row["المستخدم"] or "",
        "from": header_row["من"] or "",
        "to": header_row["إلى"] or "",
        "date": fmt_date_dmy(header_row["التاريخ"]),
        "time": fmt_time_ampm(header_row["الوقت"]),
        "invoiceNumber": header_row["رقم الفاتورة"],
    }

    cur.execute("""
        SELECT "المادة", "الكمية", "سعر المبيع", "حسم %", "رقم الطبخة"
        FROM "مبيعات"
        WHERE "رقم الفاتورة" = ?
    """, (invoice_number,))

    items = []
    for r in cur.fetchall():
        items.append({
            "name": r["المادة"],
            "quantity": r["الكمية"],
            "sellPrice": r["سعر المبيع"],
            "discountPercent": r["حسم %"],
            "batchNo": r["رقم الطبخة"],
        })

    conn.close()
    return jsonify({"header": header, "items": items})


# ================== API المبيعات (من العرض الحي — بديل معلومات مبيعات) ==================
SALES_SELECT = """
    SELECT
        "المادة", "الكمية", "سعر المبيع", "حسم %", "رقم الطبخة",
        "رقم الفاتورة", "المستخدم", "من", "إلى", "التاريخ", "الوقت",
        "التكلفة", "إجمالي التكلفة", "إجمالي الربح", "الإجمالي بعد الحسم", "ترقيم"
    FROM "معلومات مبيعات"
"""


def sales_rows_to_json(rows):
    data = []
    for r in rows:
        data.append({
            "name": r["المادة"] or "",
            "quantity": safe_num(r["الكمية"]),
            "sellPrice": safe_num(r["سعر المبيع"]),
            "discount": safe_num(r["حسم %"]),
            "batchNo": r["رقم الطبخة"] or "",
            "invoiceNo": r["رقم الفاتورة"] or "",
            "user": r["المستخدم"] or "",
            "from": r["من"] or "",
            "to": r["إلى"] or "",
            "date": (r["التاريخ"][:10].replace("-", "/") if r["التاريخ"] else ""),
            "time": (r["الوقت"][:8] if r["الوقت"] else ""),
            "التكلفة": safe_num(r["التكلفة"]),
            "إجمالي التكلفة": safe_num(r["إجمالي التكلفة"]),
            "إجمالي الربح": safe_num(r["إجمالي الربح"]),
            "الإجمالي بعد الحسم": safe_num(r["الإجمالي بعد الحسم"]),
            "tarkim": r["ترقيم"],
        })
    return data


@app.route("/api/sales")
def api_sales():
    conn = None
    try:
        date_param = request.args.get("date")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 200))

        where_clause = ""
        params = []
        if date_param:
            iso = parse_date_flexible(date_param)
            where_clause = 'WHERE "التاريخ" = ?'
            params.append(iso)
        elif start_date and end_date:
            iso1, iso2 = parse_date_flexible(start_date), parse_date_flexible(end_date)
            where_clause = 'WHERE "التاريخ" BETWEEN ? AND ?'
            params.extend([iso1, iso2])

        conn = get_conn()
        cur = conn.cursor()

        cur.execute(f"""
            SELECT COUNT(*), SUM("الكمية"), SUM("إجمالي التكلفة"),
                   SUM("إجمالي الربح"), SUM("الإجمالي بعد الحسم")
            FROM "معلومات مبيعات" {where_clause}
        """, params)
        totals_row = cur.fetchone()
        total_count = totals_row[0] or 0
        has_more = (offset + limit) < total_count

        sql = f"{SALES_SELECT} {where_clause} ORDER BY \"التاريخ\" DESC, \"الوقت\" DESC LIMIT ? OFFSET ?"
        cur.execute(sql, params + [limit, offset])
        rows = cur.fetchall()
        conn.close()

        return jsonify({
            "data": sales_rows_to_json(rows),
            "totals": {
                "total_items": totals_row[0] or 0,
                "total_qty": safe_num(totals_row[1]),
                "total_cost": safe_num(totals_row[2]),
                "total_profit": safe_num(totals_row[3]),
                "total_after": safe_num(totals_row[4]),
            },
            "has_more": has_more,
        })

    except Exception as e:
        print("🔥 خطأ api_sales:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        if conn:
            conn.close()


@app.route("/api/sales/search")
def search_sales():
    conn = None
    try:
        query = request.args.get("q", "").strip()
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 200))

        if not query:
            return jsonify({
                "data": [],
                "totals": {"total_items": 0, "total_qty": 0, "total_cost": 0, "total_profit": 0, "total_after": 0},
                "has_more": False,
            })

        parsed_date = parse_date_flexible(query)
        like_query = f"%{query}%"
        iso_like = f"%{parsed_date}%" if parsed_date else like_query

        where_clause = """
            WHERE "المادة" LIKE ? OR "رقم الفاتورة" LIKE ?
              OR "التاريخ" LIKE ? OR "إلى" LIKE ? OR "رقم الطبخة" LIKE ?
        """
        params = [like_query, like_query, iso_like, like_query, like_query]

        conn = get_conn()
        cur = conn.cursor()

        cur.execute(f"""
            SELECT COUNT(*), SUM("الكمية"), SUM("إجمالي التكلفة"),
                   SUM("إجمالي الربح"), SUM("الإجمالي بعد الحسم")
            FROM "معلومات مبيعات" {where_clause}
        """, params)
        totals_row = cur.fetchone()
        total_count = totals_row[0] or 0
        has_more = (offset + limit) < total_count

        sql = f"{SALES_SELECT} {where_clause} ORDER BY \"التاريخ\" DESC, \"الوقت\" DESC LIMIT ? OFFSET ?"
        cur.execute(sql, params + [limit, offset])
        rows = cur.fetchall()
        conn.close()

        return jsonify({
            "data": sales_rows_to_json(rows),
            "totals": {
                "total_items": totals_row[0] or 0,
                "total_qty": safe_num(totals_row[1]),
                "total_cost": safe_num(totals_row[2]),
                "total_profit": safe_num(totals_row[3]),
                "total_after": safe_num(totals_row[4]),
            },
            "has_more": has_more,
        })

    except Exception as e:
        print("🔥 خطأ search_sales:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        if conn:
            conn.close()


@app.route("/api/sales/update", methods=["POST"])
def update_sales_cell():
    conn = None
    try:
        data = request.get_json()
        invoice_no = data.get("invoice_no")
        row_number = data.get("tarkim")
        field = data.get("field")
        value = data.get("value")

        if not invoice_no or not row_number or not field:
            return jsonify({"success": False, "error": "Missing data"})

        allowed_fields = ["التاريخ", "إلى"]
        if field not in allowed_fields:
            return jsonify({"success": False, "error": "Invalid field"})

        if field == "التاريخ":
            value = parse_date_flexible(value) or value

        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute(
            f'UPDATE "مبيعات" SET "{field}" = ? WHERE "رقم الفاتورة" = ? AND "ترقيم" = ?',
            (value, invoice_no, row_number),
        )

        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({"success": False, "error": "No matching record found"})

        conn.commit()
        return jsonify({"success": True})

    except Exception as e:
        print("🔥 خطأ update_sales_cell:", e)
        return jsonify({"success": False, "error": str(e)})

    finally:
        if conn:
            conn.close()


# ================== API المشتريات ==================
PURCHASES_SELECT = """
    SELECT
        "ترتيب", "المادة", "أساس العرض", "مجاني العرض", "حسم العرض",
        "الكمية", "المجاني", "سعر الشراء", "حسم %", "رقم الطبخة",
        "تاريخ الصنع", "تاريخ انتهاء الفعالية", "رقم الفاتورة", "المستخدم",
        "من", "إلى", "التاريخ", "الوقت", "ملاحظات", "البيان"
    FROM "مشتريات"
"""


def purchase_rows_to_json(rows):
    data = []
    for r in rows:
        data.append({
            "orderNo": r["ترتيب"] or 0,
            "name": r["المادة"] or "",
            "baseOffer": safe_num(r["أساس العرض"]),
            "freeOffer": safe_num(r["مجاني العرض"]),
            "discountOffer": safe_num(r["حسم العرض"]),
            "quantity": safe_num(r["الكمية"]),
            "freeQty": safe_num(r["المجاني"]),
            "buyPrice": safe_num(r["سعر الشراء"]),
            "discountPercent": safe_num(r["حسم %"]),
            "batchNo": r["رقم الطبخة"] or "",
            "mfgDate": (r["تاريخ الصنع"][:10].replace("-", "/") if r["تاريخ الصنع"] else ""),
            "expDate": (r["تاريخ انتهاء الفعالية"][:10].replace("-", "/") if r["تاريخ انتهاء الفعالية"] else ""),
            "invoiceNo": r["رقم الفاتورة"] or "",
            "user": r["المستخدم"] or "",
            "from": r["من"] or "",
            "supplier": r["إلى"] or "",
            "date": (r["التاريخ"][:10].replace("-", "/") if r["التاريخ"] else ""),
            "time": (r["الوقت"][:8] if r["الوقت"] else ""),
            "notes": r["ملاحظات"] or "",
            "statement": r["البيان"] or "",
        })
    return data


@app.route("/api/purchases")
def api_purchases():
    conn = None
    try:
        date_param = request.args.get("date")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 200))

        where_clause = ""
        params = []
        if date_param:
            iso = parse_date_flexible(date_param)
            where_clause = 'WHERE "التاريخ" = ?'
            params.append(iso)
        elif start_date and end_date:
            iso1, iso2 = parse_date_flexible(start_date), parse_date_flexible(end_date)
            where_clause = 'WHERE "التاريخ" BETWEEN ? AND ?'
            params.extend([iso1, iso2])

        conn = get_conn()
        cur = conn.cursor()

        cur.execute(f"""
            SELECT COUNT(*), SUM("الكمية"), SUM("المجاني")
            FROM "مشتريات" {where_clause}
        """, params)
        totals_row = cur.fetchone()
        total_count = totals_row[0] or 0
        has_more = (offset + limit) < total_count

        sql = f'{PURCHASES_SELECT} {where_clause} ORDER BY "التاريخ" DESC, "الوقت" DESC LIMIT ? OFFSET ?'
        cur.execute(sql, params + [limit, offset])
        rows = cur.fetchall()
        conn.close()

        return jsonify({
            "data": purchase_rows_to_json(rows),
            "totals": {
                "total_items": totals_row[0] or 0,
                "total_qty": safe_num(totals_row[1]),
                "total_free": safe_num(totals_row[2]),
            },
            "has_more": has_more,
        })

    except Exception as e:
        print("🔥 خطأ api_purchases:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        if conn:
            conn.close()


@app.route("/api/purchases/totals")
def purchases_totals():
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*), SUM("الكمية"), SUM("المجاني") FROM "مشتريات"')
        row = cur.fetchone()
        conn.close()
        return jsonify({
            "total_items": row[0] or 0,
            "total_qty": safe_num(row[1]),
            "total_free": safe_num(row[2]),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/purchases/search")
def search_purchases():
    conn = None
    try:
        query = request.args.get("q", "").strip()
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 200))

        if not query:
            return jsonify({
                "data": [],
                "totals": {"total_items": 0, "total_qty": 0, "total_free": 0},
                "has_more": False,
            })

        like_query = f"%{query}%"
        where_like = """
            WHERE
                "المادة" LIKE ? OR
                "رقم الفاتورة" LIKE ? OR
                "إلى" LIKE ? OR
                "رقم الطبخة" LIKE ? OR
                "ملاحظات" LIKE ? OR
                "البيان" LIKE ?
        """
        params_like = [like_query] * 6

        conn = get_conn()
        cur = conn.cursor()

        cur.execute(f'SELECT COUNT(*), SUM("الكمية"), SUM("المجاني") FROM "مشتريات" {where_like}', params_like)
        totals_row = cur.fetchone()
        total_count = totals_row[0] or 0
        has_more = (offset + limit) < total_count

        sql = f'{PURCHASES_SELECT} {where_like} ORDER BY "التاريخ" DESC, "الوقت" DESC LIMIT ? OFFSET ?'
        cur.execute(sql, params_like + [limit, offset])
        rows = cur.fetchall()
        conn.close()

        return jsonify({
            "data": purchase_rows_to_json(rows),
            "totals": {
                "total_items": totals_row[0] or 0,
                "total_qty": safe_num(totals_row[1]),
                "total_free": safe_num(totals_row[2]),
            },
            "has_more": has_more,
        })

    except Exception as e:
        print("🔥 خطأ search_purchases:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        if conn:
            conn.close()


@app.route("/api/purchases/invoice/<invoice_no>")
def get_purchases_by_invoice(invoice_no):
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f'{PURCHASES_SELECT} WHERE "رقم الفاتورة" = ? ORDER BY "ترتيب"', (invoice_no,))
        rows = cur.fetchall()
        conn.close()
        return jsonify(purchase_rows_to_json(rows))

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if conn:
            conn.close()


@app.route("/api/purchases/update", methods=["POST"])
def update_purchases_cell():
    conn = None
    try:
        data = request.get_json()
        invoice_no = data.get("invoice_no")
        material_name = data.get("material_name")
        field = data.get("field")
        value = data.get("value")

        if not invoice_no or not material_name or not field:
            return jsonify({"success": False, "error": "Missing data: invoice_no, material_name, field required"})

        date_fields = ["التاريخ", "تاريخ انتهاء الفعالية"]
        if field in date_fields:
            value = parse_date_flexible(value) or value

        allowed = {"التاريخ": "التاريخ", "إلى": "إلى", "supplier": "إلى", "المورد": "إلى",
                   "ملاحظات": "ملاحظات", "البيان": "البيان",
                   "تاريخ انتهاء الفعالية": "تاريخ انتهاء الفعالية"}

        if field not in allowed:
            return jsonify({"success": False, "error": f"Invalid field: {field}"})

        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute(
            f'UPDATE "مشتريات" SET "{allowed[field]}" = ? WHERE "رقم الفاتورة" = ? AND "المادة" = ?',
            (value, invoice_no, material_name),
        )

        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({"success": False,
                            "error": f"No matching record found for invoice={invoice_no}, material={material_name}"})

        conn.commit()
        return jsonify({"success": True})

    except Exception as e:
        print("🔥 خطأ update_purchases_cell:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

    finally:
        if conn:
            conn.close()


# ================== المشتريون ==================
@app.route("/api/buyers")
def get_buyers():
    conn = None
    try:
        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT "إلى"
            FROM "مبيعات"
            WHERE "إلى" IS NOT NULL AND "إلى" <> ''
        """)
        buyers = [str(r["إلى"]) for r in cursor.fetchall() if r["إلى"]]
        return jsonify(buyers)

    except Exception as e:
        print(f"❌ خطأ في /api/buyers: {e}")
        return jsonify(["فاتورة نقدية"]), 200

    finally:
        if conn:
            conn.close()


# ================== بقايا التوافق مع الواجهة القديمة ==================
@app.route("/run_query1", methods=["POST"])
def run_query1_api():
    # سابقاً: تفريغ وإعادة بناء جدول ك صيدلية في Access
    # الآن: العرض الحي يتحدث تلقائياً — لا حاجة لأي شيء
    return jsonify({"success": True})


@app.route("/open_sales_table")
def open_sales_table():
    # سابقاً: فتح Access — الآن: فتح صفحة المبيعات في المتصفح مباشرة
    from flask import redirect
    return redirect("/sales_standalone_full")


# ================== التشغيل ==================
def get_local_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def send_whatsapp_direct(url):
    """يرسل رابط النفق مباشرة إلى رقمك على واتساب كرسالة عادية
    (بدون فتح واتساب وبدون تيليغرام — عبر خدمة CallMeBot المجانية)

    الإعداد لمرة واحدة (دقيقتان):
      1) من هاتفك: احفظ الرقم +34 644 51 95 23 في جهات الاتصال
      2) أرسل له من واتساب الرسالة: I allow callmebot to send me messages
      3) سيصلك رد فيه API Key (أرقام فقط)
      4) ضع المفتاح في ملف whatsapp_apikey.txt بجانب server.py
      5) تأكد أن my_phone.txt يحوي رقمك بصيغة دولية مثل: 963944123456
    بعد ذلك: كل تشغيل للبرنامج يصلك واتساب فيه الرابط الجديد تلقائياً.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    phone_file = os.path.join(base_dir, "my_phone.txt")
    key_file = os.path.join(base_dir, "whatsapp_apikey.txt")

    # قراءة الرقم (صيغة دولية — نظّف + والمسافات والشرطات)
    phone = ""
    try:
        if os.path.exists(phone_file):
            with open(phone_file, "r", encoding="utf-8") as f:
                phone = f.read().strip().replace("+", "").replace(" ", "").replace("-", "")
    except Exception:
        pass
    if not phone.isdigit() or len(phone) < 10:
        print("⚠️ my_phone.txt لا يحوي رقماً صحيحاً بصيغة دولية (مثال: 963944123456) — تخطي إرسال واتساب")
        return

    # قراءة مفتاح CallMeBot
    apikey = ""
    try:
        if os.path.exists(key_file):
            with open(key_file, "r", encoding="utf-8") as f:
                apikey = f.read().strip()
    except Exception:
        pass
    if not apikey or len(apikey) < 4:
        print("\n" + "=" * 62)
        print("📲 خطوة واحدة ناقصة لتصلك الرسالة مباشرة على واتساب (لمرة واحدة):")
        print("   1) احفظ الرقم  +34 644 51 95 23  في جهات اتصال هاتفك")
        print("   2) أرسل له من واتساب: I allow callmebot to send me messages")
        print("   3) سيصلك رد فيه API Key (أرقام فقط)")
        print("   4) انسخ المفتاح في ملف whatsapp_apikey.txt بجانب server.py")
        print("   (بعدها كل تشغيل للبرنامج يوصلك واتساب فيه الرابط الجديد تلقائياً)")
        print("=" * 62 + "\n")
        return

    try:
        from urllib.parse import quote
        from urllib.request import urlopen
        now = datetime.now().strftime("%H:%M - %d/%m/%Y")
        msg = f"رابط صيدلية إحسان: {url}\nالساعة: {now}"
        api = (f"https://api.callmebot.com/whatsapp.php"
               f"?phone={quote('+' + phone)}&text={quote(msg)}&apikey={quote(apikey)}")
        resp = urlopen(api, timeout=25)
        if resp.status == 200:
            print(f"✅ أُرسل الرابط مباشرة إلى واتساب: +{phone}")
        else:
            print(f"⚠️ CallMeBot رد بكود {resp.status} — تحقق من رقمك والمفتاح")
    except Exception as e:
        print("⚠️ فشل إرسال واتساب المباشر:", e)


def send_ntfy_link(url):
    """بديل/إضافة فورية: إشعار مباشر على الموبايل عبر تطبيق ntfy المجاني
    (بلا حساب وبلا مفتاح وبلا انتظار — نشّطه بخطوتين):
      1) حمّل تطبيق ntfy من Play Store واضغط + Subscribe
      2) اشترك بموضوع (Topic) عشوائي صعب التخمين مثل: pharmacy-ehsan-9521
      3) اكتب نفس الاسم في ملف ntfy_topic.txt بجانب server.py
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    topic_file = os.path.join(base_dir, "ntfy_topic.txt")
    topic = ""
    try:
        if os.path.exists(topic_file):
            with open(topic_file, "r", encoding="utf-8") as f:
                topic = f.read().strip()
    except Exception:
        pass
    if not topic or " " in topic:
        return  # غير مفعّل — تجاهل بصمت
    try:
        from urllib.request import Request, urlopen
        now = datetime.now().strftime("%H:%M - %d/%m/%Y")
        body = f"رابط صيدلية إحسان: {url}\nالساعة: {now}".encode("utf-8")
        req = Request(
            f"https://ntfy.sh/{topic}",
            data=body,
            headers={
                "Title": "Pharmacy - New Tunnel Link",
                "Tags": "pill",
                "Priority": "high",
            },
        )
        resp = urlopen(req, timeout=20)
        if resp.status == 200:
            print(f"🔔 أُرسل إشعار فوري عبر ntfy إلى الموضوع: {topic}")
        else:
            print(f"⚠️ ntfy رد بكود {resp.status}")
    except Exception as e:
        print("⚠️ فشل إرسال إشعار ntfy:", e)


def announce_tunnel(url, static=False):
    """نشر رابط النفق: طباعة + نسخ للحافظة + الإشعارات المفعّلة (واتساب/ntfy)
    الإشعارات تُرسَل فقط عند تغيّر الرابط عن آخر مرة (يُحفظ في last_tunnel_url.txt)
    — الرابط الثابت لا يُرسَل عند كل تشغيل حتى لا يتكرر الإشعار المزعج."""
    tag = "رابطك الثابت (لا يتغير أبداً)" if static else "رابط مؤقت (يتغير كل تشغيل)"
    print(f"\n🌐 {tag}: {url}\n")
    try:
        if os.name == "nt":
            import subprocess
            subprocess.run(["clip"], input=url.encode(), shell=True)
    except Exception:
        pass
    base_dir = os.path.dirname(os.path.abspath(__file__))
    last_file = os.path.join(base_dir, "last_tunnel_url.txt")
    last = ""
    try:
        if os.path.exists(last_file):
            with open(last_file, "r", encoding="utf-8") as f:
                last = f.read().strip()
    except Exception:
        pass
    if last == url:
        print("ℹ️ الرابط كما هو من آخر مرة — لن يُرسل إشعار مكرر")
        return
    try:
        with open(last_file, "w", encoding="utf-8") as f:
            f.write(url)
    except Exception:
        pass
    try:
        import threading
        threading.Thread(target=send_whatsapp_direct, args=(url,), daemon=True).start()
        threading.Thread(target=send_ntfy_link, args=(url,), daemon=True).start()
    except Exception as e:
        print("⚠️ تعذر بدء الإرسال:", e)


def start_ngrok_if_configured():
    """الرابط الثابت عبر ngrok — يظل نفسه للأبد (له الأولوية على نفق Cloudflare المؤقت)
    المتطلبات لمرة واحدة (5 دقائق):
      1) حساب مجاني: https://dashboard.ngrok.com/signup
      2) احجز نطاقك الثابت المجاني: https://dashboard.ngrok.com/domains
      3) حمّل ngrok.exe (نسخة مطابقة لويندوزك: 32-bit أو 64-bit) وضعه بجانب البرنامج
      4) انسخ التوكن في ملف ngrok_token.txt بجانب البرنامج
      5) انسخ النطاق (مثل xxxx.ngrok-free.app) في ملف ngrok_domain.txt
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))

    def _read(p):
        try:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    return f.read().strip()
        except Exception:
            pass
        return ""

    token = _read(os.path.join(base_dir, "ngrok_token.txt"))
    domain = _read(os.path.join(base_dir, "ngrok_domain.txt"))
    domain = domain.replace("https://", "").replace("http://", "").strip("/")
    if not token or not domain:
        return None  # غير مفعّل — سيجرّب Cloudflare العادي

    import subprocess
    import time
    import shutil
    import uuid
    import json as _json
    from urllib.request import urlopen

    # تنظيف سجلات ngrok القديمة (أقدم من يومين)
    try:
        for old in os.listdir(base_dir):
            if old.startswith("ngrok_log_"):
                old_path = os.path.join(base_dir, old)
                if time.time() - os.path.getmtime(old_path) > 2 * 86400:
                    os.remove(old_path)
    except Exception:
        pass

    # إن كان ngrok يعمل أصلاً بنفس النطاق — أعد استخدامه
    try:
        with urlopen("http://127.0.0.1:4040/api/tunnels", timeout=2) as r:
            data = _json.loads(r.read().decode("utf-8"))
        for t in data.get("tunnels", []):
            if domain in (t.get("public_url") or ""):
                print("ℹ️ ngrok يعمل أصلاً بنفس النطاق — إعادة استخدام")
                return None, f"https://{domain}"
    except Exception:
        pass

    exe = os.path.join(base_dir, "ngrok.exe" if os.name == "nt" else "ngrok")
    if not os.path.exists(exe):
        found = shutil.which("ngrok")
        if not found:
            print("⚠️ يوجد ngrok_token/ngrok_domain لكن ngrok.exe غير موجود بجانب البرنامج")
            return None
        exe = found

    log_path = os.path.join(base_dir, f"ngrok_log_{uuid.uuid4().hex[:6]}.txt")
    try:
        proc = subprocess.Popen(
            [exe, "http", str(PORT), "--domain=" + domain, "--authtoken=" + token,
             "--log=" + log_path, "--log-format=logfmt"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        print("⚠️ فشل تشغيل ngrok:", e)
        return None

    for _ in range(20):
        time.sleep(1)
        try:
            with urlopen("http://127.0.0.1:4040/api/tunnels", timeout=3) as r:
                data = _json.loads(r.read().decode("utf-8"))
            for t in data.get("tunnels", []):
                if domain in (t.get("public_url") or ""):
                    return proc, f"https://{domain}"
        except Exception:
            pass
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                txt = f.read()
            for bad in ("ERR_NGROK_", "failed to authenticate", "address already in use", "is not a valid"):
                if bad in txt:
                    lines = [l for l in txt.splitlines() if bad in l]
                    print("❌ ngrok: خطأ في الإعداد — راجع ملف:", os.path.basename(log_path))
                    if lines:
                        print("   ", lines[0][:220])
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    return None
        except Exception:
            pass
    print("⚠️ ngrok لم يجهز خلال 20 ثانية — سجل:", os.path.basename(log_path))
    return None


_NGROK_PROC = None  # آخر عملية ngrok شغّلها الحارس


def _ngrok_watchdog(port):
    """حارس النفق — كل دقيقة يتأكد أن رابطك الثابت حي، ويعيد تشغيل ngrok تلقائياً إن سقط
    (بدونه: أي انقطاع بسيط بالشبكة يُسقط النفق ويبقى الرابط ميتاً حتى إعادة فتح البرنامج)
    لا يعمل إلا إذا كان ngrok مفعّلاً (ملفا التوكن والنطاق موجودان بجانب البرنامج)."""
    base_dir = os.path.dirname(os.path.abspath(__file__))

    def _read(p):
        try:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    return f.read().strip()
        except Exception:
            pass
        return ""

    token = _read(os.path.join(base_dir, "ngrok_token.txt"))
    domain = _read(os.path.join(base_dir, "ngrok_domain.txt"))
    domain = domain.replace("https://", "").replace("http://", "").strip("/")
    if not token or not domain:
        return  # ngrok غير مفعّل — لا حاجة للحارس

    import subprocess
    import time
    import shutil
    import json as _json
    from urllib.request import urlopen
    global _NGROK_PROC

    time.sleep(90)  # مهلة لإقلاع النفق الأول قبل أول فحص
    while True:
        try:
            alive = False
            try:
                with urlopen("http://127.0.0.1:4040/api/tunnels", timeout=4) as r:
                    data = _json.loads(r.read().decode("utf-8"))
                for t in data.get("tunnels", []):
                    if domain in (t.get("public_url") or ""):
                        alive = True
                        break
            except Exception:
                alive = False
            if not alive:
                print("⚠️ النفق سقط — جاري إعادة تشغيل ngrok تلقائياً...")
                try:
                    if _NGROK_PROC is not None:
                        _NGROK_PROC.kill()
                except Exception:
                    pass
                exe = os.path.join(base_dir, "ngrok.exe" if os.name == "nt" else "ngrok")
                if not os.path.exists(exe):
                    found = shutil.which("ngrok")
                    exe = found if found else None
                if exe:
                    log_path = os.path.join(base_dir, "ngrok_log_watchdog.txt")
                    try:
                        _NGROK_PROC = subprocess.Popen(
                            [exe, "http", str(port), "--domain=" + domain,
                             "--authtoken=" + token, "--log=" + log_path,
                             "--log-format=logfmt"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                        )
                        print("🔄 أُعيد تشغيل ngrok — الرابط سيعود للعمل خلال ثوانٍ")
                    except Exception as e:
                        print("⚠️ فشلت إعادة تشغيل ngrok:", e)
        except Exception:
            pass
        time.sleep(60)


def start_cloudflare_if_enabled():
    """نفق Cloudflare اختياري — يُفعَّل بمتغير البيئة ENABLE_TUNNEL=1
    (بديل نظيف عن الإرسال إلى تيليغرام: الرابط يظهر في الشاشة ويُنسخ للحافظة)"""
    if os.getenv("ENABLE_TUNNEL", "0") != "1":
        return None

    import subprocess
    import time
    import re
    import uuid
    import shutil

    data_dir = os.path.dirname(os.path.abspath(__file__))

    # تنظيف سجلات النفق القديمة (أقدم من يومين)
    try:
        for old in os.listdir(data_dir):
            if old.startswith("cloudflare_log_"):
                old_path = os.path.join(data_dir, old)
                if time.time() - os.path.getmtime(old_path) > 2 * 86400:
                    os.remove(old_path)
    except Exception:
        pass

    # البحث عن cloudflared بجانب البرنامج أولاً ثم في PATH
    exe = os.path.join(data_dir, "cloudflared.exe" if os.name == "nt" else "cloudflared")
    if not os.path.exists(exe):
        found = shutil.which("cloudflared")
        exe = found if found else "cloudflared"

    log_path = os.path.join(data_dir, f"cloudflare_log_{uuid.uuid4().hex[:6]}.txt")
    try:
        proc = subprocess.Popen(
            [exe, "tunnel", "--url", f"http://localhost:{PORT}"],
            stdout=open(log_path, "w", encoding="utf-8"),
            stderr=subprocess.STDOUT,
        )
    except FileNotFoundError:
        print("⚠️ cloudflared غير مثبت — تخطي النفق")
        return None

    url = None
    for _ in range(45):
        time.sleep(1)
        if os.path.exists(log_path):
            try:
                with open(log_path, "r", encoding="utf-8") as f:
                    m = re.search(r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com", f.read())
                if m:
                    url = m.group(0)
                    break
            except Exception:
                pass

    if url:
        return proc, url
    print("❌ لم يتم العثور على رابط Cloudflare")
    try:
        proc.kill()
    except Exception:
        pass
    return None


# ================== التحديث الذاتي ==================
_UPDATE_LOCK = None
_WORKING_BASE = None  # آخر مصدر تنزيل نجح — يُجرَّب أولاً في المرات التالية


def _update_status_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "update_status.txt")


def _write_status(txt):
    """حالة آخر عملية تحديث — يقرؤها زر الواجهة و/أو /api/update/status"""
    try:
        with open(_update_status_path(), "w", encoding="utf-8") as f:
            f.write(txt)
    except Exception:
        pass


def _get_local_version():
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "version.txt"), "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return ""


def send_ntfy_update(msg):
    """إشعار ntfy عند تطبيق تحديث — يخبر المستخدم بتحديث صفحة المتصفح"""
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        topic_file = os.path.join(base_dir, "ntfy_topic.txt")
        topic = ""
        if os.path.exists(topic_file):
            with open(topic_file, "r", encoding="utf-8") as f:
                topic = f.read().strip()
        if not topic or " " in topic:
            return
        from urllib.request import Request, urlopen
        now = datetime.now().strftime("%H:%M - %d/%m/%Y")
        body = f"{msg}\nالساعة: {now}".encode("utf-8")
        req = Request(
            f"https://ntfy.sh/{topic}",
            data=body,
            headers={
                "Title": "Pharmacy - Update",
                "Tags": "arrows_clockwise",
                "Priority": "default",
            },
        )
        urlopen(req, timeout=15)
        print("🔔 أُرسل إشعار ntfy بالتحديث")
    except Exception:
        pass


def check_for_updates(silent=False):
    """تحديث ذاتي — عند الإقلاع + كل 5 دقائق أثناء التشغيل + زر التحديث
    التنزيل يجرب 3 مصادر بالترتيب (raw → jsDelivr → api.github) لأن بعض الشبكات
    تحجب raw.githubusercontent.com — أول مصدر ينجح يُتذكر ويُجرَّب أولاً لاحقاً.
    أي فشل (بلا إنترنت مثلاً) = تجاهل والتشغيل بالنسخة الحالية.
    """
    global _UPDATE_LOCK, _WORKING_BASE
    base_dir = os.path.dirname(os.path.abspath(__file__))
    try:
        import threading as _th
        import time as _t
        import shutil as _sh
        import urllib.request as _uq
        import urllib.parse as _up

        BASES = [
            "https://raw.githubusercontent.com/ehessan1974-maker/pharmacy-updates/main/",
            "https://cdn.jsdelivr.net/gh/ehessan1974-maker/pharmacy-updates@main/",
            "https://api.github.com/repos/ehessan1974-maker/pharmacy-updates/contents/",
        ]

        def _fetch(rel, timeout):
            """تنزيل ملف واحد من أول مصدر ينجح — يتذكر المصدر الناجح ويعيد تجربة البقية عند الفشل"""
            global _WORKING_BASE
            order = []
            if _WORKING_BASE:
                order.append(_WORKING_BASE)
            order += [b for b in BASES if b != _WORKING_BASE]
            last_err = None
            for b in order:
                try:
                    req = _uq.Request(b + _up.quote(rel))
                    if "api.github.com" in b:
                        req.add_header("Accept", "application/vnd.github.raw")
                        req.add_header("User-Agent", "pharmacy-updater")
                    with _uq.urlopen(req, timeout=timeout) as r:
                        data = r.read()
                    if _WORKING_BASE != b:
                        _WORKING_BASE = b
                        if not silent:
                            print("   ↪ المصدر المستخدم:", b.split("/")[2])
                    return data
                except Exception as e2:
                    last_err = e2
            raise last_err if last_err else IOError("لا يوجد مصدر متاح")

        if _UPDATE_LOCK is None:
            _UPDATE_LOCK = _th.Lock()
        if not _UPDATE_LOCK.acquire(blocking=False):
            if not silent:
                _write_status("busy")
            return

        local_v = _get_local_version()
        _write_status("checking")
        try:
            remote_v = _fetch("version.txt", 8).decode("utf-8", "ignore").strip()
        except Exception:
            _write_status("offline")
            return  # كل المصادر غير متاحة — تشغيل عادي
        if not remote_v or remote_v == local_v:
            _write_status("same:" + local_v)
            return
        # v10-fix: تحديث صاعد فقط — منع الرجوع لنسخة أقدم إن اختلفت المقارنة
        try:
            if int(remote_v) <= int(local_v):
                _write_status("same:" + local_v)
                return
        except ValueError:
            pass

        print(f"⬇ يتوفر تحديث جديد (v{remote_v}) — جاري التحديث التلقائي...")
        _write_status("downloading:" + remote_v)
        manifest_text = _fetch("update_files.txt", 12).decode("utf-8", "ignore")
        manifest = [l.strip() for l in manifest_text.splitlines()
                    if l.strip() and not l.startswith("#")]
        backup_dir = os.path.join(base_dir, "backup_v" + remote_v)
        staged = []
        for i, rel in enumerate(manifest, 1):
            safe = rel.replace("\\", "/")
            if ".." in safe or safe.startswith("/"):
                continue
            data = _fetch(safe, 25)
            dst = os.path.join(base_dir, *safe.split("/"))
            if os.path.exists(dst):
                bdst = os.path.join(backup_dir, *safe.split("/"))
                os.makedirs(os.path.dirname(bdst), exist_ok=True)
                _sh.copy2(dst, bdst)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst + ".new", "wb") as f:
                f.write(data)
            staged.append(dst)
            if not silent and i % 10 == 0:
                print(f"   ...نُزل {i}/{len(manifest)}")
        _write_status("installing:" + remote_v)
        for dst in staged:
            os.replace(dst + ".new", dst)
        with open(os.path.join(base_dir, "version.txt"), "w", encoding="utf-8") as f:
            f.write(remote_v)
        print(f"✅ اكتمل التحديث إلى v{remote_v} — {len(staged)} ملفاً")
        restart_needed = any(os.path.basename(d) == "server.py" for d in staged)
        if restart_needed:
            _write_status("restart:" + remote_v)
            send_ntfy_update(f"تم تحديث البرنامج إلى v{remote_v} — إن لم يعِد تشغيل نفسه خلال دقيقة أعد فتحه من start.bat")
            print("🔄 إعادة تشغيل البرنامج بالنسخة الجديدة...")
            try:
                with open(os.path.join(base_dir, "_updated_restart.tmp"), "w", encoding="utf-8") as f:
                    f.write(str(_t.time()))
            except Exception:
                pass
            _t.sleep(1.5)
            os.execv(sys.executable, [sys.executable, os.path.abspath(__file__)])
        else:
            _write_status("done:" + remote_v)
            send_ntfy_update(f"تم تحديث البرنامج إلى v{remote_v} — حدّث صفحة المتصفح (F5) لتظهر التعديلات")
    except Exception as e:
        try:
            _write_status("error:" + str(e)[:120])
            if not silent:
                print("⚠ تعذر التحديث التلقائي — سيتم التشغيل بالنسخة الحالية:", e)
        except Exception:
            pass
    finally:
        try:
            if _UPDATE_LOCK is not None and _UPDATE_LOCK.locked():
                _UPDATE_LOCK.release()
        except Exception:
            pass


# ================== مسارات التحديث اليدوي (زر الواجهة) ==================
@app.route("/api/update/now", methods=["POST"])
def api_update_now():
    """زر «تحديث البرنامج الآن» — يبدأ الفحص في خيط منفصل ويرد فوراً"""
    import threading
    _write_status("starting")
    threading.Thread(target=check_for_updates, kwargs={"silent": False}, daemon=True).start()
    return jsonify({"ok": True, "msg": "بدأ فحص التحديث"})


@app.route("/api/update/status")
def api_update_status():
    """حالة آخر فحص تحديث + الإصدار الحالي (يستعلمه زر الواجهة كل ثانيتين)"""
    status = ""
    try:
        with open(_update_status_path(), "r", encoding="utf-8") as f:
            status = f.read().strip()
    except Exception:
        status = ""
    return jsonify({"status": status or "idle", "version": _get_local_version()})


if __name__ == "__main__":
    import threading
    import time

    try:
        tunnel_proc = None
        check_for_updates()

        # فحص دوري كل 5 دقائق أثناء التشغيل — التعديلات تصل بلا تدخل من المستخدم
        def _periodic_update_check():
            import time as _pt
            while True:
                _pt.sleep(300)
                try:
                    check_for_updates(silent=True)
                except Exception:
                    pass

        threading.Thread(target=_periodic_update_check, daemon=True).start()
        ng = start_ngrok_if_configured()
        if ng:
            tunnel_proc, turl = ng
            announce_tunnel(turl, static=True)
        else:
            cf = start_cloudflare_if_enabled()
            if cf:
                tunnel_proc, turl = cf
                announce_tunnel(turl, static=False)

        # حارس النفق: يبقي رابطك الثابت حياً — يعيد تشغيل ngrok تلقائياً إن سقط
        threading.Thread(target=_ngrok_watchdog, args=(PORT,), daemon=True).start()

        ip = get_local_ip()
        local_url = f"http://{ip}:{PORT}"
        print(f"\n🌐 الرابط المحلي: {local_url}")
        print(f"💾 قاعدة البيانات: {__import__('db').get_db_path()}\n")

        # QR للوصول من الموبايل
        try:
            import qrcode
            img = qrcode.make(local_url)
            data_dir = os.path.dirname(os.path.abspath(__file__))
            temp_path = os.path.join(data_dir, "_qrcode_temp.png")
            img.save(temp_path)
            if os.name == "nt":
                os.startfile(temp_path)
            print("📱 تم إنشاء QR Code للرابط المحلي")
        except ImportError:
            print("⚠️ مكتبة qrcode غير مثبتة — تخطي QR")

        # فتح المتصفح تلقائياً
        def open_browser():
            time.sleep(2)
            try:
                marker = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_updated_restart.tmp")
                if os.path.exists(marker):
                    fresh = time.time() - os.path.getmtime(marker) < 300
                    try:
                        os.remove(marker)
                    except Exception:
                        pass
                    if fresh:
                        print("ℹ️ تخطي فتح متصفح جديد — إقلاع بعد تحديث والصفحة المفتوحة تحدّث نفسها")
                        return
                import webbrowser
                webbrowser.open(f"http://localhost:{PORT}")
            except Exception:
                pass

        threading.Thread(target=open_browser, daemon=True).start()

        print("🟢 جاري تشغيل السيرفر...")
        app.run(host="0.0.0.0", port=PORT, debug=False)

    except Exception as e:
        print(f"🔥 SERVER ERROR: {e}")
        import traceback
        traceback.print_exc()
