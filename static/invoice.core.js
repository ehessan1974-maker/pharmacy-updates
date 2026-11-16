import { bindTargetTotalButton } from './invoice-tatbic.js';
import { calculateItemTotals } from "./invoice.math.js";

document.addEventListener("DOMContentLoaded", () => {
    bindTargetTotalButton();
});

function format2(value) {
    if (value === null || value === undefined || value === '') return '';
    return Number(value).toFixed(2);
}

// ========== دوال الإشعارات المرنة ==========
const NOTIFICATION_STORAGE_KEY = 'invoice_notification_mode';

window.getNotificationMode = function() {
    const mode = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (mode === 'alert' || mode === 'toast' || mode === 'none') return mode;
    return 'toast';
};

window.setNotificationMode = function(mode) {
    if (mode === 'alert' || mode === 'toast' || mode === 'none') {
        localStorage.setItem(NOTIFICATION_STORAGE_KEY, mode);
    }
};

window.showNotification = function(message, type = 'success') {
    // إزالة أي إشعارات قديمة لتجنب التراكم
    const existingToasts = document.querySelectorAll('div[style*="position: fixed"][style*="bottom: 20px"]');
    existingToasts.forEach(toast => toast.remove());

    const mode = window.getNotificationMode();
    if (mode === 'none') return;
    if (mode === 'alert') {
        alert(message);
        return;
    }
    const toast = document.createElement('div');
    toast.innerText = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#ffc107'};
        color: ${type === 'warning' ? '#000' : '#fff'};
        padding: 12px 24px;
        border-radius: 30px;
        font-size: 14px;
        font-weight: bold;
        z-index: 100000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        direction: rtl;
        animation: fadeInUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
};

// إضافة نمط الحركة
if (!document.querySelector('#toast-animation-style')) {
    const style = document.createElement('style');
    style.id = 'toast-animation-style';
    style.textContent = `
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
}

// ========== كلاس الفاتورة ==========
class PharmacyInvoice {

    async tahdith() {
        try {
            const response = await fetch("/run_query1", { method: "POST" });
            const result = await response.json();
            if (result.success) {
                console.log("✔ تم تحديث جدول ك صيدلية");
                await this.reloadMedicinesOnly();
            } else {
                console.error("❌ فشل التحديث");
            }
        } catch (error) {
            console.error("❌ خطأ:", error);
        }
    }

    async reloadMedicinesOnly() {
        try {
            const res = await fetch("/medicines");
            const data = await res.json();
            window.MEDICINES = {};
            data.forEach(med => { window.MEDICINES[med.name] = med; });
            console.log("🔄 تم تحديث MEDICINES:", Object.keys(window.MEDICINES).length);
            this.renderTable();
        } catch (err) {
            console.error("❌ خطأ تحميل الأدوية:", err);
        }
    }

    updateRow(row, item, activeField = null) {
        row.querySelectorAll("input").forEach(input => {
            const field = input.dataset.field;
            if (!field) return;
            if (field === activeField) return;
            input.value = item[field] !== undefined && item[field] !== null ? item[field] : "";
        });
    }

    updateItemsFromDOM() {
        const rows = document.querySelectorAll('#items-tbody tr');
        rows.forEach((tr, index) => {
            const item = this.items[index];
            if (!item) return;
            const getVal = (field) => {
                const el = tr.querySelector(`input[data-field="${field}"]`);
                return el ? parseFloat(el.value) || 0 : 0;
            };
            item.discountPercent = getVal("discountPercent");
            item.discountValue = getVal("discountValue");
            item.totalBeforeDiscount = getVal("totalBeforeDiscount");
            item.totalAfterDiscount = getVal("totalAfterDiscount");
            item.sellPrice = getVal("sellPrice");
        });
    }

    // دالة مساعدة للتحقق من وجود فاتورة
    async checkInvoiceExists(invoiceNumber) {
        try {
            const response = await fetch(`/invoice?number=${encodeURIComponent(invoiceNumber)}`);
            const data = await response.json();
            return data.header && data.header.invoiceNumber === invoiceNumber;
        } catch {
            return false;
        }
    }

    // دالة إنهاء ناجح (تجنب التكرار)
    async finalizeSaveSuccess() {
        if (typeof window.refreshBuyersList === 'function') {
            await window.refreshBuyersList();
        }
        localStorage.removeItem(this.STORAGE_KEY);
        this.initInvoiceNumberCombo();
        this.isLoadingOldInvoice = false;
        this.items = [];
        this.addEmptyRow();
        this.setNewInvoiceState({ updateDateTime: true });
        this.updateTotals();
        localStorage.setItem('invoiceSaved', Date.now().toString());
        window.location.reload();
    }

async saveInvoice() {
    console.log("SAVE FUNCTION CALLED");

    const hasData = this.items.some(item =>
        (item.name && item.name.trim() !== "") ||
        (Number(item.quantity) > 0)
    );

    const currentInvoiceNumber = document.getElementById("invoice-number").value;

    // حالة الفاتورة الفارغة
    if (!hasData) {
        if (currentInvoiceNumber === "فاتورة جديدة") {
            window.showNotification("لا توجد فاتورة لحفظها", "error");
            return;
        }
        // التحقق من وجود الفاتورة في قاعدة البيانات
        const exists = await this.checkInvoiceExists(currentInvoiceNumber);
        if (!exists) {
            window.showNotification("لا توجد فاتورة لحفظها (الفاتورة غير موجودة في المبيعات)", "error");
            return;
        }
        // إذا كانت موجودة، نطلب تأكيد الحذف مباشرة (لا نرسل طلب force=false)
        const userChoice = confirm(`⚠️ توجد فاتورة سابقة بنفس الرقم (${currentInvoiceNumber}).\nلا توجد أصناف لحفظها.\nهل تريد حذف الفاتورة القديمة بالكامل؟`);
        if (!userChoice) {
            window.showNotification("تم إلغاء العملية", "info");
            return;
        }
        // نرسل طلب force=true مع items فارغة
        const payload = {
            header: {
                invoiceNumber: currentInvoiceNumber,
                from: document.getElementById("من").value,
                to: document.getElementById("buyer-name").value,
                date: document.getElementById("invoice-date").value,
                time: document.getElementById("invoice-time").value,
                user: document.getElementById("invoice-user").value
            },
            items: [], // فارغة
            force: true
        };
        try {
            const response = await fetch("/save_invoice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.status === "success") {
                window.showNotification("✅ تم حذف الفاتورة القديمة بنجاح", "success");
                await this.finalizeSaveSuccess();
            } else {
                window.showNotification("❌ فشل الحذف: " + (result.message || ""), "error");
            }
        } catch (error) {
            window.showNotification("حدث خطأ: " + error.message, "error");
        }
        return;
    }

    // هنا الفاتورة تحتوي على بيانات
    this.updateItemsFromDOM();

    const payload = {
        header: {
            invoiceNumber: currentInvoiceNumber,
            from: document.getElementById("من").value,
            to: document.getElementById("buyer-name").value,
            date: document.getElementById("invoice-date").value,
            time: document.getElementById("invoice-time").value,
            user: document.getElementById("invoice-user").value
        },
        items: this.items,
        force: false
    };

    const sendRequest = async (force = false) => {
        payload.force = force;
        const response = await fetch("/save_invoice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        return await response.json();
    };

    try {
        let result = await sendRequest(false);

        if (result.status === "exists") {
            const userChoice = confirm(`⚠️ توجد فاتورة سابقة بنفس الرقم (${result.invoice_number}).\nهل تريد استبدالها بالفاتورة الجديدة؟`);
            if (userChoice) {
                result = await sendRequest(true);
                if (result.status === "success") {
                    window.showNotification("✅ تم استبدال الفاتورة القديمة بنجاح", "success");
                    await this.finalizeSaveSuccess();
                    return;
                } else {
                    window.showNotification("❌ فشل الاستبدال: " + (result.message || ""), "error");
                    return;
                }
            } else {
                window.showNotification("تم إلغاء العملية", "info");
                return;
            }
        }

        if (result.status === "success") {
            window.showNotification("تم حفظ الفاتورة بنجاح", "success");
            await this.finalizeSaveSuccess();
        } else {
            window.showNotification("فشل حفظ الفاتورة: " + (result.message || ""), "error");
        }
    } catch (error) {
        console.error("خطأ أثناء حفظ الفاتورة:", error);
        window.showNotification("حدث خطأ أثناء حفظ الفاتورة: " + error.message, "error");
    }
}

    saveToLocalStorage() {
        if (this.isLoadingOldInvoice) return;
        const invoiceData = {
            items: this.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                sellPrice: item.sellPrice,
                discountPercent: item.discountPercent,
                cost: item.cost,
                receivedAmount: item.receivedAmount,
                batchNo: item.batchNo,
                company: item.company,
                barcode: item.barcode,
                إيصال_نسبة_الربح_إلى: item["إيصال_نسبة_الربح_إلى"]
            })),
            header: {
                from: document.getElementById("من").value,
                to: document.getElementById("buyer-name").value,
                date: document.getElementById("invoice-date").value,
                time: document.getElementById("invoice-time").value,
                invoiceNumber: document.getElementById("invoice-number").value,
                user: document.getElementById("invoice-user").value,
            },
            timestamp: Date.now()
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(invoiceData));
    }

    loadFromLocalStorage() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (!saved) return false;
        try {
            const data = JSON.parse(saved);
            if (!data.items || !data.items.length) return false;
            this.items = data.items.map(savedItem => {
                const newItem = this.getEmptyItem();
                newItem.name = savedItem.name || "";
                newItem.quantity = savedItem.quantity !== undefined ? savedItem.quantity : "";
                newItem.sellPrice = Number(savedItem.sellPrice) || 0;
                newItem.discountPercent = Number(savedItem.discountPercent) || 0;
                newItem.cost = Number(savedItem.cost) || 0;
                newItem.receivedAmount = savedItem.receivedAmount !== undefined ? savedItem.receivedAmount : "";
                newItem["إيصال_نسبة_الربح_إلى"] = savedItem["إيصال_نسبة_الربح_إلى"] !== undefined ? savedItem["إيصال_نسبة_الربح_إلى"] : "";
                newItem.batchNo = savedItem.batchNo || "";
                newItem.company = savedItem.company || "";
                newItem.barcode = savedItem.barcode || "";
                Object.assign(newItem, calculateItemTotals(newItem, null));
                return newItem;
            });
            if (data.header) {
                document.getElementById("من").value = data.header.from || "";
                document.getElementById("buyer-name").value = data.header.to || "";
                document.getElementById("invoice-date").value = data.header.date || "";
                document.getElementById("invoice-time").value = data.header.time || "";
                document.getElementById("invoice-number").value = data.header.invoiceNumber || "فاتورة جديدة";
                document.getElementById("invoice-user").value = data.header.user || "";
            }
            this.renderTable();
            this.updateTotals();
            this.updateInvoiceNumber();
            this.focusFirstEmptyMaterialRow();
            return true;
        } catch(e) {
            console.error("فشل استعادة الحالة:", e);
            return false;
        }
    }

// =====================================================

    constructor() {
        this.STORAGE_KEY = "temp_invoice_data";
        this.items = [];
        this.currency = "SYP";
        this.stockDecreased = false;
        this.isLoadingOldInvoice = false;
        this.tbody = document.getElementById("items-tbody");

        this.initInvoiceNumberCombo();
        this.bindUI();
        const hasRestoredData = this.loadFromLocalStorage();
        if (!hasRestoredData || this.items.length === 0) this.addEmptyRow();
        window.addEventListener('beforeunload', () => { this.saveToLocalStorage(); });
        
        document.getElementById("items-tbody").addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            const input = e.target;
            if (input.tagName !== "INPUT") return;
            if (input.classList.contains("material-input")) return;
            e.preventDefault();
            const currentRow = input.closest("tr");
            if (!currentRow) return;
            const tbody = currentRow.parentElement;
            const rows = Array.from(tbody.children);
            const isLastRow = currentRow === rows[rows.length - 1];
            if (isLastRow) {
                this.addEmptyRow();
                setTimeout(() => {
                    const newRow = tbody.lastElementChild;
                    const materialInput = newRow?.querySelector(".material-input");
                    if (materialInput) materialInput.focus();
                }, 60);
            }
        });
    }

    setNewInvoiceState({ updateDateTime = true } = {}) {
        localStorage.removeItem(this.STORAGE_KEY);
        const now = new Date();
        document.getElementById("من").value = "صيدلية إحسان العبد الله";
        document.getElementById("buyer-name").value = "فاتورة نقدية";
        if (updateDateTime) {
            document.getElementById("invoice-date").value = this.formatDateToArabic(now);
            document.getElementById("invoice-time").value = this.formatTimeToArabic(now);
        }
        this.isLoadingOldInvoice = false;
        this.updateInvoiceNumber();
        this.focusFirstEmptyMaterialRow();
    }

// =====================================================

    initInvoiceNumberCombo() {
        fetch("/invoices_numbers")
            .then(res => res.json())
            .then(numbers => {
                if (!Array.isArray(numbers)) numbers = [];
                const select = document.getElementById("invoice-number");
                select.innerHTML = "";
                const newOption = document.createElement("option");
                newOption.value = "فاتورة جديدة";
                newOption.textContent = "فاتورة جديدة";
                select.appendChild(newOption);
                numbers.forEach(num => {
                    const opt = document.createElement("option");
                    opt.value = num;
                    opt.textContent = num;
                    select.appendChild(opt);
                });
                select.value = "فاتورة جديدة";
                this.setNewInvoiceState();
            });
        this.bindInvoiceNumberChange();
    }

    bindInvoiceNumberChange() {
        document.getElementById("invoice-number").addEventListener("change", e => {
            if (e.target.value === "فاتورة جديدة") {
                this.items = [];
                this.addEmptyRow();
                this.setNewInvoiceState();
                this.updateTotals();
                return;
            }
            this.loadInvoice(e.target.value);
        });
    }

    loadInvoice(invoiceNumber) {
        localStorage.removeItem(this.STORAGE_KEY);
        this.isLoadingOldInvoice = true;
        fetch(`/invoice?number=${encodeURIComponent(invoiceNumber)}`)
            .then(res => res.json())
            .then(data => {
                if (!data.header) return;
                document.getElementById("invoice-user").value = data.header.user || "";
                document.getElementById("من").value = data.header.from || "";
                document.getElementById("buyer-name").value = data.header.to || "";
                document.getElementById("invoice-date").value = data.header.date || "";
                document.getElementById("invoice-time").value = data.header.time || "";
                document.getElementById("invoice-number").value = data.header.invoiceNumber || "";
                this.items = data.items.map(it => {
                    const item = this.getEmptyItem();
                    item.name = it.name || "";
                    item.quantity = it.quantity || 0;
                    item.sellPrice = it.sellPrice || 0;
                    item.discountPercent = it.discountPercent || 0;
                    item.batchNo = it.batchNo || "";
                    item.receivedAmount = "";
                    const med = window.MEDICINES?.[item.name];
                    if (med) item.cost = med.cost || 0;
                    Object.assign(item, calculateItemTotals(item, "discountPercent"));
                    return item;
                });
                this.renderTable();
                this.updateTotals();
                this.focusFirstEmptyMaterialRow();
            });
    }

    updateInvoiceNumber() {
        const select = document.getElementById("invoice-number");
        if (select.value !== "فاتورة جديدة" && this.isLoadingOldInvoice) return;
        const date = document.getElementById("invoice-date").value;
        const time = document.getElementById("invoice-time").value;
        const buyer = document.getElementById("buyer-name").value.trim() || "فاتورة نقدية";
        const newNumber = `${buyer} ${date} ${time}`;
        const firstOption = select.options[0];
        if (firstOption) {
            firstOption.value = newNumber;
            firstOption.textContent = newNumber;
            select.value = newNumber;
        }
    }

    formatDateToArabic(date) {
        const d = date.getDate().toString().padStart(2, "0");
        const m = (date.getMonth() + 1).toString().padStart(2, "0");
        const y = date.getFullYear();
        return `${d}/${m}/${y}`;
    }

    formatTimeToArabic(date) {
        let h = date.getHours();
        const min = date.getMinutes().toString().padStart(2, "0");
        const sec = date.getSeconds().toString().padStart(2, "0");
        const p = h >= 12 ? "م" : "ص";
        h = h % 12 || 12;
        return `${h.toString().padStart(2, "0")}:${min}:${sec} ${p}`;
    }

    bindUI() {
        const addBtn = document.getElementById("addRowBtn");
        if (addBtn) addBtn.onclick = () => {
            if (!window.focusExistingEmptyRow()) {
                this.addEmptyRow();
                setTimeout(() => {
                    const tbody = document.getElementById("items-tbody");
                    const newRow = tbody.lastElementChild;
                    const materialInput = newRow?.querySelector(".material-input");
                    if (materialInput) materialInput.focus();
                }, 50);
            }
        };
        document.getElementById("print-btn").onclick = () => window.print();
        // document.getElementById("saveInvoiceBtn").onclick = () => this.saveInvoice();

document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        this.saveInvoice();
    }
});

        document.getElementById("refresh-g-k-sadalia-Btn").onclick = () => this.tahdith();

        ["invoice-date", "invoice-time", "buyer-name"].forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener("input", () => this.updateInvoiceNumber());
            el.addEventListener("change", () => this.updateInvoiceNumber());
        });

        const tbody = document.getElementById("items-tbody");
        tbody.addEventListener("keydown", e => {
            const active = document.activeElement;
            const row = active.closest("tr");
            if (!row) return;
            const fields = Array.from(row.querySelectorAll("input, select, textarea"));
            const colIndex = fields.indexOf(active);
            let target = null;
            switch (e.key) {
                case "ArrowRight": if (colIndex > 0) target = fields[colIndex - 1]; break;
                case "ArrowLeft": if (colIndex < fields.length - 1) target = fields[colIndex + 1]; break;
                case "ArrowDown":
                    const nextRow = row.nextElementSibling;
                    if (nextRow) {
                        const nextFields = Array.from(nextRow.querySelectorAll("input, select, textarea"));
                        target = nextFields[colIndex] || nextFields[nextFields.length - 1];
                    }
                    break;
                case "ArrowUp":
                    const prevRow = row.previousElementSibling;
                    if (prevRow) {
                        const prevFields = Array.from(prevRow.querySelectorAll("input, select, textarea"));
                        target = prevFields[colIndex] || prevFields[prevFields.length - 1];
                    }
                    break;
                case "Enter":
                    if (colIndex < fields.length - 1) target = fields[colIndex + 1];
                    else {
                        const nextRowEnter = row.nextElementSibling;
                        if (nextRowEnter) {
                            const nextFields = Array.from(nextRowEnter.querySelectorAll("input, select, textarea"));
                            target = nextFields[0];
                        }
                    }
                    break;
            }
            if (target) {
                e.preventDefault();
                target.focus();
                if (target.select) target.select();
            }
        });

        if (this.tbody) {
            this.tbody.addEventListener("dblclick", (e) => {
                const input = e.target.closest("input.material-input");
                if (!input) return;
                const value = input.value.trim();
                input.select();
                if (window.openMaterialsModal) window.openMaterialsModal(value);
                if (window.openPurchasesModal) window.openPurchasesModal(value);
            });
        }
    }

    getEmptyItem() {
        return {
            name: "", quantity: "", إيصال_نسبة_الربح_إلى: "", sellPrice: 0,
            discountPercent: "", discountValue: 0, totalAfterDiscount: 0, batchNo: "",
            cost: 0, totalCost: 0, totalBeforeDiscount: 0, totalProfit: 0,
            receivedAmount: "", profitPercentReal: 0
        };
    }

    addEmptyRow() {
        this.items.push(this.getEmptyItem());
        this.renderTable();
        this.saveToLocalStorage();
        this.focusLastRow();
    }

// =========================================

focusLastRow() {
    setTimeout(() => {
        const rows = document.querySelectorAll('#items-tbody tr');
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
            const materialInput = lastRow.querySelector('.material-input');
            if (materialInput) {
                materialInput.focus();
                materialInput.select();
            }
        }
    }, 50);
}

// =========================================

focusFirstEmptyMaterialRow() {
    setTimeout(() => {
        const materialInputs = document.querySelectorAll('.material-input');
        for (let input of materialInputs) {
            if (input && !input.readOnly && !input.disabled && input.value.trim() === '') {
                input.focus();
                input.select();
                return;
            }
        }
        if (materialInputs.length) {
            materialInputs[0].focus();
            materialInputs[0].select();
        }
    }, 150);
}

// ================================================
    renderTable() {
        const tbody = document.getElementById("items-tbody");
        tbody.innerHTML = "";
        this.items.forEach((item, index) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td class="material-cell"><div class="ghost-wrapper"><input type="text" class="material-input ghost-input" value="${this.escapeHtml(item.name)}" data-field="name" placeholder="أدخل اسم المادة"><span class="ghost-suggestion" data-ghost=""></span></div></td>
                <td><input type="text" data-field="quantity" inputmode="decimal" value="${item.quantity ?? ""}" placeholder="أدخل الكمية"></td>
                <td><input type="number" data-field="receivedAmount" value="${item.receivedAmount}"></td>
                <td><input type="number" data-field="إيصال_نسبة_الربح_إلى" value="${item["إيصال_نسبة_الربح_إلى"]}"></td>
                <td><input type="number" data-field="discountPercent" value="${item.discountPercent}"></td>
                <td><input readonly data-field="totalBeforeDiscount" value="${item.totalBeforeDiscount}"></td>
                <td><input readonly data-field="batchNo" value="${this.escapeHtml(item.batchNo)}"></td>
                <td><input readonly data-field="discountValue" value="${item.discountValue}"></td>
                <td><input readonly data-field="sellPrice" value="${item.sellPrice}"></td>
                <td><input readonly data-field="totalAfterDiscount" value="${item.totalAfterDiscount}"></td>
                <td><input readonly data-field="profitPercentReal" value="${item.profitPercentReal}"></td>
                <td><input readonly data-field="totalProfit" value="${item.totalProfit}"></td>
                <td><input readonly data-field="cost" value="${item.cost}"></td>
                <td><input readonly data-field="totalCost" value="${item.totalCost}"></td>
                <td><button class="btn delete-row">❌</button></td>
            `;
            tbody.appendChild(row);
            const ghostWrapper = row.querySelector('.ghost-wrapper');
            const materialInput = row.querySelector('.material-input');
            if (ghostWrapper && materialInput && typeof window.attachCameraIcon === 'function') {
                window.attachCameraIcon(materialInput, ghostWrapper);
            }
            row.querySelectorAll("input[data-field]").forEach(input => {
                const materialInput = row.querySelector(".material-input");
                const updateEmptyState = () => {
                    if (!materialInput) return;
                    if (materialInput.value.trim() === "") materialInput.classList.add("material-empty-pulse");
                    else materialInput.classList.remove("material-empty-pulse");
                };
                updateEmptyState();
                materialInput.addEventListener("input", updateEmptyState);
                input.addEventListener("input", () => {
                    const field = input.dataset.field;
                    const item = this.items[index];
                    if (field === "quantity") {
                        item.quantity = input.value;
                        item.receivedAmount = "";
                        if (/[+\-*/()]/.test(input.value)) return;
                    } else {
                        item[field] = input.value;
                    }
                    Object.assign(item, calculateItemTotals(item, field));
                    this.updateRow(row, item, field);
                    this.updateTotals();
                    this.saveToLocalStorage();
                });
            });
            row.querySelector(".delete-row").onclick = () => {
                if (this.items.length === 1) this.items[0] = this.getEmptyItem();
                else this.items.splice(index, 1);
                this.saveToLocalStorage();
                this.renderTable();
            };
        });
        this.updateTotals();
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    updateTotals() {
        let sumAfter = 0, sumBefore = 0, sumProfit = 0, sumCost = 0, sumDiscount = 0, sumQty = 0;
        this.items.forEach(i => {
            sumAfter += Number(i.totalAfterDiscount) || 0;
            sumBefore += Number(i.totalBeforeDiscount) || 0;
            sumProfit += Number(i.totalProfit) || 0;
            sumCost += Number(i.totalCost) || 0;
            sumDiscount += Number(i.discountValue) || 0;
            sumQty += Number(i.quantity) || 0;
        });
        const sumAfterEl = document.getElementById("sum-after");
        sumAfterEl.textContent = sumAfter ? sumAfter.toFixed(2) : "";
        if (sumAfter) sumAfterEl.classList.add("sum-active");
        else sumAfterEl.classList.remove("sum-active");
        document.getElementById("sum-before").textContent = sumBefore.toFixed(2);
        document.getElementById("sum-profit").textContent = sumProfit.toFixed(2);
        document.getElementById("sum-cost").textContent = sumCost.toFixed(2);
        document.getElementById("sum-discount").textContent = sumDiscount.toFixed(2);
        document.getElementById("sum-qty").textContent = sumQty;
    }
}

// ========== إنشاء الكائن العام ==========
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        window.invoice = new PharmacyInvoice();
    });
} else {
    window.invoice = new PharmacyInvoice();
}

// دالة التركيز على سطر فارغ
window.focusExistingEmptyRow = function () {
    const tbody = document.getElementById("items-tbody");
    if (!tbody) return false;
    const rows = tbody.querySelectorAll("tr");
    for (const row of rows) {
        const materialInput = row.querySelector('input.material-input');
        if (materialInput && !materialInput.value.trim()) {
            materialInput.focus();
            materialInput.select();
            return true;
        }
    }
    return false;
};