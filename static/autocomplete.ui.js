let justAddedRow = false;
import { 
  bindRowSelection,
  handleEnter,
  setIndex,
  getIndex,
  resetIndex
} from "./autocomplete.select.js";
import { calculateItemTotals } from "./invoice.math.js";

// ─────────────────────────────
// تقييم العمليات الحسابية بأمان
// ─────────────────────────────
function safeEvaluate(expr) {

  if (!expr) return null;

  // السماح فقط بالأرقام والعمليات
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    return null;
  }

  try {
    const result = Function('"use strict"; return (' + expr + ')')();
    if (!isFinite(result)) return null;
    return result;

  } catch {
    return null;
  }
}

/* =========================
   البحث
========================= */
function searchMedicines(term) {
    if (!term || !term.trim()) return [];

    const original = term;
    const trimmed = term.trimEnd();
    const hadTrailingSpaces = original.length > trimmed.length;

    const isExactCodeMode = hadTrailingSpaces && (original.length - trimmed.length >= 2);

    const pattern = trimmed.toLowerCase();
    const medicines = Object.values(MEDICINES);

    if (isExactCodeMode) {
        return medicines.filter(med => {
            const code = String(med.code || '').trim().toLowerCase();
            if (!pattern.includes('*')) {
                return code === pattern;
            }
            const parts = pattern.split('*').map(p => p.trim()).filter(p => p.length > 0);
            return parts.length > 0 && parts.every(part => code.includes(part));
        });
    }

    const parts = pattern.split('*').map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length === 0) return [];

    return medicines.filter(med => {
        const fields = [
            String(med.name     || '').toLowerCase(),
            String(med.company  || '').toLowerCase(),
            String(med.general  || '').toLowerCase(),
            String(med.barcode  || '').toLowerCase(),
            String(med.category || '').toLowerCase(),
            String(med.chemical || '').toLowerCase(),
            String(med.code     || '').toLowerCase(),
            String(med.batchNo  || '').toLowerCase(),
        ];

        return parts.every(part => fields.some(f => f.includes(part)));
    });
}

/* =========================
   أدوات
========================= */
function removeAutocomplete() {
  document.querySelectorAll(".autocomplete-list").forEach(el => el.remove());
}

function updateActiveRow(list, index) {
  const rows = list.querySelectorAll(".ac-row:not(.ac-header)");
  rows.forEach((row, i) => row.classList.toggle("active", i === index));
  rows[index]?.scrollIntoView({ block: "nearest" });
}

// دالة مساعدة لإضافة سطر جديد فقط إذا لم يكن هناك سطر فارغ
function addEmptyRowIfNone() {
  setTimeout(() => {
    const tbody = document.getElementById("items-tbody");
    if (!tbody) return;

    const hasEmpty = Array.from(tbody.querySelectorAll("tr")).some(row => {
      const input = row.querySelector('input.material-input');
      return input && !input.value.trim();
    });

    if (!hasEmpty) {
      invoice.addEmptyRow();
    }
  }, 10);
}
// ==============================================
function fillInvoiceRow(input, item) {

  const tr = input.closest("tr");
  if (!tr) return;

  const tbody = tr.parentElement;
  const index = [...tbody.children].indexOf(tr);

  const invItem = invoice.items[index];
  if (!invItem) return;

  // تحديث input
  input.value = item.name;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // تحديث بيانات العنصر
  invItem.name      = item.name;
  invItem.cost      = Number(item.cost) || 0;
  invItem.sellPrice = Number(item.general) || 0;
  invItem.batchNo   = item.batchNo ?? "";
  invItem.company   = item.company ?? "";
  invItem.barcode   = item.barcode ?? "";
  invItem.category  = item.category ?? "";
  invItem.chemical  = item.chemical ?? "";
  invItem.stock     = Number(item.pharmacyQty) || 0;

  const pharmacyQty = invItem.stock;

  // 🔥🔥🔥 الحل الأساسي: إعادة تعيين الكمية بالقيمة الافتراضية الجديدة 🔥🔥🔥
  if (pharmacyQty >= 1) {
    invItem.quantity = 1;
  } else if (pharmacyQty > 0) {
    invItem.quantity = pharmacyQty;
  } else {
    invItem.quantity = "";
  }

  // 🔥 إعادة تعيين الحقول المرتبطة بالكمية
  invItem.receivedAmount = "";
  invItem.discountPercent = 0;
  invItem.discountValue = 0;

  // حساب الإجماليات
  Object.assign(invItem, calculateItemTotals(invItem));

  // إعادة الرسم
  invoice.renderTable();
  invoice.updateTotals();
  invoice.saveToLocalStorage(); 

  // 🔥 إزالة القائمة المنسدلة
  removeAutocomplete();

  // التحكم بالفوكس بعد render
  setTimeout(() => {
    const currentRow = tbody.children[index];
    if (!currentRow) return;

    const qtyInput = currentRow.querySelector('input[data-field="quantity"]');
    if (!qtyInput) return;

    // 🔥 تحديث قيمة الكمية في واجهة المستخدم
    qtyInput.value = invItem.quantity;
    
    // نقل التركيز إلى حقل الكمية
    qtyInput.focus();
    qtyInput.select();

    // إضافة سطر جديد فقط إذا كان هذا هو آخر سطر في الجدول
    if (pharmacyQty >= 1 && index === invoice.items.length - 1) {
      if (!focusExistingEmptyRow()) {
        addEmptyRowIfNone();
      }
    }
  }, 50);
}

// window.fillInvoiceRow = fillInvoiceRow;

// =========== إنشاء القائمة ==============

function createAutocomplete(input, matches) {

  removeAutocomplete();

  const list = document.createElement("div");
  list.className = "autocomplete-list";
  
  // منع فقدان التركيز عند الضغط بالماوس على القائمة
  list.addEventListener("mousedown", (e) => {
    e.preventDefault();
    input.focus();
  });

  list.innerHTML = `
    <div class="ac-row ac-header">
      <span>المادة</span>
      <span>الشركة</span>
      <span>التكلفة</span>
      <span>عموم</span>
      <span>ك صيدلية</span>
      <span>رقم الطبخة</span>
      <span>تاريخ الصنع</span>
      <span>تاريخ انتهاء الفعالية</span>
      <span>رمز الباركود</span>
      <span>ك مشتريات</span>
      <span>ك مبيعات</span>
      <span>التصنيف</span>
      <span>التركيب الكيميائي</span>
      <span>الرمز</span>
      <span>السعر الأساسي</span>
    </div>
  `;

  matches = matches.slice(0, 50);
  matches.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "ac-row ac-item";
    row.dataset.index = i;

    row.innerHTML = `
      <span>${item.name}</span>
      <span>${item.company ?? ""}</span>
      <span>${item.cost ?? 0}</span>
      <span>${item.general ?? ""}</span>
      <span>${item.pharmacyQty ?? 0}</span>
      <span>${item.batchNo ?? ""}</span>
      <span>${item.mfgDate ?? ""}</span>
      <span>${item.expDate ?? ""}</span>
      <span>${item.barcode ?? ""}</span>
      <span>${item.purchasesQty ?? 0}</span>
      <span>${item.salesQty ?? 0}</span>
      <span>${item.category ?? ""}</span>
      <span>${item.chemical ?? ""}</span>
      <span>${item.code ?? ""}</span>
      <span>${item.basePrice ?? 0}</span>
    `;

    list.appendChild(row);
  });

  bindRowSelection(list, (index) => updateActiveRow(list, index));

  // معالجة الاختيار عند الضغط بالماوس
  list.addEventListener("ac-select", function handleAcSelect(e) {
    const selectedIndex = e.detail.index;
    
    if (selectedIndex >= 0 && selectedIndex < matches.length) {
      setTimeout(() => {
        fillInvoiceRow(input, matches[selectedIndex]);
      }, 0);
      removeAutocomplete();
      resetIndex();
      
      setTimeout(() => {
        const tr = input.closest("tr");
        if (tr) {
          const qtyInput = tr.querySelector('input[data-field="quantity"]');
          if (qtyInput) {
            if (!qtyInput.value || qtyInput.value.trim() === "") {
              qtyInput.value = 1;
            }
            qtyInput.focus();
            qtyInput.select();
          }
        }
      }, 50);
    }
  }, { once: true });
  
  input.parentElement.appendChild(list);
  setIndex(0);
  updateActiveRow(list, 0);
}

/* =========================
   ربط الحقول
========================= */
let matchesMap = new WeakMap();

document.addEventListener("input", e => {
  const input = e.target.closest(".material-input");
  if (!input) return;

  const matches = searchMedicines(input.value);
  matchesMap.set(input, matches);

  const ghost = input.parentElement.querySelector(".ghost-suggestion");
  if (ghost) {
    if (matches.length && input.value) {
      const suggestion = matches[0].name;
      if (suggestion.toLowerCase().startsWith(input.value.toLowerCase())) {
        ghost.textContent = suggestion;
      } else {
        ghost.textContent = "";
      }
    } else {
      ghost.textContent = "";
    }
  }

  if (matches.length && input.value) {
    createAutocomplete(input, matches);
  } else {
    removeAutocomplete();
  }
});

// -----------------------------------------------
document.addEventListener("keydown", e => {

  const input = e.target.closest(".material-input");
  if (!input) return;

  const list = input.parentElement.querySelector(".autocomplete-list");

if (list && document.activeElement !== input) {
  input.focus({ preventScroll: true });
}


  // إذا لم تكن القائمة مفتوحة لا نتدخل
  if (!list) return;

  // منع أي listener آخر في النظام
  e.stopImmediatePropagation();

  const matches = matchesMap.get(input) || searchMedicines(input.value);

  const rows = list.querySelectorAll(".ac-row:not(.ac-header)");
  if (!rows.length) return;

  // ↓
if (e.key === "ArrowDown") {

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  // إبقاء المؤشر داخل خانة المادة
  input.focus();

  const next = (getIndex() + 1) % rows.length;

  setIndex(next);

  updateActiveRow(list, next);

  return;
}

  // ↑
if (e.key === "ArrowUp") {

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  // إبقاء المؤشر داخل خانة المادة
  input.focus();

  const prev = (getIndex() - 1 + rows.length) % rows.length;

  setIndex(prev);

  updateActiveRow(list, prev);

  return;
}

  // Enter
  if (e.key === "Enter") {

    e.preventDefault();

    const idx = getIndex() >= 0 ? getIndex() : 0;

    const selectedItem = matches[idx];

    if (selectedItem) {

      fillInvoiceRow(input, selectedItem);

      resetIndex();

      removeAutocomplete();

    }

    return;
  }

  // Escape
  if (e.key === "Escape") {

    e.preventDefault();

    removeAutocomplete();

    return;
  }

  // Tab
  if (e.key === "Tab") {

    e.preventDefault();

    const idx = getIndex() >= 0 ? getIndex() : 0;

    const selectedItem = matches[idx];

    if (selectedItem) {

      fillInvoiceRow(input, selectedItem);

      resetIndex();

      removeAutocomplete();

    }

    return;
  }

});
// -----------------------------------------------

// ALT + ArrowDown → فتح القائمة يدوياً
document.addEventListener("keydown", function(e) {
  if (e.altKey && e.key === "ArrowDown") {
    const input = e.target.closest(".material-input");
    if (!input) return;
    
    e.preventDefault();
    
    const term = input.value.trim();
    let matches;
    
    if (term) {
      matches = searchMedicines(term);
    } else {
      matches = Object.values(MEDICINES).slice(0, 50);
    }
    
    matchesMap.set(input, matches);
    createAutocomplete(input, matches);
    setIndex(0);
    
    const list = input.parentElement.querySelector(".autocomplete-list");
    if (list) {
      updateActiveRow(list, 0);
    }
  }
});

// F2 → تحديد كامل النص
document.addEventListener("keydown", function(e) {
  if (e.key !== "F2") return;
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (!input.closest("#items-tbody")) return;
  if (input.readOnly || input.type === "hidden" || input.type === "button") return;
  e.preventDefault();
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
});

/* =========================
   دعم العمليات الحسابية في خانة الكمية
========================= */
function applyQuantityCalculation(input) {
  if (!input) return;

  const expr = input.value.trim();
  if (expr === "") return;

  const tr = input.closest("tr");
  if (!tr) return;
  const tbody = tr.closest("tbody");
  if (!tbody) return;
  const index = Array.from(tbody.children).indexOf(tr);
  if (index === -1) return;
  const invItem = invoice.items[index];
  if (!invItem) return;

  if (!/[+\-*/()]/.test(expr)) {
    const numberValue = parseFloat(expr);
    if (!isNaN(numberValue)) {
      invItem.quantity = numberValue;
      Object.assign(invItem, calculateItemTotals(invItem));
      invoice.updateRow(tr, invItem, "quantity");
      invoice.updateTotals();
    }
    return;
  }

  const result = safeEvaluate(expr);
  if (result === null) return;

  invItem.quantity = result;
  Object.assign(invItem, calculateItemTotals(invItem));
  invoice.updateRow(tr, invItem, "quantity");
  invoice.updateTotals();

  requestAnimationFrame(() => {
    const newRow = tbody.children[index];
    if (!newRow) return;
    const qtyInput = newRow.querySelector('input[data-field="quantity"]');
    if (qtyInput) {
      qtyInput.value = result;
      qtyInput.focus();
      qtyInput.select();
    }
  });
}

document.addEventListener("blur", function(e) {
  const input = e.target;
  if (!input.matches('input[data-field="quantity"]')) return;
  applyQuantityCalculation(input);
}, true);

document.addEventListener("keydown", function(e) {
  const input = e.target;
  if (!input.matches('input[data-field="quantity"]')) return;
  if (e.key !== "Enter") return;

  e.preventDefault();

  const expr = input.value.trim();
  const tr = input.closest("tr");
  if (!tr) return;
  const tbody = tr.closest("tbody");
  if (!tbody) return;
  const index = Array.from(tbody.children).indexOf(tr);
  if (index === -1) return;

  const invItem = invoice.items[index];
  if (!invItem) return;

  let finalQty = Number(expr) || 0;

  if (expr && /[+\-*/()]/.test(expr)) {
    const result = safeEvaluate(expr);
    if (result !== null) {
      finalQty = result;
      input.value = result;
    }
  }

  invItem.quantity = finalQty;
  Object.assign(invItem, calculateItemTotals(invItem, "quantity"));
  invoice.updateRow(tr, invItem, "quantity");
  invoice.updateTotals();

  if (!focusExistingEmptyRow()) {
    addEmptyRowIfNone();
    setTimeout(() => {
      const newRow = tbody.lastElementChild;
      const materialInput = newRow?.querySelector(".material-input");
      if (materialInput) materialInput.focus();
    }, 30);
  }
});

let quantityCalcTimer = null;

document.addEventListener("input", function(e) {
  const input = e.target;
  if (!input.matches('input[data-field="quantity"]')) return;

  const expr = input.value.trim();
  if (!expr) return;
  if (!/[+\-*/()]/.test(expr)) return;

  clearTimeout(quantityCalcTimer);

  quantityCalcTimer = setTimeout(() => {
    const result = safeEvaluate(expr);
    if (result === null) return;

    const tr = input.closest("tr");
    if (!tr) return;
    const tbody = tr.closest("tbody");
    if (!tbody) return;
    const index = Array.from(tbody.children).indexOf(tr);
    if (index === -1) return;

    const invItem = invoice.items[index];
    if (!invItem) return;

    invItem.quantity = result;
    Object.assign(invItem, calculateItemTotals(invItem, "quantity"));
    invoice.updateRow(tr, invItem, "quantity");
    invoice.updateTotals();
    input.value = result;
    input.focus();
  }, 400);

});

window.fillInvoiceRow = fillInvoiceRow;