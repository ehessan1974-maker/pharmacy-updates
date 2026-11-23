let justAddedRow = false;
import { 
  bindRowSelection,
  handleEnter,
  setIndex,
  getIndex,
  resetIndex
} from "./autocomplete.select.js";
import { calculateItemTotals } from "./invoice.math.js";
import { resolveBatchChange, nextBatchForSplit } from "./batch.qty.rules.js";

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
/* v110: أدوات آلية تغيير رقم الطبخة — الحالات أ/ب/ج مع التراخيص */
function snapshotItem(invItem) {
  return {
    name: invItem.name, cost: invItem.cost, sellPrice: invItem.sellPrice,
    batchNo: invItem.batchNo, company: invItem.company, barcode: invItem.barcode,
    category: invItem.category, chemical: invItem.chemical, stock: invItem.stock,
    quantity: invItem.quantity, receivedAmount: invItem.receivedAmount,
    discountPercent: invItem.discountPercent
  };
}

function restoreItem(invItem, snap) {
  if (!snap) return;
  Object.assign(invItem, snap);
}

/* حساب المتاح للسطر الحالي (يُوحَّد في مكان واحد): رصيد الطبخة − أسطر أخرى نفس الطبخة
   + ترخيص الفاتورة القديمة (الأصلية المتبقية + الأصلية المحذوفة من الجلسة) */
function batchContext(invItem, index) {
  if (typeof invoice.batchInfoFor === 'function') {
    const info = invoice.batchInfoFor(invItem.name, invItem.batchNo, index);
    const stock = info.stock != null ? info.stock : (Number(invItem.stock) || 0);
    const available = stock - (info.othersCurrent || 0) + (info.origAll || 0) + (info.origDeleted || 0);
    return { stock, available, editMode: info.editMode };
  }
  const stock = Number(invItem.stock) || 0;
  return { stock, available: stock, editMode: !!invoice.isLoadingOldInvoice };
}

function fillInvoiceRow(input, item) {

  const tr = input.closest("tr");
  if (!tr) return;

  const tbody = tr.parentElement;
  const index = [...tbody.children].indexOf(tr);

  const invItem = invoice.items[index];
  if (!invItem) return;

  /* v110: التقاط الحالة قبل أي تغيير — الكمية المكتوبة وبيانات الطبخة السابقة */
  const wasSameMaterial = (invItem.name || "") === (item.name || "");
  const enteredQty = invItem.quantity;
  const prev = wasSameMaterial ? snapshotItem(invItem) : null;

  // تحديث input
  input.value = item.name;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  removeAutocomplete();   /* v110: حَدث input أعاد فتح قائمة المطابقات — نغلقها فورًا */

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

  const ctx = batchContext(invItem, index);
  const decision = resolveBatchChange({
    enteredQty: wasSameMaterial ? enteredQty : "",
    batchStock: ctx.stock,
    availableOverride: ctx.available,
    originalQty: Number(invItem._origQty) || 0,
    editMode: ctx.editMode
  });

  const finalize = (qty, opts = {}) => {
    invItem.quantity = (qty === "" || qty === null || qty === undefined) ? "" : Number(qty);
    if (!opts.preserveDiscount) { invItem.receivedAmount = ""; invItem.discountPercent = 0; }
    const active = (opts.preserveDiscount && Number(invItem.discountPercent) > 0) ? "discountPercent" : null;
    Object.assign(invItem, calculateItemTotals(invItem, active));
    invoice.renderTable();
    invoice.updateTotals();
    invoice.saveToLocalStorage();
    setTimeout(() => {
      const currentRow = tbody.children[index];
      if (!currentRow) return;
      const qtyInput = currentRow.querySelector('input[data-field="quantity"]');
      if (qtyInput) {
        qtyInput.value = invItem.quantity;
        if (opts.focusQty !== false) { qtyInput.focus(); qtyInput.select(); }
      }
      invoice.setQtyWarning(index, !!opts.warn);
      if (opts.addRow && Number(invItem.stock) >= 1 && index === invoice.items.length - 1) {
        if (!focusExistingEmptyRow()) addEmptyRowIfNone();
      }
    }, 50);
  };

  const clearRow = () => {
    const empty = invoice.getEmptyItem();
    Object.keys(empty).forEach(k => { invItem[k] = empty[k]; });
    finalize("", {});
  };

  switch (decision.action) {

    /* الحالة أ — فارغة أو صفر: القيمة الافتراضية المعتادة */
    case 'default':
      finalize(decision.defaultQty, { addRow: true });
      if (decision.message) window.showNotification(decision.message, 'warning');
      break;

    /* الحالة ب — الكمية المكتوبة تكفيها: تبقى كما هي مع تحديث الطبخة والإجماليات */
    case 'keep':
      finalize(decision.quantity, { preserveDiscount: true });
      break;

    /* الحالة ج3 — رصيد سالب: لا اعتماد صامتًا إطلاقًا */
    case 'negative': {
      window.showNotification(decision.message, 'error');
      const ok = confirm(decision.message + "\n\nهل تريد اعتماد الكمية رغم نفاد الطبخة؟");
      if (ok) finalize(decision.quantity, { warn: true, preserveDiscount: true });
      else if (prev) { restoreItem(invItem, prev); finalize(prev.quantity, {}); }
      else clearRow();
      break;
    }

    /* الحالة ج — المتاح صفر: تأكيد صريح أيضًا */
    case 'over-zero': {
      window.showNotification(decision.message, 'error');
      const ok = confirm(decision.message + "\n\nهل تريد اعتماد الكمية رغم ذلك؟");
      if (ok) finalize(decision.quantity, { warn: true, preserveDiscount: true });
      else if (prev) { restoreItem(invItem, prev); finalize(prev.quantity, {}); }
      else clearRow();
      break;
    }

    /* الحالة ج — الكمية أكبر من المتاح: تنبيه + خيارات بنقرة واحدة */
    case 'over': {
      window.showNotification(decision.message, 'error');
      const batches = (window.MEDICINE_BATCHES && window.MEDICINE_BATCHES[invItem.name]) || [];
      const reserved = {};
      invoice.items.forEach((it, i) => {
        if (i !== index && it && it.name === invItem.name && it.batchNo) {
          reserved[it.batchNo] = (reserved[it.batchNo] || 0) + (Number(it.quantity) || 0);
        }
      });
      const next = nextBatchForSplit(batches, invItem.batchNo, reserved);
      showQtyResolveDialog(decision.message, {
        available: decision.available,
        onAdjust: () => finalize(decision.available, {}),
        onSplit: next ? () => splitRemainder(index, decision.quantity - decision.available, next) : null,
        onKeep: () => finalize(decision.quantity, { warn: true, preserveDiscount: true }),
        onRevert: prev ? () => { restoreItem(invItem, prev); finalize(prev.quantity, {}); } : null
      });
      break;
    }
  }
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

/* ============================================================
   v110: قائمة اختيار الطبخة + نوافذ خيارات تجاوز الرصيد + توزيع الباقي
   ============================================================ */

function escAttr(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

/* تسجيل الأصل المحذوف من فاتورة قديمة — يُراخص به الرصيد بعد حذف سطر أثناء التعديل */
window.registerDeletedOriginal = function (item) {
  if (!item || item._origBatchNo === undefined || !(Number(item._origQty) > 0)) return;
  const key = (item.name || '') + '\u0001' + String(item._origBatchNo || '');
  window.__deletedOrigQty = window.__deletedOrigQty || {};
  window.__deletedOrigQty[key] = (window.__deletedOrigQty[key] || 0) + Number(item._origQty);
};

/* نوافذ خيارات الحالة ج — أزرار بنقرة واحدة */
function showQtyResolveDialog(message, opts) {
  document.querySelectorAll(".qty-resolve-dialog").forEach(el => el.remove());
  const dlg = document.createElement("div");
  dlg.className = "qty-resolve-dialog";
  let buttons = '';
  if (opts.available > 0 && opts.onAdjust) {
    buttons += `<button type="button" class="qrd-btn qrd-prim" data-act="adjust">ضبط الكمية إلى المتاح (${opts.available})</button>`;
  }
  if (opts.onSplit) {
    buttons += `<button type="button" class="qrd-btn qrd-warn" data-act="split">تقسيم الباقي على طبخة تالية</button>`;
  }
  if (opts.onKeep) {
    buttons += `<button type="button" class="qrd-btn qrd-neutral" data-act="keep">إبقاء الكمية كما هي</button>`;
  }
  if (opts.onRevert) {
    buttons += `<button type="button" class="qrd-btn qrd-danger" data-act="revert">تراجع عن تغيير الطبخة</button>`;
  }
  dlg.innerHTML = `<div class="qrd-msg">${message}</div><div class="qrd-actions">${buttons}</div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener("click", (e) => {
    const act = e.target && e.target.dataset && e.target.dataset.act;
    if (!act) return;
    dlg.remove();
    if (act === 'adjust' && opts.onAdjust) opts.onAdjust();
    if (act === 'split' && opts.onSplit) opts.onSplit();
    if (act === 'keep' && opts.onKeep) opts.onKeep();
    if (act === 'revert' && opts.onRevert) opts.onRevert();
  });
}

/* توزيع الفارق على أول طبخة تالية متاحة لنفس المادة — سطر جديد يُدرج بعد السطر الحالي */
function splitRemainder(index, remainder, batch) {
  const invItem = invoice.items[index];
  if (!invItem || !(remainder > 0)) return;
  invItem.quantity = Math.max(0, Number(invItem.stock) || 0);

  const newRow = invoice.getEmptyItem();
  newRow.name = invItem.name;
  newRow.cost = Number(batch.cost) || 0;
  newRow.sellPrice = Number(batch.general) || 0;
  newRow.batchNo = batch.batchNo ?? "";
  newRow.company = invItem.company ?? "";
  newRow.barcode = invItem.barcode ?? "";
  newRow.category = invItem.category ?? "";
  newRow.chemical = invItem.chemical ?? "";
  newRow.stock = Number(batch.pharmacyQty) || 0;

  const d2 = resolveBatchChange({ enteredQty: remainder, batchStock: newRow.stock });
  newRow.quantity = d2.action === 'keep' ? remainder
    : (d2.available > 0 ? Math.min(remainder, d2.available) : "");

  Object.assign(newRow, calculateItemTotals(newRow, null));
  invoice.items.splice(index + 1, 0, newRow);
  invoice.renderTable();
  invoice.updateTotals();
  invoice.saveToLocalStorage();

  window.showNotification(`تم توزيع الباقي (${remainder}) على الطبخة ${batch.batchNo ?? ''}`, 'success');
  if (d2.action === 'over' || d2.action === 'over-zero') {
    window.showNotification('تنبيه: ما زال الباقي يزيد عن رصيد الطبخة التالية — عدّل الكمية يدويًا', 'error');
  }
  setTimeout(() => {
    const rows = document.querySelectorAll('#items-tbody tr');
    const cur = rows[index], nxt = rows[index + 1];
    const qCur = cur && cur.querySelector('input[data-field="quantity"]');
    const qNxt = nxt && nxt.querySelector('input[data-field="quantity"]');
    if (qCur) { qCur.value = invItem.quantity; }
    if (qNxt) { qNxt.value = newRow.quantity; qNxt.focus(); qNxt.select(); }
  }, 50);
}

/* قائمة الطبخات المتاحة لنفس المادة — من خانة رقم الطبخة (نقر مزدوج / Alt+↓ / زر ▾) */
function openBatchPicker(batchInput) {
  const tr = batchInput.closest("tr");
  if (!tr) return;
  const tbody = tr.parentElement;
  const index = [...tbody.children].indexOf(tr);
  const invItem = invoice.items[index];
  if (!invItem || !invItem.name) {
    window.showNotification("اختر المادة أولًا ثم افتح قائمة الطبخات", "info");
    return;
  }
  const batches = (window.MEDICINE_BATCHES && window.MEDICINE_BATCHES[invItem.name]) || [];
  if (!batches.length) {
    window.showNotification("لا توجد طبخات مسجلة لهذه المادة في جدول ك صيدلية", "error");
    return;
  }

  document.querySelectorAll(".batch-picker").forEach(el => el.remove());

  let rowsHtml = '';
  batches.forEach(b => {
    /* المتاح للسطر عند اختيار هذه الطبخة = رصيدها − أسطر أخرى لنفسها + تراخيص التعديل */
    const others = (typeof invoice.batchInfoFor === 'function')
      ? invoice.batchInfoFor(invItem.name, b.batchNo, index)
      : { othersCurrent: 0, origAll: 0, origDeleted: 0 };
    const avail = (Number(b.pharmacyQty) || 0) - (others.othersCurrent || 0)
      + (others.origAll || 0) + (others.origDeleted || 0);
    const isCurrent = String(invItem.batchNo || '') === String(b.batchNo || '');
    rowsHtml += `
      <div class="bp-row${isCurrent ? ' bp-current' : ''}" data-batch="${escAttr(b.batchNo)}">
        <span>${escAttr(b.batchNo)}</span>
        <span>${Number(b.pharmacyQty) || 0}</span>
        <span>${avail}</span>
        <span>${escAttr(b.expDate)}</span>
        <span>${b.general ?? 0}</span>
        <span>${b.cost ?? 0}</span>
      </div>`;
  });

  const list = document.createElement("div");
  list.className = "batch-picker";
  list.innerHTML = `
    <div class="bp-row bp-header">
      <span>رقم الطبخة</span><span>الرصيد</span><span>المتاح للسطر</span>
      <span>تاريخ الانتهاء</span><span>سعر البيع</span><span>التكلفة</span>
    </div>` + rowsHtml;

  const cell = batchInput.closest("td") || tr;
  cell.appendChild(list);

  list.querySelectorAll(".bp-row:not(.bp-header)").forEach(rEl => {
    rEl.addEventListener("click", () => {
      const b = batches.find(x => String(x.batchNo || '') === String(rEl.dataset.batch || ''));
      document.querySelectorAll(".batch-picker").forEach(el => el.remove());
      if (!b) return;
      const materialInput = tr.querySelector(".material-input") || batchInput;
      fillInvoiceRow(materialInput, b);
    });
  });

  const closeOnOutside = (e) => {
    if (!e.target.closest('.batch-cell') && !e.target.closest('.batch-picker')) {
      document.querySelectorAll(".batch-picker").forEach(el => el.remove());
      document.removeEventListener('mousedown', closeOnOutside, true);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeOnOutside, true), 0);
}

window.openBatchPicker = openBatchPicker;