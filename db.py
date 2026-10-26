# db.py — اتصال قاعدة البيانات SQLite الجديدة (بدون أوفيس نهائياً)
import os
import sqlite3
import sys


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
