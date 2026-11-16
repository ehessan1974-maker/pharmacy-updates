// static/barcode-camera.js - نسخة توقف الكاميرا بعد أول قراءة

let html5QrCode = null;
let activeInput = null;
let cameraActive = false;
let lastScannedCode = "";
let lastScanTime = 0;
const SCAN_DEBOUNCE_MS = 1500; // لتجنب القراءة المزدوجة خلال 1.5 ثانية

async function startSimpleBarcodeScanner(inputElement) {
    if (cameraActive) {
        activeInput = inputElement;
        return;
    }

    activeInput = inputElement;
    cameraActive = true;

    const container = document.createElement('div');
    container.id = 'barcode-scanner-overlay';
    container.innerHTML = `
    <div id="barcode-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.9); z-index:100000; display:flex; align-items:center; justify-content:center; flex-direction:column;">
        <div style="width:95%; max-width:500px; background:white; padding:15px; border-radius:12px; text-align:center;">
            <div style="margin-bottom:10px; font-weight:bold;">🔍 مسح الباركود</div>
            <div id="reader" style="width:100%;"></div>
            <div style="margin-top:10px; font-size:12px; color:#666;">ضع الباركود أمام الكاميرا</div>
            <button id="closeScanner" style="margin-top:15px; padding:10px 20px; background:#dc3545; color:white; border:none; border-radius:8px; cursor:pointer;">إغلاق الكاميرا</button>
        </div>
    </div>`;
    document.body.appendChild(container);

    try {
        if (!window.Html5Qrcode) {
            await loadQrLibrary();
        }

        html5QrCode = new Html5Qrcode("reader");
        
        const config = { fps: 60, qrbox: { width: 280, height: 150 }, aspectRatio: 1.777 };
        
        await html5QrCode.start({ facingMode: "environment" }, config, async (decodedText) => {
            // منع التكرار السريع
            const now = Date.now();
            if (decodedText === lastScannedCode && (now - lastScanTime) < SCAN_DEBOUNCE_MS) {
                console.log("⚠️ تجاهل تكرار:", decodedText);
                return;
            }
            lastScannedCode = decodedText;
            lastScanTime = now;
            
            console.log("✅ تم قراءة الباركود:", decodedText);
            
            const input = activeInput;
            if (!input) return;
            
            // البحث عن المادة وتعبئة الحقول
            await searchAndSelectMaterial(decodedText, input);
            
            // إيقاف الكاميرا فوراً بعد القراءة الأولى (أو يمكنك إبقاؤها مفتوحة حسب رغبتك)
            await stopScanner();
        });
        
    } catch (err) {
        console.error("❌ فشل تشغيل الكاميرا:", err);
        alert("فشل تشغيل الكاميرا. تأكد من منح الإذن.");
        stopScanner();
    }

    document.getElementById("closeScanner").onclick = () => {
        stopScanner();
    };
}

async function stopScanner() {
    cameraActive = false;
    try {
        if (html5QrCode && html5QrCode.isScanning) {
            await html5QrCode.stop();
            await html5QrCode.clear();
            html5QrCode = null;
        }
    } catch(e) { console.warn("خطأ في إيقاف الكاميرا:", e); }
    
    document.getElementById("barcode-scanner-overlay")?.remove();
    activeInput = null;
    // لا نمسح lastScannedCode هنا للسماح بمسح باركود مختلف بعد إعادة الفتح
}

async function searchAndSelectMaterial(barcode, inputElement) {
    if (!window.MEDICINES && !window.MEDICINES_MAP) {
        console.warn("⚠️ بيانات الأدوية غير محملة بعد");
        if (typeof loadMedicinesFromServer === 'function') {
            await loadMedicinesFromServer();
        }
        await new Promise(r => setTimeout(r, 300));
    }
    
    let foundMaterial = null;
    const medicinesList = window.MEDICINES || [];
    
    // البحث باستخدام includes (تطابق جزئي)
    for (const med of medicinesList) {
        const storedBarcode = med.barcode ? String(med.barcode) : '';
        if (storedBarcode && (storedBarcode.includes(barcode) || String(barcode).includes(storedBarcode))) {
            foundMaterial = med;
            break;
        }
    }
    
    // إذا لم يتم العثور، جرب بالاسم المباشر أو الكود
    if (!foundMaterial && window.MEDICINES_MAP && window.MEDICINES_MAP[barcode]) {
        foundMaterial = window.MEDICINES_MAP[barcode];
    }
    
    if (foundMaterial) {
        inputElement.focus();
        inputElement.value = foundMaterial.name;
        inputElement.dispatchEvent(new InputEvent("input", { bubbles: true, data: foundMaterial.name, inputType: "insertText" }));
        inputElement.dispatchEvent(new Event("change", { bubbles: true }));
        
        if (typeof window.fillInvoiceRow === "function") {
            window.fillInvoiceRow(inputElement, foundMaterial);
        }
        
        inputElement.dispatchEvent(new Event("blur", { bubbles: true }));
        return;
    }
    
    // لم يتم العثور
    console.log(`⚠️ لم يتم العثور على مادة للباركود: ${barcode}`);
    inputElement.value = barcode;
    inputElement.focus();
    inputElement.select();
}

function loadQrLibrary() {
    return new Promise((resolve, reject) => {
        if (window.Html5Qrcode) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

function attachCameraIconToMaterialInput(inputElement, wrapperDiv) {
    if (!inputElement.closest('#items-tbody')) return;
    if (wrapperDiv.querySelector('.camera-icon-simple')) return;

    wrapperDiv.style.position = 'relative';

    const icon = document.createElement('i');
    icon.className = 'fas fa-camera camera-icon-simple';
    icon.style.cssText = `
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        cursor: pointer;
        color: #198754;
        font-size: 20px;
        z-index: 10;
        background: white;
        border-radius: 50%;
        padding: 6px;
        box-shadow: 0 2px 4px rgba(0,0,0,.2);
    `;
    icon.title = "فتح كاميرا الباركود";
    icon.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startSimpleBarcodeScanner(inputElement);
    };
    wrapperDiv.appendChild(icon);
}

window.attachCameraIcon = attachCameraIconToMaterialInput;
window.startBarcodeScanner = startSimpleBarcodeScanner;
window.stopBarcodeScanner = stopScanner;