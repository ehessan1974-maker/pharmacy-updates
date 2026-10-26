// purchases.modal.data.js - إدارة بيانات المشتريات والجدول مع دعم التحميل التدريجي لجميع الفلاتر
(function () {
  "use strict";

  // ========== متغيرات عامة مشتركة مع ملف البحث ==========
  window.purchasesOffset = 0;
  window.purchasesLimit = 200;
  window.hasMoreData = true;
  window.isLoadingMore = false;
  window.purchasesAllData = [];
  window.purchasesSelectedRows = new Set();
  window.currentPurchasesSearchTerm = "";

  // ========== متغيرات خاصة بالفلترة ==========
  let currentPurchasesDateFilter = "today";
  let purchasesSingleDate = "";
  let purchasesStartDate = "";
  let purchasesEndDate = "";

  let globalPurchasesCopiedDate = null;
  let globalPurchasesCopiedTo = null;
  let purchasesContextMenu = null;

  const el = {};
// ========== إدارة الترتيب (Sorting) ==========
window.purchasesSortState = { field: null, direction: "asc" };

function savePurchasesSortState() {
    localStorage.setItem("purchasesSort", JSON.stringify(window.purchasesSortState));
}

function loadPurchasesSortState() {
    const saved = localStorage.getItem("purchasesSort");
    if (saved) {
        try {
            window.purchasesSortState = JSON.parse(saved);
        } catch(e) {}
    }
}

function sortPurchasesData(data, field, direction) {
    if (!field) return data;
    const dir = direction === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
        let valA = a[field] ?? "";
        let valB = b[field] ?? "";
        const isNumeric = !isNaN(parseFloat(valA)) && isFinite(valA) && !isNaN(parseFloat(valB)) && isFinite(valB);
        if (isNumeric) {
            return (parseFloat(valA) - parseFloat(valB)) * dir;
        }
        return String(valA).localeCompare(String(valB)) * dir;
    });
}

function applyPurchasesSortAndRender() {
    if (!window.purchasesAllData) return;
    const sorted = sortPurchasesData(window.purchasesAllData, window.purchasesSortState.field, window.purchasesSortState.direction);
    renderPurchasesRows(sorted, window.currentPurchasesSearchTerm || "", true);
    updatePurchasesSortUI();
}

function updatePurchasesSortUI() {
    document.querySelectorAll("#purchasesTable thead th.sortable").forEach(th => {
        th.classList.remove("asc", "desc");
        if (th.dataset.field === window.purchasesSortState.field) {
            th.classList.add(window.purchasesSortState.direction);
        }
    });
}
  // ========== تهيئة عناصر DOM ==========
  function initDOM() {
    el.modal = document.getElementById("purchasesModal");
    el.tbody = document.querySelector("#purchasesTable tbody");
    el.content = document.getElementById("purchasesModalContent");
    el.bulkDateInput = document.getElementById("purchasesBulkDateInput");
    el.applyBulkDateBtn = document.getElementById("purchasesApplyBulkDateBtn");
    el.selectAllBtn = document.getElementById("purchasesSelectAllRowsBtn");
    el.deselectAllBtn = document.getElementById("purchasesDeselectAllRowsBtn");
    el.bulkToInput = document.getElementById("purchasesBulkToInput");
    el.applyBulkToBtn = document.getElementById("purchasesApplyBulkToBtn");
    el.selectedCountSpan = document.getElementById("purchasesSelectedCountBadge");
  }

  // ========== دوال مساعدة ==========
function formatDateYMD(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

  function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d;
  }

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

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>]/g, function (m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  // ========== دوال عرض الجدول ==========
  function renderPurchasesRows(data, searchTerm = "", replace = true) {
    if (!el.tbody) return;
    if (replace) {
      el.tbody.innerHTML = "";
    }
    if (!data.length) {
      if (replace) {
        el.tbody.innerHTML = '<tr><td colspan="20" style="text-align:center;">📭 لا توجد بيانات<\/td><\/tr>';
      }
      updatePurchasesSelectionUI();
      return;
    }
    const fragment = document.createDocumentFragment();
    data.forEach(row => {
      const tr = document.createElement("tr");
      tr.dataset.invoice = row.invoiceNo || "";
      tr.dataset.order = row.orderNo || "";
      const isSelected = window.purchasesSelectedRows.has(`${row.invoiceNo}_${row.orderNo}`);
      if (isSelected) tr.classList.add("row-selected");
      tr.innerHTML = `
        <td data-field="orderNo">${row.orderNo || ""}<\/td>
        <td data-field="name" class="press-cell">${window.highlightText(escapeHtml(row.name || ""), searchTerm)}<\/td>
        <td data-field="baseOffer">${row.baseOffer || ""}<\/td>
        <td data-field="freeOffer">${row.freeOffer || ""}<\/td>
        <td data-field="discountOffer">${row.discountOffer || ""}<\/td>
        <td data-field="quantity">${row.quantity || ""}<\/td>
        <td data-field="freeQty">${row.freeQty || ""}<\/td>
        <td data-field="buyPrice">${row.buyPrice || ""}<\/td>
        <td data-field="discountPercent">${row.discountPercent || ""}<\/td>
        <td data-field="batchNo">${window.highlightText(escapeHtml(row.batchNo || ""), searchTerm)}<\/td>
        <td data-field="mfgDate">${row.mfgDate || ""}<\/td>
        <td data-field="expDate">${row.expDate || ""}<\/td>
        <td data-field="invoiceNo" class="col-invoiceNo press-cell">${window.highlightText(escapeHtml(row.invoiceNo || ""), searchTerm)}<\/td>
        <td data-field="user">${window.highlightText(escapeHtml(row.user || ""), searchTerm)}<\/td>
        <td data-field="from">${window.highlightText(escapeHtml(row.from || ""), searchTerm)}<\/td>
        <td data-field="to" class="col-to press-cell">${window.highlightText(escapeHtml(row.supplier || ""), searchTerm)}<\/td>
        <td data-field="date" class="col-date press-cell">${row.date || ""}<\/td>
        <td data-field="time">${row.time || ""}<\/td>
        <td data-field="notes">${window.highlightText(escapeHtml(row.notes || ""), searchTerm)}<\/td>
        <td data-field="statement">${window.highlightText(escapeHtml(row.statement || ""), searchTerm)}<\/td>
      `;
      fragment.appendChild(tr);
    });
    if (replace) {
      el.tbody.innerHTML = "";
      el.tbody.appendChild(fragment);
    } else {
      el.tbody.appendChild(fragment);
    }

    if (typeof window.applyColumnsVisibilityToModal === 'function') {
      window.applyColumnsVisibilityToModal('purchasesModal');
    }
    
    // ✅ إعادة تطبيق إخفاء/إظهار الأعمدة بعد كل رسم
    applyPurchasesColumnVisibility();
    updatePurchasesSelectionUI();
    enableExpDateEditing();
  }

  function appendPurchasesRows(data) {
    renderPurchasesRows(data, window.currentPurchasesSearchTerm || "", false);
  }

  // ========== تحميل البيانات الأساسي (يدعم جميع الفلاتر مع offset/limit) ==========
  async function refreshPurchasesCurrentFilter(reset = true) {
    if (!el.tbody) return;

    if (reset) {
      window.purchasesOffset = 0;
      window.hasMoreData = true;
      window.purchasesAllData = [];
      window.purchasesSelectedRows.clear();
      el.tbody.innerHTML = '<tr><td colspan="20">⏳ جاري التحميل...<\/td><\/tr>';
      document.getElementById("purchasesTotalItems").textContent = "0";
      document.getElementById("purchasesTotalQty").textContent = "0";
      document.getElementById("purchasesTotalFree").textContent = "0";
    }

    if (window.isLoadingMore) return;
    window.isLoadingMore = true;

    let url = '';
    const today = new Date();
    const todayStr = formatDateYMD(today);

    if (currentPurchasesDateFilter === 'today') {
      url = `/api/purchases?date=${todayStr}&offset=${window.purchasesOffset}&limit=${window.purchasesLimit}`;
    } else if (currentPurchasesDateFilter === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      url = `/api/purchases?date=${formatDateYMD(yesterday)}&offset=${window.purchasesOffset}&limit=${window.purchasesLimit}`;
    } else if (currentPurchasesDateFilter === 'this_week') {
      const startWeek = getStartOfWeek(today);
      const endWeek = new Date(startWeek);
      endWeek.setDate(startWeek.getDate() + 6);
      url = `/api/purchases?start_date=${formatDateYMD(startWeek)}&end_date=${formatDateYMD(endWeek)}&offset=${window.purchasesOffset}&limit=${window.purchasesLimit}`;
    } else if (currentPurchasesDateFilter === 'this_month') {
      const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      url = `/api/purchases?start_date=${formatDateYMD(startMonth)}&end_date=${formatDateYMD(endMonth)}&offset=${window.purchasesOffset}&limit=${window.purchasesLimit}`;
    } else if (currentPurchasesDateFilter === 'single_date' && purchasesSingleDate) {
      url = `/api/purchases?date=${purchasesSingleDate}&offset=${window.purchasesOffset}&limit=${window.purchasesLimit}`;
    } else if (currentPurchasesDateFilter === 'date_range' && purchasesStartDate && purchasesEndDate) {
      url = `/api/purchases?start_date=${purchasesStartDate}&end_date=${purchasesEndDate}&offset=${window.purchasesOffset}&limit=${window.purchasesLimit}`;
    } else {
      url = `/api/purchases?offset=${window.purchasesOffset}&limit=${window.purchasesLimit}`;
    }

    try {
      const response = await fetch(url);
      const result = await response.json();

      let data = result.data || [];
      const totals = result.totals || { total_items: 0, total_qty: 0, total_free: 0 };
      const hasMore = result.has_more === true;

      if (!Array.isArray(data)) data = [];

      if (window.purchasesOffset === 0) {
        document.getElementById("purchasesTotalItems").textContent = totals.total_items;
        document.getElementById("purchasesTotalQty").textContent = totals.total_qty;
        document.getElementById("purchasesTotalFree").textContent = totals.total_free;
      }

if (window.purchasesOffset === 0) {
    window.purchasesAllData = data;
    // 🔥 تطبيق الترتيب قبل العرض
    const sortedData = sortPurchasesData(data, window.purchasesSortState.field, window.purchasesSortState.direction);
    renderPurchasesRows(sortedData, window.currentPurchasesSearchTerm || "", true);
} else {
    window.purchasesAllData.push(...data);
    // أيضًا الترتيب عند الإلحاق (اختياري، يمكنك تركه بدون ترتيب لتوفير الأداء)
    const sortedAppend = sortPurchasesData(window.purchasesAllData, window.purchasesSortState.field, window.purchasesSortState.direction);
    renderPurchasesRows(sortedAppend, window.currentPurchasesSearchTerm || "", true);
}

      window.hasMoreData = hasMore;

      const loadingRow = document.getElementById("loadingMoreRow");
      if (loadingRow) loadingRow.remove();

    } catch (err) {
      console.error("خطأ في التحميل:", err);
      if (window.purchasesOffset === 0) {
        el.tbody.innerHTML = '<tr><td colspan="20">❌ خطأ في التحميل<\/td><\/tr>';
      }
    } finally {
      window.isLoadingMore = false;
    }
    applyPurchasesColumnVisibility();
  }

  // ========== التحميل عند التمرير ==========
  async function loadMorePurchasesData() {
    if (window.isLoadingMore) return;
    if (!window.hasMoreData) return;
    window.purchasesOffset += window.purchasesLimit;
    await refreshPurchasesCurrentFilter(false);
  }

  function setupInfiniteScroll() {
    if (!el.content) return;
    if (el.content._scrollHandler) {
      el.content.removeEventListener('scroll', el.content._scrollHandler);
    }
    const scrollHandler = async () => {
      const scrollTop = el.content.scrollTop;
      const clientHeight = el.content.clientHeight;
      const scrollHeight = el.content.scrollHeight;
      if (scrollTop + clientHeight >= scrollHeight - 300) {
        await loadMorePurchasesData();
      }
    };
    el.content.addEventListener('scroll', scrollHandler, { passive: true });
    el.content._scrollHandler = scrollHandler;
  }

  // ========== دوال التحديد والعمليات الجماعية ==========
  function getPurchasesRowId(row) {
    return `${row.dataset.invoice}_${row.dataset.order}`;
  }

  function updatePurchasesSelectionUI() {
    if (!el.tbody) return;
    const rows = el.tbody.querySelectorAll("tr");
    rows.forEach(row => {
      const id = getPurchasesRowId(row);
      if (window.purchasesSelectedRows.has(id)) {
        row.classList.add("row-selected");
      } else {
        row.classList.remove("row-selected");
      }
    });
    if (el.selectedCountSpan) {
      el.selectedCountSpan.innerText = `${window.purchasesSelectedRows.size} محدد`;
    }
  }

  function selectAllPurchasesRows() {
    const rows = el.tbody.querySelectorAll("tr");
    if (!rows.length) {
      showToast("لا توجد صفوف", "error");
      return;
    }
    let count = 0;
    rows.forEach(row => {
      const invoiceNo = row.dataset.invoice;
      const orderNo = row.dataset.order;
      if (invoiceNo && orderNo) {
        window.purchasesSelectedRows.add(`${invoiceNo}_${orderNo}`);
        count++;
      }
    });
    updatePurchasesSelectionUI();
    showToast(`✅ تم تحديد ${count} صف`, "success");
  }

  function deselectAllPurchasesRows() {
    const count = window.purchasesSelectedRows.size;
    if (count === 0) {
      showToast("⚠️ لا يوجد صفوف محددة", "info");
      return;
    }
    window.purchasesSelectedRows.clear();
    updatePurchasesSelectionUI();
    showToast(`🗑️ تم إلغاء تحديد ${count} صف`, "success");
  }

  async function applyDateToPurchasesSelectedRows(newDate) {
    if (!newDate) { showToast("الرجاء اختيار تاريخ أولاً.", "error"); return; }
    if (window.purchasesSelectedRows.size === 0) { showToast("لا توجد صفوف محددة.", "error"); return; }

    let successCount = 0, failCount = 0;
    const rows = el.tbody.querySelectorAll("tr");

    for (const row of rows) {
      const id = getPurchasesRowId(row);
      if (window.purchasesSelectedRows.has(id)) {
        const invoiceNo = row.dataset.invoice;
        const orderNo = row.dataset.order;
        if (invoiceNo && orderNo) {
          try {
            const response = await fetch("/api/purchases/update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ invoice_no: invoiceNo, order_no: orderNo, field: "التاريخ", value: newDate })
            });
            const result = await response.json();
            if (result.success) successCount++;
            else failCount++;
          } catch { failCount++; }
        }
      }
    }

    if (successCount > 0) {
      await refreshPurchasesCurrentFilter();
      showToast(`✅ تم تحديث ${successCount} صف بنجاح`, "success");
    }
    if (failCount > 0) showToast(`❌ فشل تحديث ${failCount} صف`, "error");
    window.purchasesSelectedRows.clear();
    updatePurchasesSelectionUI();
  }

  async function applyToToPurchasesSelectedRows(newTo) {
    if (!newTo) { showToast("الرجاء إدخال اسم العميل/الشركة أولاً.", "error"); return; }
    if (window.purchasesSelectedRows.size === 0) { showToast("لا توجد صفوف محددة.", "error"); return; }

    let successCount = 0, failCount = 0;
    const rows = el.tbody.querySelectorAll("tr");

    for (const row of rows) {
      const id = getPurchasesRowId(row);
      if (window.purchasesSelectedRows.has(id)) {
        const invoiceNo = row.dataset.invoice;
        const orderNo = row.dataset.order;
        if (invoiceNo && orderNo) {
          try {
            const response = await fetch("/api/purchases/update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ invoice_no: invoiceNo, order_no: orderNo, field: "إلى", value: newTo })
            });
            const result = await response.json();
            if (result.success) successCount++;
            else failCount++;
          } catch { failCount++; }
        }
      }
    }

    if (successCount > 0) {
      await refreshPurchasesCurrentFilter();
      showToast(`✅ تم تحديث ${successCount} صف بنجاح`, "success");
    }
    if (failCount > 0) showToast(`❌ فشل تحديث ${failCount} صف`, "error");
    window.purchasesSelectedRows.clear();
    updatePurchasesSelectionUI();
  }

  function showToast(msg, type = "info") {
    const toast = document.createElement("div");
    toast.innerText = msg;
    toast.style.cssText = `position:fixed; bottom:20px; right:20px; background:${type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#ffc107"}; color:${type === "warning" ? "#000" : "#fff"}; padding:10px 16px; border-radius:8px; z-index:20000; font-size:14px;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // ========== إدارة تخصيص الأعمدة ==========
  const COLUMNS_STORAGE_KEY = 'hiddenPurchasesColumns';

  function loadHiddenColumns() {
    const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return [];
  }

  function saveHiddenColumns(hiddenColumns) {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(hiddenColumns));
  }

  function applyPurchasesColumnVisibility() {
    const hiddenColumns = loadHiddenColumns();
    console.log("🔄 applyPurchasesColumnVisibility called, hidden columns:", hiddenColumns);
    
    const table = document.getElementById('purchasesTable');
    if (!table) return;
    
    // معالجة thead
    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, idx) => {
        th.style.display = hiddenColumns.includes(idx) ? 'none' : '';
    });
    
    // معالجة tbody
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, idx) => {
            cell.style.display = hiddenColumns.includes(idx) ? 'none' : '';
        });
    });
    
    // معالجة tfoot
    const footRow = table.querySelector('tfoot tr');
    if (footRow) {
        const footCells = footRow.querySelectorAll('td');
        footCells.forEach((cell, idx) => {
            cell.style.display = hiddenColumns.includes(idx) ? 'none' : '';
        });
    }
  }

  function showPurchasesColumnsModal() {
    const existing = document.querySelector('.columns-manager-overlay');
    if (existing) { existing.remove(); return; }

    const theadRow = document.querySelector('#purchasesTable thead tr');
    if (!theadRow) return;
    const columnNames = Array.from(theadRow.children).map(th => th.innerText.trim());

    let hiddenColumns = loadHiddenColumns();

    const overlay = document.createElement('div');
    overlay.className = 'columns-manager-overlay';
    overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:100001; display:flex; align-items:center; justify-content:center;`;

    const modalDiv = document.createElement('div');
    modalDiv.style.cssText = `background:white; border-radius:16px; width:90%; max-width:500px; max-height:85%; display:flex; flex-direction:column; direction:rtl; box-shadow:0 10px 25px rgba(0,0,0,0.2);`;

    modalDiv.innerHTML = `
      <div style="background:#1f4f3a; color:white; padding:15px 20px; border-radius:16px 16px 0 0; display:flex; justify-content:space-between; align-items:center;">
        <span>📋 تخصيص الأعمدة - المشتريات</span>
        <button class="close-col-modal" style="background:none; border:none; color:white; font-size:28px; cursor:pointer;">&times;</button>
      </div>
      <div id="colList" style="flex:1; overflow-y:auto; padding:10px 0;"></div>
      <div style="padding:12px 16px; border-top:1px solid #ddd; display:flex; gap:12px; justify-content:flex-end;">
        <button id="resetColsBtn" style="background:#198754; color:white; border:none; padding:8px 18px; border-radius:8px; cursor:pointer;">إظهار الكل</button>
        <button id="closeColBtn" style="background:#6c757d; color:white; border:none; padding:8px 18px; border-radius:8px; cursor:pointer;">إغلاق</button>
      </div>
    `;

    overlay.appendChild(modalDiv);
    document.body.appendChild(overlay);

    const listDiv = modalDiv.querySelector('#colList');

    const updateVisibility = () => {
      saveHiddenColumns(hiddenColumns);
      applyPurchasesColumnVisibility();
    };

    columnNames.forEach((name, idx) => {
      const isHidden = hiddenColumns.includes(idx);
      const label = document.createElement('label');
      label.style.cssText = `display:flex; align-items:center; gap:12px; padding:10px 20px; cursor:pointer; border-bottom:1px solid #eee;`;
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !isHidden;
      chk.style.cssText = 'width:20px; height:20px; cursor:pointer;';
      const span = document.createElement('span');
      span.textContent = name;
      span.style.cssText = 'flex:1; cursor:pointer;';
      label.appendChild(chk);
      label.appendChild(span);
      chk.addEventListener('change', () => {
        if (chk.checked) {
          hiddenColumns = hiddenColumns.filter(i => i !== idx);
        } else {
          if (!hiddenColumns.includes(idx)) hiddenColumns.push(idx);
        }
        updateVisibility();
      });
      listDiv.appendChild(label);
    });

    const close = () => overlay.remove();
    modalDiv.querySelector('.close-col-modal').onclick = close;
    modalDiv.querySelector('#closeColBtn').onclick = close;
    modalDiv.querySelector('#resetColsBtn').onclick = () => {
      hiddenColumns = [];
      updateVisibility();
      listDiv.querySelectorAll('input').forEach(cb => cb.checked = true);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape' && overlay.parentElement) {
        close();
        document.removeEventListener('keydown', escHandler);
      }
    });
  }

  function bindToggleColumnsButton() {
    const toggleBtn = document.getElementById('togglePurchasesColumnsBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showPurchasesColumnsModal();
      });
    }
  }

  // ========== دالة الفلترة المنبثقة ==========
  function initPurchasesFilterPopup() {
    const filterBtn = document.getElementById('purchasesFilterDropdownBtn');
    const filterPopup = document.getElementById('purchasesFilterPopup');
    const filterTypeSelect = document.getElementById('purchasesFilterTypeSelect');
    const singleDateGroup = document.getElementById('purchasesSingleDateGroup');
    const dateRangeGroup = document.getElementById('purchasesDateRangeGroup');
    const singleDateInput = document.getElementById('purchasesSingleDateInput');
    const startDateInput = document.getElementById('purchasesStartDateInput');
    const endDateInput = document.getElementById('purchasesEndDateInput');
    const applyFilterBtn = document.getElementById('purchasesApplyFilterBtn');
    const cancelFilterBtn = document.getElementById('purchasesCancelFilterBtn');

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
        const escHandler = function (e) {
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
        window.purchasesOffset = 0;
        window.hasMoreData = true;
        window.purchasesAllData = [];
        window.purchasesSelectedRows.clear();

        if (filterType === 'single_date') {
          const sDate = singleDateInput.value;
          if (!sDate) { alert("الرجاء اختيار تاريخ"); return; }
          currentPurchasesDateFilter = filterType;
          purchasesSingleDate = sDate;
          purchasesStartDate = "";
          purchasesEndDate = "";
        } else if (filterType === 'date_range') {
          const stDate = startDateInput.value;
          const enDate = endDateInput.value;
          if (!stDate || !enDate) { alert("الرجاء إدخال تاريخ البداية والنهاية"); return; }
          currentPurchasesDateFilter = filterType;
          purchasesSingleDate = "";
          purchasesStartDate = stDate;
          purchasesEndDate = enDate;
        } else {
          currentPurchasesDateFilter = filterType;
          purchasesSingleDate = "";
          purchasesStartDate = "";
          purchasesEndDate = "";
        }

        if (window.currentPurchasesSearchTerm) {
          window.currentPurchasesSearchTerm = "";
          const searchInput = document.querySelector(".purchases-search-wrapper input");
          if (searchInput) searchInput.value = "";
        }

        await refreshPurchasesCurrentFilter(true);
        filterPopup.style.display = 'none';
      });
    }
    if (cancelFilterBtn) {
      cancelFilterBtn.addEventListener('click', () => {
        filterPopup.style.display = 'none';
      });
    }
  }


// =================================

// ========== تمكين تعديل تاريخ انتهاء الفعالية (double-click) باستخدام المادة بدلاً من الترتيب ==========
function enableExpDateEditing() {
    const tbody = document.querySelector("#purchasesTable tbody");
    if (!tbody) return;

    let activeInput = null;

    tbody.addEventListener("dblclick", async (e) => {
        // استهداف خلايا تاريخ انتهاء الفعالية
        const cell = e.target.closest('td[data-field="expDate"]');
        if (!cell || activeInput) return;

        const row = cell.closest("tr");
        const invoiceNo = row.dataset.invoice;
        
        // ✅ استخراج اسم المادة من العمود الأول (data-field="name")
        const materialCell = row.querySelector('td[data-field="name"]');
        const materialName = materialCell ? materialCell.textContent.trim() : null;
        
        if (!invoiceNo || !materialName) {
            showToast("لا يمكن تحديد الفاتورة أو المادة", "error");
            return;
        }

        const oldValue = cell.textContent.trim();
        let formattedOld = oldValue;
        if (oldValue && oldValue.includes('/')) {
            const parts = oldValue.split('/');
            if (parts.length === 3) {
                formattedOld = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            }
        }

        const input = document.createElement("input");
        input.type = "date";
        input.value = formattedOld;
        input.style.cssText = "width:100%; border:none; outline:none; background:transparent; text-align:center;";
        cell.textContent = "";
        cell.appendChild(input);
        input.focus();
        activeInput = input;

        const save = async () => {
            const newDate = input.value;
            cell.removeChild(input);
            cell.textContent = newDate ? newDate.replace(/-/g, '/') : oldValue;
            activeInput = null;
            if (!newDate || newDate === formattedOld) return;

            try {
                const response = await fetch("/api/purchases/update", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        invoice_no: invoiceNo,
                        material_name: materialName,   // ✅ استخدام اسم المادة بدلاً من order_no
                        field: "تاريخ انتهاء الفعالية",
                        value: newDate.replace(/-/g, '/')
                    })
                });
                const result = await response.json();
                if (result.success) {
                    showToast("✅ تم تحديث تاريخ انتهاء الفعالية", "success");
                    // تحديث الجدول (تأكد من وجود refreshPurchasesCurrentFilter)
                    if (typeof refreshPurchasesCurrentFilter === 'function') {
                        await refreshPurchasesCurrentFilter(true);
                    } else {
                        window.location.reload(); // بديل آمن
                    }
                } else {
                    showToast("❌ فشل الحفظ: " + (result.error || "خطأ غير معروف"), "error");
                    cell.textContent = oldValue;
                }
            } catch (err) {
                console.error(err);
                showToast("❌ خطأ في الاتصال بالسيرفر", "error");
                cell.textContent = oldValue;
            }
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
                cell.removeChild(input);
                cell.textContent = oldValue;
                activeInput = null;
            }
        });
        input.addEventListener("blur", save);
    });
}

// ================================

// فتح نافذة مستقلة لتعديل الفاتورة عند النقر المزدوج على رقم الفاتورة
function bindInvoiceDoubleClick() {
    const tbody = document.querySelector("#purchasesTable tbody");
    if (!tbody) return;
    
    tbody.addEventListener("dblclick", (e) => {
        const invoiceCell = e.target.closest(".col-invoiceNo");
        if (!invoiceCell) return;
        
        const row = invoiceCell.closest("tr");
        const invoiceNo = row?.dataset.invoice;
        if (invoiceNo) {
            // فتح نافذة المشتريات المستقلة مع تمرير رقم الفاتورة
            window.open(`/purchases_standalone_full?invoice=${encodeURIComponent(invoiceNo)}`, '_blank');
        }
    });
}

  // ========== تهيئة النموذج ==========
  function init() {
    initDOM();
    setupInfiniteScroll();
    refreshPurchasesCurrentFilter(true);
    initPurchasesFilterPopup();
    bindToggleColumnsButton();
    applyPurchasesColumnVisibility();
    enableExpDateEditing();
    bindInvoiceDoubleClick();
    // ربط أحداث التحديد الجماعي
    if (el.selectAllBtn) el.selectAllBtn.onclick = selectAllPurchasesRows;
    if (el.deselectAllBtn) el.deselectAllBtn.onclick = deselectAllPurchasesRows;
    if (el.applyBulkDateBtn && el.bulkDateInput) {
      el.applyBulkDateBtn.onclick = () => applyDateToPurchasesSelectedRows(el.bulkDateInput.value);
    }
    if (el.applyBulkToBtn && el.bulkToInput) {
      el.applyBulkToBtn.onclick = () => applyToToPurchasesSelectedRows(el.bulkToInput.value.trim());
    }

    // Ctrl+Click لتحديد صف
    if (el.tbody) {
      el.tbody.addEventListener('click', (e) => {
        if (!e.ctrlKey) return;
        const row = e.target.closest('tr');
        if (!row || !row.dataset.invoice) return;
        const id = getPurchasesRowId(row);
        if (window.purchasesSelectedRows.has(id)) {
          window.purchasesSelectedRows.delete(id);
          row.classList.remove('row-selected');
        } else {
          window.purchasesSelectedRows.add(id);
          row.classList.add('row-selected');
        }
        if (el.selectedCountSpan) el.selectedCountSpan.innerText = `${window.purchasesSelectedRows.size} محدد`;
        e.preventDefault();
      });
    }
    
loadPurchasesSortState();
// ربط أحداث النقر على رؤوس الأعمدة القابلة للترتيب
document.querySelectorAll("#purchasesTable thead th.sortable").forEach(th => {
    th.addEventListener("click", () => {
        const field = th.dataset.field;
        if (!field) return;
        if (window.purchasesSortState.field === field) {
            window.purchasesSortState.direction = window.purchasesSortState.direction === "asc" ? "desc" : "asc";
        } else {
            window.purchasesSortState.field = field;
            window.purchasesSortState.direction = "asc";
        }
        savePurchasesSortState();
        applyPurchasesSortAndRender();
    });
});

    // مراقبة التغييرات في الجدول لإعادة تطبيق إخفاء الأعمدة تلقائياً
    const observer = new MutationObserver(() => {
      applyPurchasesColumnVisibility();
    });
    if (el.tbody) {
      observer.observe(el.tbody, { childList: true, subtree: true });
    }


  }

  // ========== تشغيل التهيئة ==========
  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ========== تصدير الدوال العامة ==========
  window.refreshPurchasesCurrentFilter = refreshPurchasesCurrentFilter;
  window.loadMorePurchasesData = loadMorePurchasesData;
  window.renderPurchasesRows = renderPurchasesRows;
  window.appendPurchasesRows = appendPurchasesRows;
  window.applyPurchasesColumnVisibility = applyPurchasesColumnVisibility;
  window.showPurchasesColumnsModal = showPurchasesColumnsModal;

// ========== تصدير دوال الترتيب إلى النطاق العام ==========
window.sortPurchasesData = sortPurchasesData;
window.applyPurchasesSortAndRender = applyPurchasesSortAndRender;
window.updatePurchasesSortUI = updatePurchasesSortUI;
window.loadPurchasesSortState = loadPurchasesSortState;
window.savePurchasesSortState = savePurchasesSortState;
})();