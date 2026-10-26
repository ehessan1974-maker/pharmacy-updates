# materials_routes.py — مسارات بطاقات المواد (SQLite)
from flask import Blueprint, jsonify, request

from db import get_conn

materials_bp = Blueprint("materials", __name__)

# ---------------------------------------------------------
@materials_bp.route("/api/materials")
def get_materials():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute('SELECT * FROM "بطاقات المواد" ORDER BY "المادة"')

        data = []
        for r in cur.fetchall():
            r = dict(r)
            data.append({
                "barcode": r.get("رمز الباركود"),
                "name": r.get("المادة"),
                "company": r.get("الشركة"),
                "base_price": r.get("السعر الأساسي"),
                "general_free": r.get("عموم حر"),
                "general_20": r.get("عموم 20 %"),
                "general_approved": r.get("عموم معتمد"),
                "category": r.get("التصنيف"),
                "profit_ratio": r.get("نسبة الربح"),
                "latin_name": r.get("الاسم اللاتيني"),
                "net_free": r.get("نيت حر"),
                "package": r.get("العبوة"),
                "strength": r.get("العيار"),
                "form": r.get("الشكل الصيدلاني"),
                "composition": r.get("التركيب الكيميائي"),
                "unit": r.get("وحدة العبوة"),
                "trade_name": r.get("اسم المستحضر"),
                "code": r.get("الرمز"),
                "updated": r.get("تعديل جديد"),
                "base_price_usd": r.get("السعر الأساسي دولار"),
                "general_approved_usd": r.get("عموم معتمد دولار"),
                "general_20_usd": r.get("عموم 20 % دولار"),
            })

        conn.close()
        return jsonify(data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------
@materials_bp.route("/api/materials/search")
def search_materials():
    try:
        q = request.args.get("q", "").strip()
        limit = int(request.args.get("limit", 1000))

        conn = get_conn()
        cur = conn.cursor()

        like_term = f"%{q}%"
        query = f"""
        SELECT *
        FROM "بطاقات المواد"
        WHERE
            "المادة" LIKE ? OR
            "رمز الباركود" LIKE ? OR
            "الشركة" LIKE ? OR
            "التصنيف" LIKE ? OR
            "الاسم اللاتيني" LIKE ?
        LIMIT ?
        """
        cur.execute(query, (like_term, like_term, like_term, like_term, like_term, limit))

        data = []
        for row in cur.fetchall():
            r = dict(row)
            data.append({
                "barcode": r.get("رمز الباركود"),
                "name": r.get("المادة"),
                "company": r.get("الشركة"),
                "base_price": r.get("السعر الأساسي"),
                "general_free": r.get("عموم حر"),
                "general_20": r.get("عموم 20 %"),
                "general_approved": r.get("عموم معتمد"),
                "category": r.get("التصنيف"),
                "profit_ratio": r.get("نسبة الربح"),
                "latin_name": r.get("الاسم اللاتيني"),
                "net_free": r.get("نيت حر"),
                "package": r.get("العبوة"),
                "strength": r.get("العيار"),
                "form": r.get("الشكل الصيدلاني"),
                "composition": r.get("التركيب الكيميائي"),
                "unit": r.get("وحدة العبوة"),
                "trade_name": r.get("اسم المستحضر"),
                "code": r.get("الرمز"),
                "updated": r.get("تعديل جديد"),
                "base_price_usd": r.get("السعر الأساسي دولار"),
                "general_approved_usd": r.get("عموم معتمد دولار"),
                "general_20_usd": r.get("عموم 20 % دولار"),
            })

        conn.close()
        return jsonify(data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------
@materials_bp.route('/api/materials/update-approved', methods=['POST'])
def update_general_approved():
    cursor = None
    conn = None
    try:
        data = request.get_json()
        material_name = data.get("material_name")
        field = data.get("field")
        value = data.get("value")

        if not material_name or not field:
            return jsonify({"status": "error", "msg": "missing data"})

        allowed_fields = ["عموم معتمد", "رمز الباركود", "الشركة", "السعر الأساسي"]
        if field not in allowed_fields:
            return jsonify({"status": "error", "msg": "غير مسموح تعديل هذا الحقل"})

        conn = get_conn()
        cursor = conn.cursor()

        cursor.execute(
            f'UPDATE "بطاقات المواد" SET "{field}" = ? WHERE "المادة" = ?',
            (value, material_name),
        )
        conn.commit()
        return jsonify({"status": "success"})

    except Exception as e:
        return jsonify({"status": "error", "msg": str(e)})

    finally:
        try:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
        except Exception:
            pass
