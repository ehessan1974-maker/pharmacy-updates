# -*- coding: utf-8 -*-
"""
محدّث صيدلية إحسان — يعمل مرة واحدة يدوياً لإنقاذ التحديث التلقائي
السبب: بعض الشبكات (مثل شبكات سوريا) تحجب raw.githubusercontent.com
هذا السكربت يجرب 3 مصادر عالمية بالترتيب حتى ينجح أحدها:
  1) raw.githubusercontent.com
  2) cdn.jsdelivr.net (شبكة توصيل عالمية)
  3) api.github.com
ضع هذا الملف + UPDATE-NOW.bat داخل مجلد البرنامج (بجانب start.bat)
ثم شغّل UPDATE-NOW.bat — وبعد هذه المرة يصبح التحديث كله تلقائياً داخل البرنامج.
"""
import os
import sys
import shutil
import socket
import urllib.request
import urllib.parse

try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

BASES = [
    "https://raw.githubusercontent.com/ehessan1974-maker/pharmacy-updates/main/",
    "https://cdn.jsdelivr.net/gh/ehessan1974-maker/pharmacy-updates@main/",
    "https://api.github.com/repos/ehessan1974-maker/pharmacy-updates/contents/",
]

WORKING = [None]  # المصدر الذي نجح — يُجرَّب أولاً


def fetch(rel, timeout):
    """تنزيل ملف من أول مصدر ينجح، مع تذكر المصدر الناجح"""
    order = []
    if WORKING[0]:
        order.append(WORKING[0])
    order += [b for b in BASES if b != WORKING[0]]
    last_err = None
    for b in order:
        try:
            req = urllib.request.Request(b + urllib.parse.quote(rel))
            if "api.github.com" in b:
                req.add_header("Accept", "application/vnd.github.raw")
                req.add_header("User-Agent", "pharmacy-updater")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            if WORKING[0] != b:
                WORKING[0] = b
                print("   OK <- source: " + b.split("/")[2])
            return data
        except Exception as e:
            last_err = e
            print("   (فشل المصدر %s — نجرب التالي...)" % b.split("/")[2])
    raise last_err if last_err else IOError("no source")


def program_running(port):
    try:
        s = socket.create_connection(("127.0.0.1", port), timeout=2)
        s.close()
        return True
    except Exception:
        return False


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    port = int(os.getenv("PORT", "8080"))

    print("")
    print("==========================================")
    print("   محدّث صيدلية إحسان — v.one-click")
    print("==========================================")
    print("")

    if program_running(port):
        print("⚠ البرنامج يعمل حالياً على المنفذ %d!" % port)
        print("  أغلق نافذة البرنامج السوداء أولاً، ثم أعد تشغيل هذا الملف.")
        return 1

    local_v = ""
    try:
        with open(os.path.join(base_dir, "version.txt"), "r", encoding="utf-8") as f:
            local_v = f.read().strip()
    except Exception:
        pass

    print("[1/4] البحث عن آخر إصدار (تجربة 3 مصادر)...")

    try:
        remote_v = fetch("version.txt", 10).decode("utf-8", "ignore").strip()
    except Exception as e:
        print("✗ تعذر الوصول لأي مصدر تحديث. تأكد من الإنترنت وأعد المحاولة.")
        print("  التفاصيل:", str(e)[:100])
        return 1

    print("    الإصدار الحالي: v%s" % (local_v or "?"))
    print("    آخر إصدار متوفر: v%s" % remote_v)
    print("")

    if not remote_v or remote_v == local_v:
        print("✓ البرنامج محدّث بالفعل — لا يوجد شيء للتحديث.")
        print("  شغّل start.bat كالمعتاد.")
        return 0

    print("[2/4] تنزيل قائمة الملفات...")
    manifest_text = fetch("update_files.txt", 15).decode("utf-8", "ignore")
    manifest = [l.strip() for l in manifest_text.splitlines()
                if l.strip() and not l.startswith("#")]
    print("    سيتم تنزيل %d ملفاً..." % len(manifest))
    print("")

    print("[3/4] التنزيل والنسخ الاحتياطي...")
    backup_dir = os.path.join(base_dir, "backup_v" + remote_v)
    staged = []
    for i, rel in enumerate(manifest, 1):
        safe = rel.replace("\\", "/")
        if ".." in safe or safe.startswith("/"):
            continue
        data = fetch(safe, 30)
        dst = os.path.join(base_dir, *safe.split("/"))
        if os.path.exists(dst):
            bdst = os.path.join(backup_dir, *safe.split("/"))
            os.makedirs(os.path.dirname(bdst), exist_ok=True)
            shutil.copy2(dst, bdst)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst + ".new", "wb") as f:
            f.write(data)
        staged.append(dst)
        if i % 10 == 0 or i == len(manifest):
            print("    ...نُزل %d/%d" % (i, len(manifest)))
    print("")

    print("[4/4] التثبيت...")
    for dst in staged:
        os.replace(dst + ".new", dst)
    with open(os.path.join(base_dir, "version.txt"), "w", encoding="utf-8") as f:
        f.write(remote_v)

    print("")
    print("==========================================")
    print("  ✅ تم تثبيت الإصدار v%s بنجاح!" % remote_v)
    print("  الآن شغّل start.bat كالمعتاد — وانتهى الأمر.")
    print("  من الآن فصاعداً كل تحديث يصل تلقائياً بدون هذه الخطوة.")
    print("==========================================")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("✗ خطأ غير متوقع:", str(e)[:150])
        print("  صوّر هذه النافذة وأرسلها للمطور.")
        sys.exit(1)
