// invoice-tatbic.js

// هذه للحسابات الداخلية (الدقة العالية)
export function formatHighPrecision(value) {
    if (value === null || value === undefined || value === '') return 0;
    return Number(value).toFixed(22); // دقة عالية جدًا
}
// هذه للعرض للمستخدم (رقمين بعد الفاصلة)
export function format2(value) {
    if (value === null || value === undefined || value === '') return '';
    return Number(value).toFixed(2); 
}

// دالة لجلب جميع الصفوف من جدول الفاتورة مع قيم الحقول اللازمة
// دالة محسّنة لجلب كل صفوف الفاتورة مع القيم الضرورية
export function getInvoiceRows() {
    const rows = [];
    const trList = document.querySelectorAll('tr'); // جلب كل الصفوف

    if (!trList.length) {
        console.warn("لا يوجد صفوف في جدول الفاتورة!");
        return rows;
    }

    trList.forEach((tr, index) => {
        // محاولة استخدام data-item-id، أو fallback إلى index
        const itemId = tr.getAttribute('data-item-id') || `row-${index}`;

        const totalBeforeInput = tr.querySelector('input[data-field="totalBeforeDiscount"]');
        const discountValueInput = tr.querySelector('input[data-field="discountValue"]');
        const discountPercentInput = tr.querySelector('input[data-field="discountPercent"]');
        const totalAfterInput = tr.querySelector('input[data-field="totalAfterDiscount"]');

        if (!totalBeforeInput) {
  /*          console.warn(`صف ${itemId} لا يحتوي على input[data-field="totalBeforeDiscount"]`); */
            return; // تخطي هذا الصف
        }

        rows.push({
            totalBeforeDiscount: parseFloat(totalBeforeInput.value) || 0,
            discountValue: discountValueInput ? parseFloat(discountValueInput.value) || 0 : 0,
            discount: discountPercentInput ? parseFloat(discountPercentInput.value) || 0 : 0,
            el: tr
        });
    });

    if (!rows.length) console.warn("لم يتم العثور على أي صفوف صالحة للحسم!");
    return rows;
}

// دالة تطبيق الحسم على الصفوف للوصول إلى الإجمالي المطلوب
export function applyGlobalDiscountToReachTarget(targetTotal, invoiceInstance = null) {
    const rows = getInvoiceRows();
    if (!rows || !rows.length) return;

    // حساب الإجمالي قبل الحسم
    let totalBefore = rows.reduce((sum, row) => sum + (parseFloat(row.totalBeforeDiscount) || 0), 0);
    if (totalBefore <= 0) return;

    // الحسم المطلوب (يمكن أن يكون سالباً إذا targetTotal > totalBefore)
    let totalDiscount = totalBefore - targetTotal;

    let remaining = totalDiscount;
    let totalAfterAll = 0; // لتجميع الإجمالي بعد الحسم
    let totalDiscountApplied = 0;

    rows.forEach((row, index) => {
        const rowTotal = parseFloat(row.totalBeforeDiscount) || 0;

        // آخر صف يأخذ الباقي لتجنب أي فرق
        let rowDiscount = (index === rows.length - 1)
            ? remaining
            : totalDiscount * (rowTotal / totalBefore);

        if (index !== rows.length - 1) remaining -= rowDiscount;

        // تحديث القيم في row
        row.discountValue = rowDiscount; // استخدم الدقة العالية داخليًا
        row.discount = rowTotal ? (rowDiscount / rowTotal) * 100 : 0;

        // تحديث DOM
        if (row.el) {
            const discountValueInput = row.el.querySelector('input[data-field="discountValue"]');
            if (discountValueInput) discountValueInput.value = formatHighPrecision(row.discountValue);

            const discountPercentInput = row.el.querySelector('input[data-field="discountPercent"]');
            if (discountPercentInput) discountPercentInput.value = formatHighPrecision(row.discount);

            const totalAfterInput = row.el.querySelector('input[data-field="totalAfterDiscount"]');
            if (totalAfterInput) totalAfterInput.value = formatHighPrecision(rowTotal - rowDiscount);
        }

        totalAfterAll += (rowTotal - rowDiscount);
        totalDiscountApplied += rowDiscount;
    });

    // تحديث إجماليات الفاتورة
    const sumAfterEl = document.getElementById("sum-after");
    const sumDiscountEl = document.getElementById("sum-discount");
    if (sumAfterEl) sumAfterEl.textContent = format2(totalAfterAll);
    if (sumDiscountEl) sumDiscountEl.textContent = format2(totalDiscountApplied);

    // إعادة حساب أي شيء آخر إذا موجود
    if (typeof recalcInvoice === "function") recalcInvoice();
}
// ===============================================================
export function bindTargetTotalButton(invoiceInstance) {
    const input = document.getElementById("targetTotalInput");
    if (!input) return;

    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const target = parseFloat(input.value);
            if (isNaN(target)) return;
            const instance = invoiceInstance || window.invoice;
            if (instance) {
                applyGlobalDiscountToReachTarget(target, instance);
            } else {
                applyGlobalDiscountToReachTarget(target);
            }
        }
    });
}