// ================= تعريف المتغير العام ==============
window.currentSalesSearchTerm = window.currentSalesSearchTerm || '';
// ========== متغيرات التحميل التدريجي ==========
window.salesOffset = 0;
window.salesLimit = 200;
window.hasMoreSalesData = true;
window.isLoadingMoreSales = false;
window.salesAllData = [];
// ===============================================

(function () {
  "use strict";

  let allData = [];
  let selectedRows = new Set();
  
  // ========== متغيرات الفلترة ==========
  let currentDateFilter = "today";
  let singleDate = "";
  let startDate = "";
  let endDate = "";
  
  // ========== متغيرات النسخ واللصق ==========
  let globalCopiedDate = null;
  let globalCopiedTo = null;
  let contextMenu = null;

  const el = {};

// ===================================================

  function initDOM() {
    el.modal = document.getElementById("floatingModal");
    el.tbody = document.querySelector("#floatingTable tbody");
    el.content = document.getElementById("floatingModalContent");
    el.bulkDateInput = document.getElementById("bulkDateInput");
    el.applyBulkBtn = document.getElementById("applyBulkDateBtn");
    el.selectAllBtn = document.getElementById("selectAllRowsBtn");
    el.deselectAllBtn = document.getElementById("deselectAllRowsBtn");
    el.bulkToInput = document.getElementById("bulkToInput");
    el.applyBulkToBtn = document.getElementById("applyBulkToBtn");
    el.selectedCountSpan = document.getElementById("selectedCountBadge");
  }

  // ========== دوال الفلترة ==========
function formatDateYMD(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

  function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d;
  }

// ============================================

async function refreshCurrentFilter(reset = true) {
    if (!el.tbody) return;
    
    if (reset) {
        window.salesOffset = 0;
        window.hasMoreSalesData = true;
        window.salesAllData = [];
        selectedRows.clear();
        if (el.selectedCountSpan) el.selectedCountSpan.innerText = "0 محدد";
        // إظهار رسالة تحميل
        el.tbody.innerHTML = `<tr><td colspan="16">⏳ جاري التحميل...<\/td><\/tr>`;
    }
    
    if (window.isLoadingMoreSales) return;
    window.isLoadingMoreSales = true;
    
    let url = '';
    const today = new Date();
    const todayStr = formatDateYMD(today);
    const cacheBuster = Date.now();
    
    if (currentDateFilter === 'today') {
        url = `/api/sales?date=${todayStr}&offset=${window.salesOffset}&limit=${window.salesLimit}&_=${cacheBuster}`;
    } else if (currentDateFilter === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        url = `/api/sales?date=${formatDateYMD(yesterday)}&offset=${window.salesOffset}&limit=${window.salesLimit}&_=${cacheBuster}`;
    } else if (currentDateFilter === 'this_week') {
        const startWeek = getStartOfWeek(today);
        const endWeek = new Date(startWeek);
        endWeek.setDate(startWeek.getDate() + 6);
        url = `/api/sales?start_date=${formatDateYMD(startWeek)}&end_date=${formatDateYMD(endWeek)}&offset=${window.salesOffset}&limit=${window.salesLimit}&_=${cacheBuster}`;
    } else if (currentDateFilter === 'this_month') {
        const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        url = `/api/sales?start_date=${formatDateYMD(startMonth)}&end_date=${formatDateYMD(endMonth)}&offset=${window.salesOffset}&limit=${window.salesLimit}&_=${cacheBuster}`;
    } else if (currentDateFilter === 'single_date' && singleDate) {
        url = `/api/sales?date=${singleDate}&offset=${window.salesOffset}&limit=${window.salesLimit}&_=${cacheBuster}`;
    } else if (currentDateFilter === 'date_range' && startDate && endDate) {
        url = `/api/sales?start_date=${startDate}&end_date=${endDate}&offset=${window.salesOffset}&limit=${window.salesLimit}&_=${cacheBuster}`;
    } else {
        url = `/api/sales?offset=${window.salesOffset}&limit=${window.salesLimit}&_=${cacheBuster}`;
    }
    
    try {
        const response = await fetch(url);
        const result = await response.json();
        let data = result.data || [];
        const totals = result.totals || {};
        const hasMore = result.has_more === true;
        
        if (!Array.isArray(data)) data = [];
        
        // ✅ عند التحميل الأول: حفظ الإجماليات الكلية وعرضها
        if (reset) {
            window.salesAllData = data;
            window.salesGlobalTotals = totals;   // حفظ الإجماليات الكلية
            renderRows(data, window.currentSalesSearchTerm || "", false);
            updateTotalsFromServer(totals);      // عرض الإجماليات من الخادم
        } else {
            // ❌ عند التحميل الإضافي: لا نغير الإجماليات
            window.salesAllData.push(...data);
            renderRows(data, window.currentSalesSearchTerm || "", true);
            // الإجماليات تبقى كما هي (لا نستدعي updateTotalsFromServer)
        }
        
        window.hasMoreSalesData = hasMore;
        
    } catch (err) {
        console.error("خطأ في التحميل:", err);
        if (reset) {
            el.tbody.innerHTML = '<tr><td colspan="16">❌ خطأ<\/td><\/tr>';
        }
    } finally {
        window.isLoadingMoreSales = false;
    }
}

// ========== دالة مساعدة لعرض الإجماليات في tfoot ===================

function updateTotalsFromServer(totals) {
    const totalsRow = document.getElementById("totalsRow");
    if (!totalsRow) return;
    totalsRow.querySelector('[data-field="total_items"]').textContent = totals.total_items || 0;
    totalsRow.querySelector('[data-field="total_qty"]').textContent = totals.total_qty || 0;
    totalsRow.querySelector('[data-field="total_cost"]').textContent = (totals.total_cost || 0).toFixed(2);
    totalsRow.querySelector('[data-field="total_profit"]').textContent = (totals.total_profit || 0).toFixed(2);
    totalsRow.querySelector('[data-field="total_after"]').textContent = (totals.total_after || 0).toFixed(2);
}

// ==============================================

function updateTotalsFromServer(totals) {
    const totalsRow = document.getElementById("totalsRow");
    if (!totalsRow) return;
    totalsRow.querySelector('[data-field="total_items"]').textContent = totals.total_items || 0;
    totalsRow.querySelector('[data-field="total_qty"]').textContent = totals.total_qty || 0;
    totalsRow.querySelector('[data-field="total_cost"]').textContent = (totals.total_cost || 0).toFixed(2);
    totalsRow.querySelector('[data-field="total_profit"]').textContent = (totals.total_profit || 0).toFixed(2);
    totalsRow.querySelector('[data-field="total_after"]').textContent = (totals.total_after || 0).toFixed(2);
}

// ===============دوال التحميل عند التمرير============================

async function loadMoreSalesData() {
    if (window.isLoadingMoreSales) return;
    if (!window.hasMoreSalesData) return;
    window.salesOffset += window.salesLimit;
    await refreshCurrentFilter(false);
}

function setupSalesInfiniteScroll() {
    if (!el.content) return;
    if (el.content._scrollHandlerSales) {
        el.content.removeEventListener('scroll', el.content._scrollHandlerSales);
    }
    const scrollHandler = async () => {
        const scrollTop = el.content.scrollTop;
        const clientHeight = el.content.clientHeight;
        const scrollHeight = el.content.scrollHeight;
        if (scrollTop + clientHeight >= scrollHeight - 300) {
            await loadMoreSalesData();
        }
    };
    el.content.addEventListener('scroll', scrollHandler, { passive: true });
    el.content._scrollHandlerSales = scrollHandler;
}

// ============================================

  function getRowIdentifiers(row) {
    let invoiceNo = row.dataset.invoice;
    let tarkim = row.dataset.tarkim;
    if (!tarkim) {
      const tarkimCell = row.querySelector('td[data-field="tarkim"]');
      if (tarkimCell) tarkim = tarkimCell.textContent.trim();
    }
    if (!invoiceNo) {
      const invoiceCell = row.querySelector('td.col-invoiceNo');
      if (invoiceCell) invoiceNo = invoiceCell.textContent.trim();
    }
    return { invoiceNo, tarkim };
  }

  function getRowId(row) {
    const { invoiceNo, tarkim } = getRowIdentifiers(row);
    return `${invoiceNo}_${tarkim}`;
  }
// ======================================
function updateSelectionUI() {
    if (!el.tbody) return;
    const rows = el.tbody.querySelectorAll("tr");
    rows.forEach(row => {
        const id = getRowId(row);
        if (selectedRows.has(id)) row.classList.add("row-selected");
        else row.classList.remove("row-selected");
    });
    if (el.selectedCountSpan) {
        el.selectedCountSpan.innerText = `${selectedRows.size} محدد`;
    }
}
// =================================

  async function fetchSalesData() {
    const response = await fetch(`/api/sales?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" }
    });
    return await response.json();
  }

  async function refreshAllDataFromServer() {
    try {
      let data;
      let searchTerm = "";
      if (window.currentSalesSearchTerm && window.currentSalesSearchTerm.trim() !== '') {
        searchTerm = window.currentSalesSearchTerm;
        const res = await fetch(`/api/sales/search?q=${encodeURIComponent(searchTerm.replace(/\*/g, "%"))}&limit=1000&_=${Date.now()}`, { cache: "no-store" });
        data = await res.json();
      } else {
        data = await fetchSalesData();
      }
      allData = data;
      renderRows(data, searchTerm);
      updateTotals();
    } catch (err) {
      console.error("خطأ في تحديث البيانات من السيرفر", err);
    }
  }
// ======================================================
  async function applyDateToSelectedRows(newDate) {
    if (!newDate) { showToast("الرجاء اختيار تاريخ أولاً.", "error"); return; }
    if (selectedRows.size === 0) { showToast("لا توجد صفوف محددة.", "error"); return; }

    let successCount = 0, failCount = 0;
    const rows = el.tbody.querySelectorAll("tr");

    for (const row of rows) {
      const id = getRowId(row);
      if (selectedRows.has(id)) {
        const { invoiceNo, tarkim } = getRowIdentifiers(row);
        if (invoiceNo && tarkim) {
          try {
            const response = await fetch("/api/sales/update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ invoice_no: invoiceNo, tarkim: tarkim, field: "التاريخ", value: newDate })
            });
            const result = await response.json();
            if (result.success) successCount++;
            else failCount++;
          } catch { failCount++; }
        }
      }
    }

    if (successCount > 0) {
      await refreshCurrentFilter();
      showToast(`✅ تم تحديث ${successCount} صف بنجاح`, "success");
    }
    if (failCount > 0) showToast(`❌ فشل تحديث ${failCount} صف`, "error");
    selectedRows.clear();
    updateSelectionUI();
    await refreshCurrentFilter(true);
  }
// =====================================================================
  async function applyFieldToSelectedRows(field, value) {
    if (!value) { showToast(`الرجاء إدخال قيمة لـ ${field} أولاً.`, "error"); return; }
    if (selectedRows.size === 0) { showToast("لا توجد صفوف محددة.", "error"); return; }
    let successCount = 0, failCount = 0;
    const rows = el.tbody.querySelectorAll("tr");
    for (const row of rows) {
      const id = getRowId(row);
      if (selectedRows.has(id)) {
        const { invoiceNo, tarkim } = getRowIdentifiers(row);
        if (invoiceNo && tarkim) {
          try {
            const res = await fetch("/api/sales/update", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ invoice_no: invoiceNo, tarkim, field, value })
            });
            const result = await res.json();
            if (result.success) successCount++;
            else failCount++;
          } catch { failCount++; }
        }
      }
    }
    if (successCount > 0) { await refreshCurrentFilter(); showToast(`✅ تم تحديث ${successCount} صف`, "success"); }
    if (failCount > 0) showToast(`❌ فشل تحديث ${failCount} صف`, "error");
    selectedRows.clear();
    updateSelectionUI();
  }

  function selectAllRows() {
    const rows = el.tbody.querySelectorAll("tr");
    if (!rows.length) { showToast("لا توجد صفوف", "error"); return; }
    let count = 0;
    rows.forEach(row => {
      const { invoiceNo, tarkim } = getRowIdentifiers(row);
      if (invoiceNo && tarkim) {
        selectedRows.add(`${invoiceNo}_${tarkim}`);
        count++;
      }
    });
    updateSelectionUI();
    showToast(`✅ تم تحديد ${count} صف`, "success");
  }

  function deselectAllRows() {
    const count = selectedRows.size;
    if (count === 0) { showToast("⚠️ لا يوجد صفوف محددة", "info"); return; }
    selectedRows.clear();
    updateSelectionUI();
    showToast(`🗑️ تم إلغاء تحديد ${count} صف`, "success");
  }

  function hideContextMenu() { if (contextMenu) contextMenu.remove(); contextMenu = null; }

  function showContextMenu(x, y, type, cellValue) {
    hideContextMenu();
    const menu = document.createElement('div');
    menu.style.cssText = `position:fixed; left:${x}px; top:${y}px; background:white; border:1px solid #ccc; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.15); z-index:20000; min-width:150px;`;
    
    if (type === 'date') {
      menu.innerHTML = `<div class="context-menu-item" style="padding:8px 16px; cursor:pointer;">📋 نسخ التاريخ</div><div class="context-menu-item" style="padding:8px 16px; cursor:pointer;">📌 لصق على المحددين</div>`;
      menu.querySelectorAll('.context-menu-item')[0].onclick = () => { globalCopiedDate = cellValue; showToast(`📋 تم نسخ: ${globalCopiedDate}`, "success"); hideContextMenu(); };
      menu.querySelectorAll('.context-menu-item')[1].onclick = () => {
        if (globalCopiedDate && selectedRows.size) applyDateToSelectedRows(globalCopiedDate);
        else showToast(!globalCopiedDate ? 'لا يوجد تاريخ تم نسخه' : 'لا توجد صفوف محددة', "error");
        hideContextMenu();
      };
    } else if (type === 'to') {
      menu.innerHTML = `<div class="context-menu-item" style="padding:8px 16px; cursor:pointer;">📋 نسخ العميل</div><div class="context-menu-item" style="padding:8px 16px; cursor:pointer;">📌 لصق على المحددين</div>`;
      menu.querySelectorAll('.context-menu-item')[0].onclick = () => { globalCopiedTo = cellValue; showToast(`📋 تم نسخ: ${globalCopiedTo}`, "success"); hideContextMenu(); };
      menu.querySelectorAll('.context-menu-item')[1].onclick = () => {
        if (globalCopiedTo && selectedRows.size) applyFieldToSelectedRows("إلى", globalCopiedTo);
        else showToast(!globalCopiedTo ? 'لا يوجد عميل تم نسخه' : 'لا توجد صفوف محددة', "error");
        hideContextMenu();
      };
    }
    document.body.appendChild(menu);
    contextMenu = menu;
    setTimeout(() => document.addEventListener('click', hideContextMenu), 0);
  }

  function showToast(msg, type = "info") {
    const toast = document.createElement("div");
    toast.innerText = msg;
    toast.style.cssText = `position:fixed; bottom:20px; right:20px; background:${type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#ffc107"}; color:${type === "warning" ? "#000" : "#fff"}; padding:10px 16px; border-radius:8px; z-index:20000; font-size:14px;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  async function loadSalesTable() {
    if (!el.tbody) initDOM();
    if (!el.tbody) return;
    if (loadSalesTable.isLoading) return;
    loadSalesTable.isLoading = true;
    el.tbody.innerHTML = '<tr><td colspan="16">⏳ جاري التحميل...<\/td><\/tr>';

    try {
      let data, searchTerm = "";
      if (window.currentSalesSearchTerm && window.currentSalesSearchTerm.trim() !== '') {
        searchTerm = window.currentSalesSearchTerm;
        const res = await fetch(`/api/sales/search?q=${encodeURIComponent(searchTerm.replace(/\*/g, "%"))}&limit=1000&_=${Date.now()}`, { cache: "no-store" });
        data = await res.json();
      } else {
        data = await fetchSalesData();
      }
      allData = data;
      renderRows(data, searchTerm);
      updateTotals();
    } catch (err) {
      el.tbody.innerHTML = '<tr><td colspan="16">❌ خطأ<\/td><\/tr>';
      console.error(err);
    }
    loadSalesTable.isLoading = false;
  }
// ============================================
function renderRows(data, searchTerm = "", append = false) {
    // 🔥 منع مسح الجدول إذا كانت البيانات فارغة ولا يوجد بحث نشط والجدول يحتوي على بيانات سابقة
    if (data.length === 0 && !searchTerm && window.salesAllData && window.salesAllData.length > 0) {
        console.warn("⚠️ تجاهل استدعاء renderRows بـ 0 عناصر للحفاظ على البيانات الموجودة");
        return;
    }

    if (!el.tbody) return;
    
    if (!append) {
        el.tbody.innerHTML = "";
    }
    
    if (!data.length) {
        if (!append) {
            el.tbody.innerHTML = '<tr><td colspan="16">لا توجد بيانات<\/td><\/tr>';
        }
        updateSelectionUI();
        if (typeof window.applyColumnsVisibilityToModal === 'function') {
            window.applyColumnsVisibilityToModal('floatingModal');
        }
        return;
    }
    
    const fragment = document.createDocumentFragment();
    data.forEach(row => {
        const tr = document.createElement("tr");
        const rowId = `${row.invoiceNo}_${row.tarkim}`;
        if (selectedRows.has(rowId)) tr.classList.add("row-selected");
        tr.dataset.invoice = row.invoiceNo || "";
        tr.dataset.tarkim = row.tarkim || "";
        
        tr.innerHTML = `
            <td data-field="name">${window.highlightText(escapeHtml(row.name || ""), searchTerm)}<\/td>
            <td data-field="quantity">${row.quantity || ""}<\/td>
            <td data-field="sellPrice">${row.sellPrice || ""}<\/td>
            <td data-field="discount">${row.discount || ""}<\/td>
            <td data-field="batchNo">${window.highlightText(escapeHtml(row.batchNo || ""), searchTerm)}<\/td>
            <td class="col-invoiceNo press-cell">${window.highlightText(escapeHtml(row.invoiceNo || ""), searchTerm)}<\/td>
            <td data-field="user">${window.highlightText(escapeHtml(row.user || ""), searchTerm)}<\/td>
            <td data-field="from">${window.highlightText(escapeHtml(row.from || ""), searchTerm)}<\/td>
            <td class="col-to press-cell" data-field="to">${window.highlightText(escapeHtml(row.to || ""), searchTerm)}<\/td>
            <td class="col-date press-cell">${row.date || ""}<\/td>
            <td data-field="time">${row.time || ""}<\/td>
            <td data-field="unit_cost">${row["التكلفة"] || ""}<\/td>
            <td data-field="total_cost">${row["إجمالي التكلفة"] || ""}<\/td>
            <td data-field="total_profit">${row["إجمالي الربح"] || ""}<\/td>
            <td data-field="total_after_discount">${row["الإجمالي بعد الحسم"] || ""}<\/td>
            <td class="tarkim-col" data-field="tarkim">${window.highlightText(escapeHtml(row.tarkim || ""), searchTerm)}<\/td>
        `;
        fragment.appendChild(tr);
    });
    el.tbody.appendChild(fragment);
    
    if (typeof window.applyColumnsVisibilityToModal === 'function') {
        window.applyColumnsVisibilityToModal('floatingModal');
    }

    updateSelectionUI();
    if (typeof enableDateEditing === 'function') enableDateEditing();
    if (typeof enableToEditing === 'function') enableToEditing();
    
    // ✅ لا تقم بأي تحديث للإجماليات هنا مطلقًا
    // الإجماليات يتم تحديثها من قبل الدوال التي تستدعي renderRows (مثل refreshCurrentFilter، performSalesSearch)
    // أو من قبل مستمعات الأحداث الخاصة بتعديل الخلايا.
}
// ================================

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

// ================================

async function handleCellEdit(e) {
    // ... الكود الموجود حتى نجاح الحفظ
    if (result.success) {
        // تحديث الـ rowData في salesAllData
        const index = window.salesAllData.findIndex(item => item.invoiceNo === row.dataset.invoice && item.tarkim === row.dataset.tarkim);
        if (index !== -1) {
            window.salesAllData[index] = rowData;
        }
        recalcTotalsFromLocalData();
        showToast("✅ تم الحفظ", "success");
    }
}

// ================================
  function updateTotals() {
    const totalsRow = document.getElementById("totalsRow");
    if (!totalsRow) return;
    let totalCost = 0, totalProfit = 0, totalAfter = 0, totalQty = 0, rowCount = 0;
    if (el.tbody) {
      el.tbody.querySelectorAll("tr").forEach(tr => {
        rowCount++;
        totalQty += Number(tr.querySelector('td[data-field="quantity"]')?.textContent) || 0;
        totalCost += Number(tr.querySelector('td[data-field="total_cost"]')?.textContent) || 0;
        totalProfit += Number(tr.querySelector('td[data-field="total_profit"]')?.textContent) || 0;
        totalAfter += Number(tr.querySelector('td[data-field="total_after_discount"]')?.textContent) || 0;
      });
    }
    const setCell = (field, val) => {
      const c = totalsRow.querySelector(`td[data-field="${field}"]`);
      if (c) c.textContent = val;
    };
    setCell("total_items", rowCount);
    setCell("total_qty", totalQty);
    setCell("total_cost", totalCost.toFixed(2));
    setCell("total_profit", totalProfit.toFixed(2));
    setCell("total_after", totalAfter.toFixed(2));
  }
// =================================
function enableDateEditing() {
    const body = document.querySelector("#floatingTable tbody");
    if (!body) return;

    body.addEventListener("dblclick", (e) => {
        const cell = e.target.closest(".col-date");
        if (!cell) return;

        if (cell.querySelector("input")) return;

        const row = cell.closest("tr");
        const { invoiceNo, tarkim } = getRowIdentifiers(row);
        if (!invoiceNo || !tarkim) {
            showToast("لا يمكن تحديد الفاتورة", "error");
            return;
        }

        // القيمة المعروضة حالياً (بصيغة / مثل 2025/01/15)
        const oldDisplayValue = cell.textContent.trim();
        
        // تحويل الصيغة إلى YYYY-MM-DD لمنتقي التاريخ
        let isoValue = "";
        if (oldDisplayValue) {
            let parts = oldDisplayValue.split('/');
            if (parts.length === 3) {
                // نفترض أن الصيغة هي YYYY/MM/DD
                let [y, m, d] = parts;
                isoValue = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
            } else {
                // محاولة بديلة إذا كانت DD/MM/YYYY
                parts = oldDisplayValue.split('/');
                if (parts.length === 3) {
                    let [d, m, y] = parts;
                    if (y.length === 4) isoValue = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
                }
            }
        }

        const input = document.createElement("input");
        input.type = "date";
        input.value = isoValue;
        input.style.cssText = "width:100%; border:none; outline:none; background:transparent; text-align:center;";

        cell._oldValue = oldDisplayValue;
        cell.textContent = "";
        cell.appendChild(input);
        input.focus();

        // دالة لتحويل YYYY-MM-DD إلى YYYY/MM/DD
        function toSlashFormat(isoDate) {
            if (!isoDate) return "";
            const parts = isoDate.split('-');
            if (parts.length === 3) {
                return `${parts[0]}/${parts[1]}/${parts[2]}`;
            }
            return isoDate;
        }

        const save = async () => {
            if (!cell.contains(input)) return;

            const newIsoDate = input.value; // YYYY-MM-DD
            cell.removeChild(input);

            if (!newIsoDate) {
                cell.textContent = cell._oldValue;
                showToast("⚠️ لم يتم إدخال تاريخ صالح، تم استعادة القيمة السابقة", "warning");
                return;
            }

            const newDisplayValue = toSlashFormat(newIsoDate);
            if (newDisplayValue === cell._oldValue) {
                cell.textContent = cell._oldValue;
                return;
            }

            try {
                const res = await fetch("/api/sales/update", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        invoice_no: invoiceNo,
                        tarkim: tarkim,
                        field: "التاريخ",
                        value: newDisplayValue   // نرسل بالصيغة المطلوبة (YYYY/MM/DD)
                    })
                });
                const result = await res.json();
                if (result.success) {
                    cell.textContent = newDisplayValue;
                    cell._oldValue = newDisplayValue;
                    showToast("✅ تم تحديث التاريخ", "success");
                    await refreshCurrentFilter(true);
                } else {
                    cell.textContent = cell._oldValue;
                    showToast("❌ فشل حفظ التاريخ، تم استعادة القيمة السابقة", "error");
                }
            } catch (err) {
                cell.textContent = cell._oldValue;
                showToast("❌ خطأ في الاتصال، تم استعادة القيمة السابقة", "error");
            }
        };

        const cancel = () => {
            if (cell.contains(input)) {
                cell.removeChild(input);
                cell.textContent = cell._oldValue;
            }
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                save();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
            }
        });
        input.addEventListener("blur", save);
    });
}
// =================================
  function formatToISO(dateStr) {
    if (!dateStr) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
      let [d, m, y] = parts;
      if (y.length === 2) y = "20" + y;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return "";
  }

  function bindInvoiceDoubleClick() {
    const body = document.querySelector("#floatingTable tbody");
    if (!body) return;
    body.addEventListener("dblclick", (e) => {
      const invoiceCell = e.target.closest("td.col-invoiceNo");
      if (!invoiceCell) return;
      const row = invoiceCell.closest("tr");
      const { invoiceNo } = getRowIdentifiers(row);
      if (invoiceNo && window.invoice?.loadInvoice) window.invoice.loadInvoice(invoiceNo);
    });
  }

  window.performSalesSearch = async function(term) {
    if (!el.tbody) return;
    window.currentSalesSearchTerm = term;
    if (!term) { refreshCurrentFilter(); return; }
    el.tbody.innerHTML = '<tr><td colspan="16">🔎 جاري البحث...<\/td><\/tr>';
    try {
      const res = await fetch(`/api/sales/search?q=${encodeURIComponent(term.replace(/\*/g, "%"))}&limit=1000&_=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      renderRows(data, term);
      updateTotals();
    } catch { el.tbody.innerHTML = '<tr><td colspan="16">❌ خطأ<\/td><\/tr>'; }
  };
// ======================================
async function loadBuyersList() {
    try {
        const res = await fetch("/api/buyers");
        const data = await res.json();
        buyersList = Array.isArray(data) ? data : [];
        if (buyersList.length === 0) buyersList = ["فاتورة نقدية"];
    } catch (err) {
        console.error("فشل تحميل أسماء العملاء", err);
        buyersList = ["فاتورة نقدية"];
    }
}

  let buyersList = [];
// ==================================
function enableToEditing() {
    const body = document.querySelector("#floatingTable tbody");
    if (!body) return;

    // تحميل قائمة العملاء إذا لم تكن محملة
    if (!buyersList || buyersList.length === 0) {
        loadBuyersList().then(() => attachToEditing());
    } else {
        attachToEditing();
    }

    function attachToEditing() {
        body.addEventListener("dblclick", (e) => {
            const cell = e.target.closest(".col-to");
            if (!cell) return;

            if (cell.querySelector("input")) return;

            const row = cell.closest("tr");
            const { invoiceNo, tarkim } = getRowIdentifiers(row);
            if (!invoiceNo || !tarkim) {
                showToast("لا يمكن تحديد الفاتورة", "error");
                return;
            }

            const oldValue = cell.textContent.trim();
            const input = document.createElement("input");
            input.type = "text";
            input.value = oldValue;
            input.style.cssText = "width:100%; border:none; outline:none; background:transparent;";

            // قائمة اقتراحات العملاء
            const datalistId = "toDatalist";
            let datalist = document.getElementById(datalistId);
            if (!datalist) {
                datalist = document.createElement("datalist");
                datalist.id = datalistId;
                document.body.appendChild(datalist);
            }
            datalist.innerHTML = "";
            buyersList.forEach(name => {
                const option = document.createElement("option");
                option.value = name;
                datalist.appendChild(option);
            });
            input.setAttribute("list", datalistId);

            cell._oldValue = oldValue;
            cell.textContent = "";
            cell.appendChild(input);
            input.focus();

            const save = async () => {
                if (!cell.contains(input)) return;

                const newValue = input.value.trim();
                cell.removeChild(input);

                // 🔥 إذا كانت القيمة فارغة -> استعادة القديمة مع تحذير
                if (newValue === "") {
                    cell.textContent = cell._oldValue;
                    showToast("⚠️ لا يمكن ترك حقل العميل فارغاً، تم استعادة القيمة السابقة", "warning");
                    return;
                }

                if (newValue === cell._oldValue) {
                    cell.textContent = cell._oldValue;
                    return;
                }

                try {
                    const res = await fetch("/api/sales/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            invoice_no: invoiceNo,
                            tarkim: tarkim,
                            field: "إلى",
                            value: newValue
                        })
                    });
                    const result = await res.json();
                    if (result.success) {
                        cell.textContent = newValue;
                        cell._oldValue = newValue;
                        showToast("✅ تم تحديث العميل", "success");
                        await refreshCurrentFilter(true);
                    } else {
                        cell.textContent = cell._oldValue;
                        showToast("❌ فشل حفظ العميل، تم استعادة القيمة السابقة", "error");
                    }
                } catch (err) {
                    cell.textContent = cell._oldValue;
                    showToast("❌ خطأ في الاتصال، تم استعادة القيمة السابقة", "error");
                }
            };

            const cancel = () => {
                if (cell.contains(input)) {
                    cell.removeChild(input);
                    cell.textContent = cell._oldValue;
                }
            };

            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    save();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                }
            });

            input.addEventListener("blur", save);
        });
    }
}
// ==================================
  function initFilterPopup() {
    const filterBtn = document.getElementById('filterDropdownBtn');
    const filterPopup = document.getElementById('filterPopup');
    const filterTypeSelect = document.getElementById('filterTypeSelect');
    const singleDateGroup = document.getElementById('singleDateGroup');
    const dateRangeGroup = document.getElementById('dateRangeGroup');
    const singleDateInput = document.getElementById('singleDateInput');
    const startDateInput = document.getElementById('startDateInput');
    const endDateInput = document.getElementById('endDateInput');
    const applyFilterBtn = document.getElementById('applyFilterBtn');
    const cancelFilterBtn = document.getElementById('cancelFilterBtn');
    
    if (!filterBtn || !filterPopup) return;
    
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = filterPopup.style.display === 'block';
      if (!isVisible) {
        if (filterPopup.parentElement !== document.body) document.body.appendChild(filterPopup);
        const rect = filterBtn.getBoundingClientRect();
        filterPopup.style.position = 'fixed';
        filterPopup.style.top = (rect.bottom + 5) + 'px';
        filterPopup.style.left = (rect.left) + 'px';
        filterPopup.style.display = 'block';
        
        const escHandler = function(e) {
          if (e.key === 'Escape' && filterPopup.style.display === 'block') {
            filterPopup.style.display = 'none';
            document.removeEventListener('keydown', escHandler);
          }
        };
        document.addEventListener('keydown', escHandler);
      } else {
        filterPopup.style.display = 'none';
      }
    });
    
    document.addEventListener('click', (e) => {
      if (!filterPopup.contains(e.target) && e.target !== filterBtn) {
        filterPopup.style.display = 'none';
      }
    });
    
    if (filterTypeSelect) {
      filterTypeSelect.addEventListener('change', () => {
        const val = filterTypeSelect.value;
        if (singleDateGroup) singleDateGroup.style.display = (val === 'single_date') ? 'block' : 'none';
        if (dateRangeGroup) dateRangeGroup.style.display = (val === 'date_range') ? 'block' : 'none';
      });
    }
    
    if (applyFilterBtn) {
      applyFilterBtn.addEventListener('click', async () => {
        const filterType = filterTypeSelect.value;
        
        if (filterType === 'single_date') {
          const sDate = singleDateInput.value;
          if (!sDate) { alert("الرجاء اختيار تاريخ"); return; }
          currentDateFilter = filterType;
          singleDate = sDate;
          startDate = "";
          endDate = "";
        } else if (filterType === 'date_range') {
          const stDate = startDateInput.value;
          const enDate = endDateInput.value;
          if (!stDate || !enDate) { alert("الرجاء إدخال تاريخ البداية والنهاية"); return; }
          currentDateFilter = filterType;
          singleDate = "";
          startDate = stDate;
          endDate = enDate;
        } else {
          currentDateFilter = filterType;
          singleDate = "";
          startDate = "";
          endDate = "";
        }
        
       // saveFilterState();
        
        if (window.currentSalesSearchTerm) {
          window.currentSalesSearchTerm = "";
          const searchInput = document.querySelector(".sales-search-wrapper input");
          if (searchInput) searchInput.value = "";
        }
        
        await refreshCurrentFilter();
        filterPopup.style.display = 'none';
      });
    }
    
    if (cancelFilterBtn) {
      cancelFilterBtn.addEventListener('click', () => {
        filterPopup.style.display = 'none';
      });
    }
  }

  function initBulkFeatures() {
    if (!el.tbody) return;

    el.tbody.addEventListener("click", (e) => {
      if (!e.ctrlKey) return;
      const row = e.target.closest("tr");
      if (!row) return;
      const id = getRowId(row);
      if (selectedRows.has(id)) selectedRows.delete(id);
      else selectedRows.add(id);
      updateSelectionUI();
      e.preventDefault();
    });

    if (el.applyBulkBtn && el.bulkDateInput) {
      el.applyBulkBtn.addEventListener("click", () => applyDateToSelectedRows(el.bulkDateInput.value));
    }

    if (el.selectAllBtn) el.selectAllBtn.onclick = selectAllRows;
    if (el.deselectAllBtn) el.deselectAllBtn.onclick = deselectAllRows;
    if (el.applyBulkToBtn && el.bulkToInput) {
      el.applyBulkToBtn.addEventListener("click", () => applyFieldToSelectedRows("إلى", el.bulkToInput.value.trim()));
    }

    const content = document.getElementById("floatingModalContent");
    if (content) {
      content.addEventListener("contextmenu", (e) => {
        const dateCell = e.target.closest("td.col-date");
        const toCell = e.target.closest(".col-to");
        if (dateCell) {
          e.preventDefault();
          showContextMenu(e.pageX, e.pageY, 'date', dateCell.textContent.trim());
        } else if (toCell) {
          e.preventDefault();
          showContextMenu(e.pageX, e.pageY, 'to', toCell.textContent.trim());
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "c") {
        const dateCell = document.activeElement?.closest("td.col-date");
        const toCell = document.activeElement?.closest(".col-to");
        if (dateCell) { globalCopiedDate = dateCell.textContent.trim(); showToast(`📋 تم نسخ: ${globalCopiedDate}`, "success"); e.preventDefault(); }
        else if (toCell) { globalCopiedTo = toCell.textContent.trim(); showToast(`📋 تم نسخ: ${globalCopiedTo}`, "success"); e.preventDefault(); }
      }
      if (e.ctrlKey && e.key === "v") {
        if (selectedRows.size) {
          if (globalCopiedDate) { applyDateToSelectedRows(globalCopiedDate); e.preventDefault(); }
          else if (globalCopiedTo) { applyFieldToSelectedRows("إلى", globalCopiedTo); e.preventDefault(); }
        }
      }
    });

    document.addEventListener("click", function(e) {
      if (e.ctrlKey) return;
      const exceptions = [el.selectAllBtn, el.deselectAllBtn, el.bulkDateInput, el.applyBulkBtn, el.bulkToInput, el.applyBulkToBtn];
      for (let btn of exceptions) { if (btn && btn.contains(e.target)) return; }
      const clickedRow = e.target.closest("tr");
      if (clickedRow && clickedRow.classList.contains("row-selected")) return;
      if (selectedRows.size > 0) { const count = selectedRows.size; selectedRows.clear(); updateSelectionUI(); }
    });
  }


// ========== دالة تصحيح لضمان ظهور القائمة المنبثقة ==========
// ========== دالة تصحيح لضمان ظهور القائمة المنبثقة مع دعم Escape ==========
function fixFilterPopupDisplay() {
  const filterBtn = document.getElementById('filterDropdownBtn');
  const filterPopup = document.getElementById('filterPopup');
  
  if (!filterBtn) {
    console.error("❌ زر الفلترة غير موجود!");
    return;
  }
  if (!filterPopup) {
    console.error("❌ القائمة المنبثقة غير موجودة!");
    return;
  }
  
  // إزالة أي مستمعات قديمة
  const newBtn = filterBtn.cloneNode(true);
  filterBtn.parentNode.replaceChild(newBtn, filterBtn);
  
  newBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();

    
    // تبديل حالة الإظهار
    if (filterPopup.style.display === 'block') {
      filterPopup.style.display = 'none';
    } else {
      // تحديد موقع الزر
      const rect = newBtn.getBoundingClientRect();
      filterPopup.style.position = 'fixed';
      filterPopup.style.top = (rect.bottom + 5) + 'px';
      filterPopup.style.left = (rect.left) + 'px';
      filterPopup.style.display = 'block';
      filterPopup.style.zIndex = '100000';
    }
  });
  
  // إغلاق القائمة عند النقر خارجها
  document.addEventListener('click', function(e) {
    if (filterPopup.style.display === 'block' && 
        !filterPopup.contains(e.target) && 
        e.target !== newBtn) {
      filterPopup.style.display = 'none';
      console.log("📅 تم إغلاق القائمة بالنقر خارجها");
    }
  });
  
  // 🔥 إغلاق القائمة عند الضغط على زر Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (filterPopup.style.display === 'block') {
        filterPopup.style.display = 'none';
      
        // منع انتشار الحدث إذا كان هناك عناصر أخرى تستمع له
        e.stopPropagation();
      }
    }
  });
  
}

// استدعاء دالة التصحيح بعد تحميل الصفحة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(fixFilterPopupDisplay, 200);
  });
} else {
  setTimeout(fixFilterPopupDisplay, 200);
}
// ========== تهيئة فلترة التاريخ بشكل منفصل ==========
function initDateFilter() {
  
  const filterBtn = document.getElementById('filterDropdownBtn');
  const filterPopup = document.getElementById('filterPopup');
  const filterTypeSelect = document.getElementById('filterTypeSelect');
  const singleDateGroup = document.getElementById('singleDateGroup');
  const dateRangeGroup = document.getElementById('dateRangeGroup');
  const singleDateInput = document.getElementById('singleDateInput');
  const startDateInput = document.getElementById('startDateInput');
  const endDateInput = document.getElementById('endDateInput');
  const applyFilterBtn = document.getElementById('applyFilterBtn');
  const cancelFilterBtn = document.getElementById('cancelFilterBtn');
  

  
  // إظهار/إخفاء القائمة
  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log("📅 تم الضغط على زر الفلترة");
    const isVisible = filterPopup.style.display === 'block';
    filterPopup.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      const rect = filterBtn.getBoundingClientRect();
      filterPopup.style.top = (rect.bottom + 5) + 'px';
      filterPopup.style.left = (rect.left) + 'px';
    }
  });
  
  // إخفاء القائمة عند النقر خارجها
  document.addEventListener('click', (e) => {
    if (!filterPopup.contains(e.target) && e.target !== filterBtn) {
      filterPopup.style.display = 'none';
    }
  });
  
  // إظهار/إخفاء حقول التاريخ حسب الاختيار
  if (filterTypeSelect) {
    filterTypeSelect.addEventListener('change', () => {
      const val = filterTypeSelect.value;
      if (singleDateGroup) singleDateGroup.style.display = (val === 'single_date') ? 'block' : 'none';
      if (dateRangeGroup) dateRangeGroup.style.display = (val === 'date_range') ? 'block' : 'none';
    });
  }
  
  // تطبيق الفلترة
  if (applyFilterBtn) {
    applyFilterBtn.addEventListener('click', async () => {
      const filterType = filterTypeSelect.value;
      
      let url = '';
      const today = new Date();
      
      if (filterType === 'today') {
        url = `/api/sales?date=${formatDateYMD(today)}`;
        currentDateFilter = 'today';
      } else if (filterType === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        url = `/api/sales?date=${formatDateYMD(yesterday)}`;
        currentDateFilter = 'yesterday';
      } else if (filterType === 'this_week') {
        const startWeek = getStartOfWeek(today);
        const endWeek = new Date(startWeek);
        endWeek.setDate(startWeek.getDate() + 6);
        url = `/api/sales?start_date=${formatDateYMD(startWeek)}&end_date=${formatDateYMD(endWeek)}`;
        currentDateFilter = 'this_week';
      } else if (filterType === 'this_month') {
        const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        url = `/api/sales?start_date=${formatDateYMD(startMonth)}&end_date=${formatDateYMD(endMonth)}`;
        currentDateFilter = 'this_month';
      } else if (filterType === 'single_date') {
        const sDate = singleDateInput.value;
        if (!sDate) { alert("الرجاء اختيار تاريخ"); return; }
        url = `/api/sales?date=${sDate}`;
        currentDateFilter = 'single_date';
        singleDate = sDate;
      } else if (filterType === 'date_range') {
        const stDate = startDateInput.value;
        const enDate = endDateInput.value;
        if (!stDate || !enDate) { alert("الرجاء إدخال تاريخ البداية والنهاية"); return; }
        url = `/api/sales?start_date=${stDate}&end_date=${enDate}`;
        currentDateFilter = 'date_range';
        startDate = stDate;
        endDate = enDate;
      } else {
        url = '/api/sales';
        currentDateFilter = 'all';
      }
      
      // حفظ الحالة
    //  saveFilterState();
      
      // مسح البحث الحالي
      if (window.currentSalesSearchTerm) {
        window.currentSalesSearchTerm = "";
        const searchInput = document.querySelector(".sales-search-wrapper input");
        if (searchInput) searchInput.value = "";
      }
      
      // تحميل البيانات
      if (!el.tbody) initDOM();
      if (el.tbody) {
        el.tbody.innerHTML = '<tr><td colspan="16">⏳ جاري التحميل...<\/td><\/tr>';
      }
      
      try {
        const response = await fetch(url);
        let data = await response.json();
        if (!Array.isArray(data)) data = [];
        allData = data;
        renderRows(data, "");
        updateTotals();
        showToast("✅ تم تحديث البيانات", "success");
      } catch (err) {
        console.error(err);
        showToast("❌ خطأ في التحميل", "error");
      }
      
      filterPopup.style.display = 'none';
    });
  }
  
  // إلغاء الفلترة
  if (cancelFilterBtn) {
    cancelFilterBtn.addEventListener('click', () => {
      filterPopup.style.display = 'none';
    });
  }
  
  // استعادة آخر حالة فلترة
  // restoreFilterState();
  
  // تنفيذ الفلترة المحفوظة تلقائياً
  setTimeout(() => {
    if (currentDateFilter !== 'all') {
      applyFilterBtn.click();
    }
  }, 500);
}

// تأكد من استدعاء الدالة بعد تحميل الصفحة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initDateFilter, 100);
  });
} else {
  setTimeout(initDateFilter, 100);
}

// =====================================================

window.resetSalesFilter = function() {
    currentDateFilter = "today";
    singleDate = "";
    startDate = "";
    endDate = "";
    // تحديث واجهة الفلترة إذا كانت مفتوحة
    const filterTypeSelect = document.getElementById('filterTypeSelect');
    if (filterTypeSelect) filterTypeSelect.value = "today";
    const singleDateGroup = document.getElementById('singleDateGroup');
    const dateRangeGroup = document.getElementById('dateRangeGroup');
    if (singleDateGroup) singleDateGroup.style.display = "none";
    if (dateRangeGroup) dateRangeGroup.style.display = "none";
    // إعادة تحميل البيانات
    if (typeof refreshCurrentFilter === 'function') refreshCurrentFilter(true);
};

// ============================================

  function init() {
    initDOM();

    setupSalesInfiniteScroll();
    refreshCurrentFilter();
    enableDateEditing();
    bindInvoiceDoubleClick();
    initBulkFeatures();
    loadBuyersList();
    enableToEditing();
    initFilterPopup();
    
    if (!document.getElementById("rowSelectStyle")) {
      const style = document.createElement("style");
      style.id = "rowSelectStyle";
      style.textContent = `#floatingTable tbody tr.row-selected { background-color: #cfe2ff !important; }`;
      document.head.appendChild(style);
    }
    
;
  }

  window.loadSalesTable = refreshCurrentFilter;
  window.refreshCurrentFilter = refreshCurrentFilter;
  window.renderRows = renderRows;
  window.updateTotals = updateTotals;
  window.selectAllRows = selectAllRows;
  window.deselectAllRows = deselectAllRows;
  window.applyDateToSelectedRows = applyDateToSelectedRows;
  window.applyFieldToSelectedRows = applyFieldToSelectedRows;

window.updateTotalsFromServer = function(totals) {
    const totalsRow = document.getElementById("totalsRow");
    if (!totalsRow) return;
    totalsRow.querySelector('[data-field="total_items"]').textContent = totals.total_items || 0;
    totalsRow.querySelector('[data-field="total_qty"]').textContent = totals.total_qty || 0;
    totalsRow.querySelector('[data-field="total_cost"]').textContent = (totals.total_cost || 0).toFixed(2);
    totalsRow.querySelector('[data-field="total_profit"]').textContent = (totals.total_profit || 0).toFixed(2);
    totalsRow.querySelector('[data-field="total_after"]').textContent = (totals.total_after || 0).toFixed(2);
};


    currentDateFilter = "today";
    singleDate = "";
    startDate = "";
    endDate = "";

  if (document.readyState === 'loading') document.addEventListener("DOMContentLoaded", init);
  else init();
})();