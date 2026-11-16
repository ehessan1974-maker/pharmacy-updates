// static/sales_standalone.js (النسخة النهائية المصححة)
(function() {
    "use strict";

    // ---------- العناصر والمتغيرات العامة ----------
    let allData = [];
    let currentData = [];
    let currentSearchTerm = "";
    let selectedRows = new Set();
    let hiddenIndexes = [];

    let currentDateFilter = "today";
    let singleDate = "";
    let startDate = "";
    let endDate = "";

    let offset = 0;
    let limit = 200;
    let hasMore = true;
    let isLoading = false;
    let globalTotals = { total_items: 0, total_qty: 0, total_cost: 0, total_profit: 0, total_after: 0 };

    let copiedDate = null;
    let copiedTo = null;
    let contextMenu = null;

    const tbody = document.getElementById("salesTbody");
    const content = document.getElementById("floatingModalContent");
    const filterPopup = document.getElementById("filterPopup");
    const filterBtn = document.getElementById("filterDropdownBtn");
    const filterTypeSelect = document.getElementById("filterTypeSelect");
    const singleDateGroup = document.getElementById("singleDateGroup");
    const dateRangeGroup = document.getElementById("dateRangeGroup");
    const singleDateInput = document.getElementById("singleDateInput");
    const startDateInput = document.getElementById("startDateInput");
    const endDateInput = document.getElementById("endDateInput");
    const applyFilterBtn = document.getElementById("applyFilterBtn");
    const cancelFilterBtn = document.getElementById("cancelFilterBtn");

    const HIDDEN_COLS_KEY = "hiddenSalesColumnsStandalone";

    // ---------- دوال مساعدة ----------
    function escapeHtml(str) {
        if (!str) return "";
        return String(str).replace(/[&<>]/g, m => m === "&" ? "&amp;" : (m === "<" ? "&lt;" : "&gt;"));
    }

    function formatDateYMD(date) {
        return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    }

    function formatToISO(dateStr) {
        if (!dateStr) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        const parts = dateStr.split(/[\/\-]/);
        if (parts.length === 3) {
            let [d, m, y] = parts;
            if (y.length === 2) y = "20" + y;
            return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
        }
        return "";
    }

    function getStartOfWeek(date) {
        const d = new Date(date);
        d.setDate(d.getDate() - d.getDay());
        return d;
    }

    function showToast(msg, type = "info") {
        const toast = document.createElement("div");
        toast.innerText = msg;
        toast.style.cssText = `position:fixed; bottom:20px; right:20px; background:${type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#ffc107"}; color:${type === "warning" ? "#000" : "#fff"}; padding:10px 16px; border-radius:8px; z-index:20000; font-size:14px;`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    // حساب الإجماليات لكل صف
    function calculateRowTotals(row) {
        const qty = parseFloat(row.quantity) || 0;
        const price = parseFloat(row.sellPrice) || 0;
        const discount = parseFloat(row.discountPercent) || 0;
        const cost = parseFloat(row.cost) || 0;
        const totalBefore = qty * price;
        const discountValue = totalBefore * discount / 100;
        const totalAfter = totalBefore - discountValue;
        const totalCost = qty * cost;
        const profit = totalAfter - totalCost;
        return { totalCost, profit, totalAfter };
    }

    function updateCalculatedCells(rowElement, totals) {
        const totalCostCell = rowElement.querySelector('td[data-field="totalCost"]');
        const totalProfitCell = rowElement.querySelector('td[data-field="totalProfit"]');
        const totalAfterCell = rowElement.querySelector('td[data-field="totalAfterDiscount"]');
        if (totalCostCell) totalCostCell.textContent = totals.totalCost.toFixed(2);
        if (totalProfitCell) totalProfitCell.textContent = totals.profit.toFixed(2);
        if (totalAfterCell) totalAfterCell.textContent = totals.totalAfter.toFixed(2);
    }

function updateTotals() {
    const totalsRow = document.getElementById("totalsRow");
    if (!totalsRow) {
        console.warn("⚠️ totalsRow غير موجود");
        return;
    }
    const itemsCell = totalsRow.querySelector('[data-field="total_items"]');
    const qtyCell = totalsRow.querySelector('[data-field="total_qty"]');
    const costCell = totalsRow.querySelector('[data-field="total_cost"]');
    const profitCell = totalsRow.querySelector('[data-field="total_profit"]');
    const afterCell = totalsRow.querySelector('[data-field="total_after"]');
    
    if (itemsCell) itemsCell.textContent = globalTotals.total_items || 0;
    if (qtyCell) qtyCell.textContent = globalTotals.total_qty || 0;
    if (costCell) costCell.textContent = (globalTotals.total_cost || 0).toFixed(2);
    if (profitCell) profitCell.textContent = (globalTotals.total_profit || 0).toFixed(2);
    if (afterCell) afterCell.textContent = (globalTotals.total_after || 0).toFixed(2);
}

    function updateTotalsFromServer(totals) {
        globalTotals = totals;
        updateTotals();
    }

    // ---------- إدارة الأعمدة المخفية ----------
    function loadHiddenColumns() {
        const saved = localStorage.getItem(HIDDEN_COLS_KEY);
        if (saved) try { hiddenIndexes = JSON.parse(saved); } catch(e) {}
    }
    function saveHiddenColumns() { localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(hiddenIndexes)); }
    function applyHiddenColumns() {
        const table = document.getElementById("floatingTable");
        if (!table) return;
        table.querySelectorAll("tr").forEach(row => {
            Array.from(row.children).forEach((cell, idx) => {
                cell.style.display = hiddenIndexes.includes(idx) ? "none" : "";
            });
        });
    }
    function showColumnsModal() {
        const existing = document.querySelector(".columns-modal-sales");
        if (existing) { existing.remove(); return; }
        const theadRow = document.querySelector("#floatingTable thead tr");
        if (!theadRow) return;
        const columnNames = Array.from(theadRow.children).map(th => th.innerText.trim());
        const overlay = document.createElement("div");
        overlay.className = "columns-modal-sales";
        overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10001; display:flex; align-items:center; justify-content:center;";
        const modalDiv = document.createElement("div");
        modalDiv.style.cssText = "background:white; border-radius:16px; width:90%; max-width:450px; max-height:85%; overflow:auto; direction:rtl;";
        modalDiv.innerHTML = `
            <div style="background:#1f4f3a; color:white; padding:15px; display:flex; justify-content:space-between;">
                <span>📋 تخصيص الأعمدة</span>
                <button id="closeColModal" style="background:none; border:none; color:white; font-size:28px; cursor:pointer;">&times;</button>
            </div>
            <div id="colList" style="padding:10px;"></div>
            <div style="padding:12px; border-top:1px solid #ddd; display:flex; gap:12px; justify-content:flex-end;">
                <button id="resetColsBtn" style="padding:6px 12px; cursor:pointer;">إظهار الكل</button>
                <button id="closeColBtn" style="padding:6px 12px; cursor:pointer;">إغلاق</button>
            </div>
        `;
        overlay.appendChild(modalDiv);
        document.body.appendChild(overlay);
        const listDiv = modalDiv.querySelector("#colList");
        columnNames.forEach((name, idx) => {
            const label = document.createElement("label");
            label.style.cssText = "display:flex; align-items:center; gap:12px; padding:10px; cursor:pointer;";
            const chk = document.createElement("input");
            chk.type = "checkbox";
            chk.checked = !hiddenIndexes.includes(idx);
            chk.style.cssText = "width:18px; height:18px;";
            const span = document.createElement("span");
            span.textContent = name;
            label.appendChild(chk);
            label.appendChild(span);
            chk.addEventListener("change", () => {
                if (chk.checked) hiddenIndexes = hiddenIndexes.filter(i => i !== idx);
                else if (!hiddenIndexes.includes(idx)) hiddenIndexes.push(idx);
                saveHiddenColumns();
                applyHiddenColumns();
            });
            listDiv.appendChild(label);
        });
        const close = () => overlay.remove();
        modalDiv.querySelector("#closeColModal").onclick = close;
        modalDiv.querySelector("#closeColBtn").onclick = close;
        modalDiv.querySelector("#resetColsBtn").onclick = () => {
            hiddenIndexes = [];
            saveHiddenColumns();
            applyHiddenColumns();
            listDiv.querySelectorAll("input").forEach(cb => cb.checked = true);
        };
        overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
        document.addEventListener("keydown", function escHandler(e) {
            if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); }
        });
    }

    // ---------- تحميل البيانات ----------
    async function refreshCurrentFilter(reset = true) {
        if (!tbody) return;
        if (reset) {
            offset = 0;
            hasMore = true;
            allData = [];
            selectedRows.clear();
            updateSelectionUI();
            tbody.innerHTML = '<tr><td colspan="16" class="loading">⏳ جاري التحميل...<\/td><\/tr>';
        }
        if (isLoading) return;
        isLoading = true;

        let url = "";
        const today = new Date();
        const todayStr = formatDateYMD(today);
        const cacheBuster = Date.now();

        if (currentDateFilter === "today") url = `/api/sales?date=${todayStr}&offset=${offset}&limit=${limit}&_=${cacheBuster}`;
        else if (currentDateFilter === "yesterday") {
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            url = `/api/sales?date=${formatDateYMD(yesterday)}&offset=${offset}&limit=${limit}&_=${cacheBuster}`;
        } else if (currentDateFilter === "this_week") {
            const startWeek = getStartOfWeek(today);
            const endWeek = new Date(startWeek);
            endWeek.setDate(startWeek.getDate() + 6);
            url = `/api/sales?start_date=${formatDateYMD(startWeek)}&end_date=${formatDateYMD(endWeek)}&offset=${offset}&limit=${limit}&_=${cacheBuster}`;
        } else if (currentDateFilter === "this_month") {
            const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            url = `/api/sales?start_date=${formatDateYMD(startMonth)}&end_date=${formatDateYMD(endMonth)}&offset=${offset}&limit=${limit}&_=${cacheBuster}`;
        } else if (currentDateFilter === "single_date" && singleDate) {
            url = `/api/sales?date=${singleDate}&offset=${offset}&limit=${limit}&_=${cacheBuster}`;
        } else if (currentDateFilter === "date_range" && startDate && endDate) {
            url = `/api/sales?start_date=${startDate}&end_date=${endDate}&offset=${offset}&limit=${limit}&_=${cacheBuster}`;
        } else {
            url = `/api/sales?offset=${offset}&limit=${limit}&_=${cacheBuster}`;
        }

        try {
            const response = await fetch(url);
            const result = await response.json();
            console.log("📊 الإجماليات من الخادم:", result.totals);
            let data = result.data || [];
            const totals = result.totals || {};
            const more = result.has_more === true;

            if (!Array.isArray(data)) data = [];

            if (reset) {
                allData = data;
                globalTotals = totals;
                // ✅ التصحيح: قراءة الحسم من item.discount
                currentData = data.map(item => ({
                    name: item.name || "",
                    quantity: item.quantity || 0,
                    sellPrice: item.sellPrice || 0,
                    discountPercent: item.discount || 0,   // <-- هنا التصحيح
                    batchNo: item.batchNo || "",
                    invoiceNo: item.invoiceNo || "",
                    user: item.user || "",
                    from: item.from || "",
                    to: item.to || "",
                    date: item.date || "",
                    time: item.time || "",
                    cost: item["التكلفة"] || item.cost || 0,
                    tarkim: item.tarkim || ""
                }));
                renderTable();
                updateTotalsFromServer(totals);
            } else {
                allData.push(...data);
                const newData = data.map(item => ({
                    name: item.name || "",
                    quantity: item.quantity || 0,
                    sellPrice: item.sellPrice || 0,
                    discountPercent: item.discount || 0,   // <-- هنا التصحيح
                    batchNo: item.batchNo || "",
                    invoiceNo: item.invoiceNo || "",
                    user: item.user || "",
                    from: item.from || "",
                    to: item.to || "",
                    date: item.date || "",
                    time: item.time || "",
                    cost: item["التكلفة"] || item.cost || 0,
                    tarkim: item.tarkim || ""
                }));
                currentData.push(...newData);
                renderTable(true);
            }
            hasMore = more;
            if (hasMore) offset += limit;
        } catch (err) {
            console.error(err);
            if (reset) tbody.innerHTML = '<tr><td colspan="16" style="text-align:center; color:red;">❌ خطأ<\/td><\/tr>';
        } finally {
            isLoading = false;
        }
    }

    function renderTable(append = false) {
        if (!tbody) return;
        if (!append) tbody.innerHTML = "";
        if (currentData.length === 0) {
            if (!append) tbody.innerHTML = '<tr><td colspan="16">📭 لا توجد بيانات<\/td><\/tr>';
            applyHiddenColumns();
            return;
        }
        const fragment = document.createDocumentFragment();
        currentData.forEach(row => {
            const tr = document.createElement("tr");
            const rowId = `${row.invoiceNo}_${row.tarkim}`;
            if (selectedRows.has(rowId)) tr.classList.add("row-selected");
            tr.dataset.invoice = row.invoiceNo || "";
            tr.dataset.tarkim = row.tarkim || "";

            const totals = calculateRowTotals(row);
            tr.innerHTML = `
                <td data-col-index="0" contenteditable="false">${window.highlightText(escapeHtml(row.name || ""), currentSearchTerm)}<\/td>
                <td data-col-index="1" contenteditable="true" data-field="quantity">${row.quantity || 0}<\/td>
                <td data-col-index="2" contenteditable="true" data-field="sellPrice">${row.sellPrice || 0}<\/td>
                <td data-col-index="3" contenteditable="true" data-field="discountPercent">${row.discountPercent || 0}<\/td>
                <td data-col-index="4" contenteditable="false">${window.highlightText(escapeHtml(row.batchNo || ""), currentSearchTerm)}<\/td>
                <td data-col-index="5" class="col-invoiceNo press-cell">${window.highlightText(escapeHtml(row.invoiceNo || ""), currentSearchTerm)}<\/td>
                <td data-col-index="6" contenteditable="false">${window.highlightText(escapeHtml(row.user || ""), currentSearchTerm)}<\/td>
                <td data-col-index="7" contenteditable="false">${window.highlightText(escapeHtml(row.from || ""), currentSearchTerm)}<\/td>
                <td data-col-index="8" class="col-to press-cell" contenteditable="true" data-field="to">${window.highlightText(escapeHtml(row.to || ""), currentSearchTerm)}<\/td>
                <td data-col-index="9" class="col-date press-cell" contenteditable="true" data-field="date">${row.date || ""}<\/td>
                <td data-col-index="10" contenteditable="false">${row.time || ""}<\/td>
                <td data-col-index="11" contenteditable="true" data-field="cost">${row.cost || 0}<\/td>
                <td data-col-index="12" data-field="totalCost">${totals.totalCost.toFixed(2)}<\/td>
                <td data-col-index="13" data-field="totalProfit">${totals.profit.toFixed(2)}<\/td>
                <td data-col-index="14" data-field="totalAfterDiscount">${totals.totalAfter.toFixed(2)}<\/td>
                <td data-col-index="15" contenteditable="false">${row.tarkim || ""}<\/td>
            `;
            tr._rowData = row;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);
        applyHiddenColumns();
        attachInlineEditing();
        attachDateEditing();
        attachToEditing();
        if (typeof initColumnResize === "function") {
            initColumnResize("floatingModalContent", "floatingTable", "salesColumnWidths");
        }
    }

    // ---------- التحرير المباشر ----------
    async function saveField(tr, field, newValue) {
        const rowData = tr._rowData;
        const oldValue = rowData[field];
        if (newValue === String(oldValue)) return true;
        rowData[field] = newValue;
        if (field !== "date" && field !== "to") {
            const cell = tr.querySelector(`td[data-field="${field}"]`);
            if (cell) cell.textContent = newValue;
        }
        const totals = calculateRowTotals(rowData);
        updateCalculatedCells(tr, totals);
        updateTotalsFromServer(globalTotals);

        let fieldName = "";
        if (field === "quantity") fieldName = "الكمية";
        else if (field === "sellPrice") fieldName = "سعر المبيع";
        else if (field === "discountPercent") fieldName = "حسم %";
        else if (field === "cost") fieldName = "التكلفة";
        else if (field === "to") fieldName = "إلى";
        else if (field === "date") fieldName = "التاريخ";
        else return true;

        try {
            const res = await fetch("/api/sales/update", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoice_no: tr.dataset.invoice,
                    tarkim: tr.dataset.tarkim,
                    field: fieldName,
                    value: newValue
                })
            });
            const result = await res.json();
            if (result.success) {
                showToast(`✅ تم تحديث ${fieldName}`, "success");
                return true;
            } else throw new Error();
        } catch (err) {
            rowData[field] = oldValue;
            const cell = tr.querySelector(`td[data-field="${field}"]`);
            if (cell) cell.textContent = oldValue;
            const oldTotals = calculateRowTotals(rowData);
            updateCalculatedCells(tr, oldTotals);
            updateTotalsFromServer(globalTotals);
            showToast("❌ فشل الحفظ", "error");
            return false;
        }
    }

    function attachInlineEditing() {
        tbody.querySelectorAll("td[contenteditable='true']").forEach(cell => {
            const field = cell.dataset.field;
            if (!field) return;
            cell.removeEventListener("blur", handleBlur);
            cell.addEventListener("blur", handleBlur);
            function handleBlur() {
                const newVal = cell.textContent.trim();
                const tr = cell.closest("tr");
                if (tr && tr._rowData) saveField(tr, field, newVal);
            }
        });
    }

    let activeDateInput = null;
    function attachDateEditing() {
        tbody.querySelectorAll("td.col-date").forEach(td => {
            td.removeEventListener("dblclick", dateDblClick);
            td.addEventListener("dblclick", dateDblClick);
        });
        async function dateDblClick(e) {
            if (activeDateInput) return;
            const td = e.currentTarget;
            const tr = td.closest("tr");
            if (!tr) return;
            const oldValue = td.textContent.trim();
            const input = document.createElement("input");
            input.type = "date";
            input.value = formatToISO(oldValue);
            input.style.cssText = "width:100%; border:none; outline:none; background:transparent; text-align:center;";
            td.textContent = "";
            td.appendChild(input);
            input.focus();
            activeDateInput = input;

            const save = async () => {
                const newDate = input.value;
                td.removeChild(input);
                td.textContent = newDate || oldValue;
                activeDateInput = null;
                if (!newDate || newDate === formatToISO(oldValue)) return;
                await saveField(tr, "date", newDate);
                await refreshCurrentFilter(true);
            };
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") { td.removeChild(input); td.textContent = oldValue; activeDateInput = null; }
            });
            input.addEventListener("blur", save);
        }
    }

    function attachToEditing() {
        tbody.querySelectorAll("td.col-to").forEach(td => {
            td.removeEventListener("dblclick", toDblClick);
            td.addEventListener("dblclick", toDblClick);
        });
        async function toDblClick(e) {
            const td = e.currentTarget;
            const tr = td.closest("tr");
            if (!tr) return;
            const oldValue = td.textContent.trim();
            const input = document.createElement("input");
            input.type = "text";
            input.value = oldValue;
            input.style.cssText = "width:100%; border:none; outline:none; background:transparent; text-align:center;";
            td.textContent = "";
            td.appendChild(input);
            input.focus();

            const save = async () => {
                const newVal = input.value.trim();
                td.removeChild(input);
                td.textContent = newVal || oldValue;
                if (!newVal || newVal === oldValue) return;
                await saveField(tr, "to", newVal);
                await refreshCurrentFilter(true);
            };
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") { td.removeChild(input); td.textContent = oldValue; }
            });
            input.addEventListener("blur", save);
        }
    }

    // ---------- التحديد والعمليات الجماعية ----------
    function getRowId(row) { return `${row.dataset.invoice}_${row.dataset.tarkim}`; }
    function updateSelectionUI() {
        document.querySelectorAll("#salesTbody tr").forEach(row => {
            const id = getRowId(row);
            if (selectedRows.has(id)) row.classList.add("row-selected");
            else row.classList.remove("row-selected");
        });
        const badge = document.getElementById("selectedCountBadge");
        if (badge) badge.innerText = `${selectedRows.size} محدد`;
    }
    function selectAllRows() {
        document.querySelectorAll("#salesTbody tr").forEach(row => {
            if (row.dataset.invoice && row.dataset.tarkim) selectedRows.add(getRowId(row));
        });
        updateSelectionUI();
    }
    function deselectAllRows() { selectedRows.clear(); updateSelectionUI(); }
    async function applyDateToSelectedRows(newDate) {
        if (!newDate || selectedRows.size === 0) return;
        for (const row of document.querySelectorAll("#salesTbody tr")) {
            const id = getRowId(row);
            if (selectedRows.has(id) && row._rowData) {
                await saveField(row, "date", newDate);
            }
        }
        selectedRows.clear();
        await refreshCurrentFilter(true);
        showToast("✅ تم تحديث التواريخ", "success");
    }
    async function applyToToSelectedRows(newTo) {
        if (!newTo || selectedRows.size === 0) return;
        for (const row of document.querySelectorAll("#salesTbody tr")) {
            const id = getRowId(row);
            if (selectedRows.has(id) && row._rowData) {
                await saveField(row, "to", newTo);
            }
        }
        selectedRows.clear();
        await refreshCurrentFilter(true);
        showToast("✅ تم تحديث أسماء العملاء", "success");
    }

    // ---------- قائمة السياق ----------
    function hideContextMenu() { if (contextMenu) contextMenu.remove(); contextMenu = null; }
    function showContextMenu(x, y, type, cellValue) {
        hideContextMenu();
        const menu = document.createElement("div");
        menu.className = "context-menu";
        menu.style.cssText = `position:fixed; left:${x}px; top:${y}px; background:white; border:1px solid #ccc; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.15); z-index:20000; min-width:150px;`;
        if (type === "date") {
            menu.innerHTML = `<div class="context-menu-item">📋 نسخ التاريخ</div><div class="context-menu-item">📌 لصق على المحددين</div>`;
            menu.children[0].onclick = () => { copiedDate = cellValue; hideContextMenu(); };
            menu.children[1].onclick = () => {
                if (copiedDate && selectedRows.size) applyDateToSelectedRows(copiedDate);
                else showToast(!copiedDate ? "لا يوجد تاريخ منسوخ" : "لا توجد صفوف محددة", "error");
                hideContextMenu();
            };
        } else if (type === "to") {
            menu.innerHTML = `<div class="context-menu-item">📋 نسخ العميل</div><div class="context-menu-item">📌 لصق على المحددين</div>`;
            menu.children[0].onclick = () => { copiedTo = cellValue; hideContextMenu(); };
            menu.children[1].onclick = () => {
                if (copiedTo && selectedRows.size) applyToToSelectedRows(copiedTo);
                else showToast(!copiedTo ? "لا يوجد عميل منسوخ" : "لا توجد صفوف محددة", "error");
                hideContextMenu();
            };
        }
        document.body.appendChild(menu);
        contextMenu = menu;
        setTimeout(() => document.addEventListener("click", hideContextMenu), 0);
    }

    // ---------- Infinite Scroll ----------
    function setupInfiniteScroll() {
        if (!content) return;
        content.addEventListener("scroll", async () => {
            const scrollTop = content.scrollTop;
            const clientHeight = content.clientHeight;
            const scrollHeight = content.scrollHeight;
            if (scrollTop + clientHeight >= scrollHeight - 300 && hasMore && !isLoading && !currentSearchTerm) {
                await refreshCurrentFilter(false);
            }
        });
    }

    // ---------- الفلترة ----------
    function initFilter() {
        if (!filterBtn || !filterPopup) return;
        filterBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const visible = filterPopup.style.display === "block";
            if (!visible) {
                if (filterPopup.parentElement !== document.body) document.body.appendChild(filterPopup);
                const rect = filterBtn.getBoundingClientRect();
                filterPopup.style.position = "fixed";
                filterPopup.style.top = (rect.bottom + 5) + "px";
                filterPopup.style.left = (rect.left) + "px";
                filterPopup.style.display = "block";
                const escHandler = (e) => {
                    if (e.key === "Escape" && filterPopup.style.display === "block") {
                        filterPopup.style.display = "none";
                        document.removeEventListener("keydown", escHandler);
                    }
                };
                document.addEventListener("keydown", escHandler);
            } else {
                filterPopup.style.display = "none";
            }
        });
        document.addEventListener("click", (e) => {
            if (!filterPopup.contains(e.target) && e.target !== filterBtn) filterPopup.style.display = "none";
        });
        if (filterTypeSelect) {
            filterTypeSelect.addEventListener("change", () => {
                const val = filterTypeSelect.value;
                singleDateGroup.style.display = (val === "single_date") ? "block" : "none";
                dateRangeGroup.style.display = (val === "date_range") ? "block" : "none";
            });
        }
        if (applyFilterBtn) {
            applyFilterBtn.addEventListener("click", () => {
                currentDateFilter = filterTypeSelect.value;
                if (currentDateFilter === "single_date") {
                    singleDate = singleDateInput.value;
                    if (!singleDate) { showToast("اختر تاريخاً", "error"); return; }
                } else if (currentDateFilter === "date_range") {
                    startDate = startDateInput.value;
                    endDate = endDateInput.value;
                    if (!startDate || !endDate) { showToast("أدخل تاريخ البداية والنهاية", "error"); return; }
                } else {
                    singleDate = startDate = endDate = "";
                }
                if (currentSearchTerm) {
                    currentSearchTerm = "";
                    const searchInput = document.querySelector(".sales-search-wrapper input");
                    if (searchInput) searchInput.value = "";
                }
                refreshCurrentFilter(true);
                filterPopup.style.display = "none";
            });
        }
        if (cancelFilterBtn) cancelFilterBtn.addEventListener("click", () => { filterPopup.style.display = "none"; });
    }

    // ---------- البحث المتقدم ----------
    function initSearch() {
        const container = document.getElementById("salesSearchContainer");
        if (!container) return;
        if (typeof GoogleSearchComponent === "undefined") { setTimeout(initSearch, 500); return; }
        new GoogleSearchComponent({
            container: container,
            storageKey: "salesSearchHistory_standalone",
            placeholder: "بحث في المبيعات...",
            onSearch: async (term) => {
                currentSearchTerm = term;
                if (!term || term.trim() === "") {
                    refreshCurrentFilter(true);
                    return;
                }
                tbody.innerHTML = '<tr><td colspan="16" class="loading">🔎 جاري البحث...<\/td><\/tr>';
                const res = await fetch(`/api/sales/search?q=${encodeURIComponent(term)}&limit=1000&_=${Date.now()}`);
                const result = await res.json();
                let data = result.data || (Array.isArray(result) ? result : []);
                // ✅ التصحيح هنا أيضاً
                currentData = data.map(item => ({
                    name: item.name || "",
                    quantity: item.quantity || 0,
                    sellPrice: item.sellPrice || 0,
                    discountPercent: item.discount || 0,   // <-- هنا التصحيح
                    batchNo: item.batchNo || "",
                    invoiceNo: item.invoiceNo || "",
                    user: item.user || "",
                    from: item.from || "",
                    to: item.to || "",
                    date: item.date || "",
                    time: item.time || "",
                    cost: item["التكلفة"] || item.cost || 0,
                    tarkim: item.tarkim || ""
                }));
                globalTotals = result.totals || { total_items: 0, total_qty: 0, total_cost: 0, total_profit: 0, total_after: 0 };
                renderTable();
                updateTotalsFromServer(globalTotals);
            }
        });
    }

    // ---------- ربط الأحداث العامة ----------
    function bindEvents() {
        document.getElementById("selectAllRowsBtn")?.addEventListener("click", selectAllRows);
        document.getElementById("deselectAllRowsBtn")?.addEventListener("click", deselectAllRows);
        document.getElementById("applyBulkDateBtn")?.addEventListener("click", () => {
            const date = document.getElementById("bulkDateInput").value;
            if (date) applyDateToSelectedRows(date);
        });
        document.getElementById("applyBulkToBtn")?.addEventListener("click", () => {
            const to = document.getElementById("bulkToInput").value.trim();
            if (to) applyToToSelectedRows(to);
        });
        document.getElementById("fitAllColumnsBtn")?.addEventListener("click", () => {
            if (typeof autoFitAllColumns === "function") {
                autoFitAllColumns("floatingTable", "salesColumnWidths");
                setTimeout(() => applyHiddenColumns(), 10);
            }
        });
        document.getElementById("refitAllColumnsBtn")?.addEventListener("click", () => {
            if (typeof disableAutoFit === "function") {
                disableAutoFit("floatingTable", "floatingModalContent", "salesColumnWidths");
                setTimeout(() => applyHiddenColumns(), 10);
            }
        });
        document.getElementById("toggleColumnsSalesBtn")?.addEventListener("click", showColumnsModal);

        tbody.addEventListener("contextmenu", (e) => {
            const dateCell = e.target.closest(".col-date");
            const toCell = e.target.closest(".col-to");
            if (dateCell) {
                e.preventDefault();
                showContextMenu(e.pageX, e.pageY, "date", dateCell.textContent.trim());
            } else if (toCell) {
                e.preventDefault();
                showContextMenu(e.pageX, e.pageY, "to", toCell.textContent.trim());
            }
        });
        tbody.addEventListener("click", (e) => {
            if (!e.ctrlKey) return;
            const row = e.target.closest("tr");
            if (!row || !row.dataset.invoice) return;
            const id = getRowId(row);
            if (selectedRows.has(id)) selectedRows.delete(id);
            else selectedRows.add(id);
            updateSelectionUI();
        });
        tbody.addEventListener("dblclick", (e) => {
            const invoiceCell = e.target.closest(".col-invoiceNo");
            if (invoiceCell && window.opener?.invoice?.loadInvoice) {
                const row = invoiceCell.closest("tr");
                const invoiceNo = row?.dataset.invoice;
                if (invoiceNo) window.opener.invoice.loadInvoice(invoiceNo);
            }
        });
    }

    let autoRefresh = null;
    function startAutoRefresh() {
        if (autoRefresh) clearInterval(autoRefresh);
        autoRefresh = setInterval(() => refreshCurrentFilter(true), 300000);
    }

    // ---------- التهيئة ----------
    function init() {
        loadHiddenColumns();
        initFilter();
        initSearch();
        bindEvents();
        startAutoRefresh();
        setupInfiniteScroll();
        refreshCurrentFilter(true);
        if (typeof restoreColumnWidths === "function") {
            restoreColumnWidths("floatingTable", "salesColumnWidths");
        }
        const savedTerm = localStorage.getItem("searchTerm_salesStandalone");
        if (savedTerm && savedTerm.trim()) {
            const searchInput = document.querySelector(".sales-search-wrapper input");
            if (searchInput) {
                searchInput.value = savedTerm;
                searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    window.refreshSalesData = refreshCurrentFilter;
})();