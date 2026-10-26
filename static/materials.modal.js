/* ================================ materials.modal.js ================================ */
(function () {
  "use strict";

  /* ================================ STATE ================================ */
  const state = {
    isLoading: false,
    isMaximized: false,
    isMinimized: false,
  };

  let allData = [];
  let materialsData = [];
  let startIndex = 0;
  const rowHeight = 32;
  const visibleCount = 40;
  let materialsLoaded = false;
  let currentSearchTerm = "";
  let selectedRowIndex = -1;
  let sortState = { field: null, direction: "asc" };

  const el = {};
  let searchComponent = null;

  /* ================================ Helper Functions ================================ */
  function centerModal(modal) {
    if (!modal) return;
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
  }

  function ensureModalInsideViewport(modal) {
    if (!modal || modal.style.display !== "flex") return;
    const rect = modal.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    if (rect.right < 50 || rect.left > winW - 50 || rect.bottom < 50 || rect.top > winH - 50) {
      centerModal(modal);
      return;
    }
    let left = parseFloat(modal.style.left) || rect.left;
    let top = parseFloat(modal.style.top) || rect.top;
    let changed = false;
    if (left + rect.width > winW - 10) { left = winW - rect.width - 10; changed = true; }
    if (left < 10) { left = 10; changed = true; }
    if (top + rect.height > winH - 30) { top = winH - rect.height - 30; changed = true; }
    if (top < 30) { top = 30; changed = true; }
    if (changed) {
      modal.style.left = left + "px";
      modal.style.top = top + "px";
      modal.style.transform = "none";
    }
  }

  function showMsg(text, type = "info") {
    const msg = document.createElement("div");
    msg.innerText = text;
    msg.style.cssText = `position:fixed; bottom:20px; left:20px; padding:10px 15px; border-radius:6px; color:#fff; z-index:99999; font-size:14px; background:${type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#333"}`;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2000);
  }

  /* ================================ Sort Functions ================================ */
  function saveSortState() { localStorage.setItem("materialsSort", JSON.stringify(sortState)); }
  function loadSortState() {
    const saved = localStorage.getItem("materialsSort");
    if (saved) try { sortState = JSON.parse(saved); } catch(e) {}
  }
  function updateSortUI() {
    document.querySelectorAll("#materialsTable thead th").forEach(th => th.classList.remove("asc", "desc", "active"));
    if (!sortState.field) return;
    const th = document.querySelector(`th[data-field="${sortState.field}"]`);
    if (th) { th.classList.add(sortState.direction); th.classList.add("active"); }
  }
  function sortMaterials(field) {
    if (!field) return;
    if (sortState.field === field) sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    else { sortState.field = field; sortState.direction = "asc"; }
    const dir = sortState.direction === "asc" ? 1 : -1;
    const toValue = (v) => { if (v == null) return ""; const num = Number(v); return isNaN(num) ? v.toString().toLowerCase() : num; };
    materialsData.sort((a,b) => {
      const valA = toValue(a[field]), valB = toValue(b[field]);
      if (typeof valA === "number" && typeof valB === "number") return (valA - valB) * dir;
      return valA.toString().localeCompare(valB) * dir;
    });
    startIndex = 0;
    renderMaterialsRows();
    updateSortUI();
    saveSortState();
  }

  /* ================================ Render Virtual Table ================================ */
  function highlightSelectedRow() {
    if (!el.virtualTbody) return;
    const rows = el.virtualTbody.querySelectorAll("tr");
    rows.forEach((row, i) => {
      row.classList.remove("selected-row");
      if (i === selectedRowIndex - startIndex) row.classList.add("selected-row");
    });
  }

  function highlightSortedColumn() {
    document.querySelectorAll("#materialsTable td").forEach(td => td.classList.remove("sorted-col"));
    if (!sortState.field) return;
    document.querySelectorAll(`td[data-field="${sortState.field}"]`).forEach(td => td.classList.add("sorted-col"));
  }

/*
  function highlightText(text, term) {
    if (!term) return text;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, "gi");
    return String(text).replace(regex, `<span class="highlight">$1</span>`);
  }
*/

  function renderMaterialsRows() {
    if (!el.virtualTbody) return;
    el.virtualTbody.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const end = Math.min(startIndex + visibleCount, materialsData.length);
    for (let i = startIndex; i < end; i++) {
      const item = materialsData[i];
      const tr = document.createElement("tr");
      tr._rowData = item;
      tr.style.height = rowHeight + "px";
      tr.innerHTML = `
        <td contenteditable="true" data-field="barcode">${window.highlightText(item.barcode || "", currentSearchTerm)}<\/td>
        <td data-field="name">${window.highlightText(item.name || "", currentSearchTerm)}<\/td>
        <td contenteditable="true" data-field="company">${window.highlightText(item.company || "", currentSearchTerm)}<\/td>
        <td contenteditable="true" data-field="base_price">${item.base_price || ""}<\/td>
        <td contenteditable="true" data-field="general_free">${item.general_free || ""}<\/td>
        <td contenteditable="true" data-field="general_20">${item.general_20 || ""}<\/td>
        <td contenteditable="true" data-field="general_approved">${item.general_approved || ""}<\/td>
        <td contenteditable="true" data-field="category">${window.highlightText(item.category || "", currentSearchTerm)}<\/td>
        <td contenteditable="true" data-field="profit_ratio">${item.profit_ratio || ""}<\/td>
        <td contenteditable="true" data-field="latin_name">${item.latin_name || ""}<\/td>
        <td contenteditable="true" data-field="net_free">${item.net_free || ""}<\/td>
        <td contenteditable="true" data-field="package">${item.package || ""}<\/td>
        <td contenteditable="true" data-field="strength">${item.strength || ""}<\/td>
        <td contenteditable="true" data-field="form">${item.form || ""}<\/td>
        <td contenteditable="true" data-field="composition">${item.composition || ""}<\/td>
        <td contenteditable="true" data-field="unit">${item.unit || ""}<\/td>
        <td contenteditable="true" data-field="trade_name">${item.trade_name || ""}<\/td>
        <td contenteditable="true" data-field="code">${item.code || ""}<\/td>
        <td contenteditable="true" data-field="updated">${item.updated || ""}<\/td>
        <td contenteditable="true" data-field="base_price_usd">${item.base_price_usd || ""}<\/td>
        <td contenteditable="true" data-field="general_approved_usd">${item.general_approved_usd || ""}<\/td>
        <td contenteditable="true" data-field="general_20_usd">${item.general_20_usd || ""}<\/td>
      `;
      fragment.appendChild(tr);
    }
    el.virtualTbody.appendChild(fragment);
    el.virtualTbody.style.transform = `translateY(${startIndex * rowHeight}px)`;

  if (window.applyColumnsVisibilityToModal) {
  window.applyColumnsVisibilityToModal('materialsModal');
  }

    highlightSelectedRow();
    highlightSortedColumn();
  }

  function scrollToSelected() {
    const visibleStart = startIndex;
    const visibleEnd = startIndex + visibleCount;
    if (selectedRowIndex < visibleStart) el.container.scrollTop = selectedRowIndex * rowHeight;
    if (selectedRowIndex >= visibleEnd) el.container.scrollTop = (selectedRowIndex - visibleCount + 1) * rowHeight;
  }

  function setupVirtualScroll() {
    if (!el.container) return;
    el.container.addEventListener("scroll", () => {
      startIndex = Math.floor(el.container.scrollTop / rowHeight);
      renderMaterialsRows();
    });
  }

  /* ================================ Inline Editing ================================ */
  function saveField(row, field, tr) {
    const allowedFields = ["general_approved", "barcode", "company", "base_price"];
    if (!allowedFields.includes(field)) return;
    const oldValue = tr._oldValues ? tr._oldValues[field] : null;
    const newValue = String(row[field] || "").trim();
    if (oldValue !== null && String(oldValue).trim() === newValue) { showMsg("ℹ️ لم يتم تغيير أي شيء", "info"); return; }
    showMsg("⏳ جاري الحفظ...", "info");
    const fieldMap = { "general_approved": "عموم معتمد", "barcode": "رمز الباركود", "company": "الشركة", "base_price": "السعر الأساسي" };
    fetch("/api/materials/update-approved", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_name: row.name, field: fieldMap[field], value: row[field] })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") { showMsg(`✅ تم حفظ ${fieldMap[field]}`, "success"); if (!tr._oldValues) tr._oldValues = {}; tr._oldValues[field] = row[field]; }
      else showMsg("❌ " + (data.msg || "لم يتم الحفظ"), "error");
    })
    .catch(() => showMsg("❌ خطأ في الاتصال بالسيرفر", "error"));
  }

  function enableInlineEditing() {
    if (!el.virtualTbody) return;
    el.virtualTbody.addEventListener("input", (e) => {
      const cell = e.target.closest("[contenteditable]");
      if (!cell) return;
      const tr = cell.closest("tr");
      const row = tr._rowData;
      if (!row) return;
      const field = cell.dataset.field;
      row[field] = cell.innerText.trim();
    });
    el.virtualTbody.addEventListener("focus", (e) => {
      const cell = e.target.closest("[contenteditable]");
      if (!cell) return;
      const tr = cell.closest("tr");
      const row = tr._rowData;
      if (!row) return;
      const field = cell.dataset.field;
      if (!tr._oldValues) tr._oldValues = {};
      tr._oldValues[field] = row[field];
    }, true);
    el.virtualTbody.addEventListener("blur", (e) => {
      const cell = e.target.closest("[contenteditable]");
      if (!cell) return;
      const tr = cell.closest("tr");
      const row = tr._rowData;
      if (!row) return;
      const field = cell.dataset.field;
      if (!["barcode","company","base_price","general_approved"].includes(field)) return;
      setTimeout(() => saveField(row, field, tr), 50);
    }, true);
  }

  /* ================================ Search Function ================================ */
function performSearch(term) {
  selectedRowIndex = 0;
  currentSearchTerm = term;

  if (!term) {
    // إذا كان allData لا يزال غير محمل، نعرض رسالة انتظار ونحاول تحميله
    if (!materialsLoaded) {
      el.virtualTbody.innerHTML = `<tr><td colspan="22">⏳ جاري تحميل البيانات...</td></tr>`;
      fetch("/api/materials")
        .then(res => res.json())
        .then(data => {
          allData = data;
          materialsLoaded = true;
          if (el.spacer) el.spacer.style.height = (allData.length * rowHeight) + "px";
          materialsData = allData;
          renderMaterialsRows();
        })
        .catch(() => {
          el.virtualTbody.innerHTML = `<tr><td colspan="22">❌ خطأ في التحميل</td></tr>`;
        });
      return;
    }
    materialsData = allData;
    startIndex = 0;
    if (el.spacer) el.spacer.style.height = (materialsData.length * rowHeight) + "px";
    renderMaterialsRows();
    return;
  }

  // البحث العادي (term غير فارغ)
  state.isSearching = true;
  if (el.virtualTbody) el.virtualTbody.innerHTML = `<tr><td colspan="22">⏳ جاري البحث...</td></tr>`;
  const query = term.replace(/\*/g, "%");
  fetch(`/api/materials/search?q=${encodeURIComponent(query)}&limit=1000`)
    .then(res => res.json())
    .then(data => {
      materialsData = data;
      startIndex = 0;
      if (el.spacer) el.spacer.style.height = (data.length * rowHeight) + "px";
      renderMaterialsRows();
      state.isSearching = false;
    })
    .catch(() => {
      if (el.virtualTbody) el.virtualTbody.innerHTML = `<tr><td colspan="22">❌ خطأ في البحث</td></tr>`;
      state.isSearching = false;
    });
}

  /* ================================ Open / Close ================================ */
function openModal(initialSearch = "") {
  if (!el.modal) return;
  if (typeof window.restoreMaterialsModalState === "function") {
    window.restoreMaterialsModalState();
  } else {
    centerModal(el.modal);
  }
  el.modal.style.display = "flex";
  ensureModalInsideViewport(el.modal);
  setActiveModal(el.modal, "materialsModal");
  if (!el.modal._dragEnabled) {
    enableModalDrag(el.modal, el.header, "materialsModal");
    enableModalResize(el.modal, "materialsModal");
    enableModalFocus(el.modal, "materialsModal");
    el.modal._dragEnabled = true;
  }
  localStorage.setItem("materialsModalOpen", "true");
  if (typeof restoreColumnWidths === 'function') {
    restoreColumnWidths("materialsTable", "materialsColumnWidths");
  }

  // تحديد مصطلح البحث
let searchTerm = "";
if (initialSearch && typeof initialSearch === "string") {
    searchTerm = initialSearch.trim();
} else if (window.getSearchTerm) {
    const temp = window.getSearchTerm("materialsModal");
    searchTerm = (typeof temp === "string") ? temp.trim() : "";
} else {
    const temp = localStorage.getItem("searchTerm_materialsModal");
    searchTerm = (typeof temp === "string") ? temp : "";
}

  // تحميل allData أولاً إذا لم يكن محملاً (مرة واحدة فقط)
  if (!materialsLoaded) {
    state.isLoading = true;
    fetch("/api/materials")
      .then(res => res.json())
      .then(data => {
        allData = data;
        materialsLoaded = true;
        if (!el.spacer) {
          el.spacer = document.createElement("div");
          el.content.appendChild(el.spacer);
        }
        el.spacer.style.height = (allData.length * rowHeight) + "px";
        state.isLoading = false;

        // بعد تحميل allData، قرر ماذا تعرض
        if (searchTerm && searchTerm !== "") {
          performSearch(searchTerm);
        } else {
          materialsData = allData;
          renderMaterialsRows();
        }
      })
      .catch(err => {
        console.error(err);
        el.virtualTbody.innerHTML = `<tr><td colspan="22">❌ خطأ في التحميل</td></tr>`;
        state.isLoading = false;
      });
  } else {
    // allData موجود مسبقاً
    if (searchTerm && searchTerm !== "") {
      performSearch(searchTerm);
    } else {
      materialsData = allData;
      renderMaterialsRows();
    }
  }

  // مزامنة قيمة حقل البحث وتركيزه (إذا كان searchComponent موجوداً)
  if (searchComponent) {
    setTimeout(() => {searchComponent.setValue(typeof searchTerm === "string" ? searchTerm : "");
      if (!searchTerm) searchComponent.focus();
    }, 150);
  }

  // إذا كان هناك initialSearch مختلف، نعطيه الأولوية القصوى
  if (initialSearch && searchComponent && searchTerm !== initialSearch) {
    setTimeout(() => {
searchComponent.setValue(typeof searchTerm === "string" ? searchTerm : "");
      searchComponent.focus();
      performSearch(initialSearch.toLowerCase().trim());
    }, 150);
  }

window.forceModalFit("floatingModal");  // أو materialsModal

}
  function closeModal() {
    if (!el.modal) return;
    if (typeof window.saveMaterialsModalState === "function") window.saveMaterialsModalState();
    if (typeof saveColumnWidths === 'function') {
      saveColumnWidths("materialsTable", "materialsColumnWidths");
    }
    el.modal.style.display = "none";
    // 🔥 حفظ حالة الإغلاق
    localStorage.setItem("materialsModalOpen", "false");

    if (window.__ACTIVE_MODAL__ === "materialsModal") {
      const otherModals = [...document.querySelectorAll("[id$='Modal']")].filter(m => m.style.display === "flex" && m !== el.modal);
      if (otherModals.length) setActiveModal(otherModals[otherModals.length-1], otherModals[otherModals.length-1].id);
      else { window.__ACTIVE_MODAL__ = null; document.body.removeAttribute("data-active-modal"); }
    }
  }

  /* ================================ Initialize Search Component ================================ */
function initSearch() {
  // البحث عن الحاوية الموجودة أو إنشاؤها
  let searchContainer = document.querySelector('#materialsModal .google-search-wrapper');
  if (!searchContainer) {
    const header = document.querySelector('#materialsHeader');
    const controls = header.querySelector('.window-controls:last-child');
    searchContainer = document.createElement('div');
    searchContainer.style.flex = '1';
    searchContainer.style.margin = '0 15px';
    searchContainer.style.maxWidth = '420px';
    searchContainer.classList.add('google-search-wrapper');
    header.insertBefore(searchContainer, controls);
  } else {
    // تنظيف أي محتوى قديم داخل الحاوية (مثل الأزرار اليدوية)
    searchContainer.innerHTML = '';
  }

  // إنشاء المكون
  searchComponent = new GoogleSearchComponent({
    container: searchContainer,
    storageKey: 'materialsSearchHistory',
    placeholder: 'بحث في بطاقات المواد...',
    onSearch: (term) => { performSearch(term); }
  });

  // ربط خاصية حفظ النص (اختياري)
  if (window.bindSearchPersistence && searchComponent) {
    window.bindSearchPersistence(searchComponent, "materialsModal", (term) => performSearch(term));
  }
}

  /* ================================ DOM Elements ================================ */
  function initDOM() {
    el.modal = document.getElementById("materialsModal");
    el.header = document.getElementById("materialsHeader");
    el.openBtn = document.getElementById("openMaterialsBtn");
    el.closeBtn = document.getElementById("closeMaterialsBtn");
    el.minimizeBtn = document.getElementById("minimizeMaterialsBtn");
    el.maximizeBtn = document.getElementById("maximizeMaterialsBtn");
    el.content = document.getElementById("materialsContent");
    el.virtualTbody = document.getElementById("materialsVirtualTbody");
    if (el.content && !el.spacer) {
      el.spacer = document.createElement("div");
      el.content.appendChild(el.spacer);
    }
    el.container = el.content;
  }

  /* ================================ Main INIT ================================ */
  function init() {
    initDOM();
    if (!el.modal) { console.error("❌ materialsModal غير موجود"); return; }
    el.openBtn?.addEventListener("click", () => openModal());
    el.closeBtn?.addEventListener("click", closeModal);
    if (el.minimizeBtn) {
      el.minimizeBtn.addEventListener("click", () => {
        if (window.minimizeModal) window.minimizeModal("materialsModal");
        else console.warn("minimizeModal not defined");
      });

    window.initColumnResize('materialsModal', 'materialsTable', 'materialsColumnWidths');
    }
    if (el.maximizeBtn) {
      el.maximizeBtn.addEventListener("click", () => {
        if (window.maximizeModal) window.maximizeModal("materialsModal");
        else console.warn("maximizeModal not defined");
      });
    }

    // ربط أزرار Auto Fit
    const fitMaterialsBtn = document.getElementById("fitAllColumnsMaterialsBtn");
    if (fitMaterialsBtn) {
      fitMaterialsBtn.addEventListener("click", () => {
        if (typeof autoFitAllColumns === 'function') {
          autoFitAllColumns("materialsTable", "materialsColumnWidths");
        } else {
          console.warn("autoFitAllColumns not loaded");
        }
      });
    }
    const refitMaterialsBtn = document.getElementById("refitAllColumnsMaterialsBtn");
    if (refitMaterialsBtn) {
      refitMaterialsBtn.addEventListener("click", () => {
        if (typeof disableAutoFit === 'function') {
          disableAutoFit("materialsTable", "materialsContent", "materialsColumnWidths");
        } else {
          console.warn("disableAutoFit not loaded");
        }
      });
    }

    setupVirtualScroll();
    enableInlineEditing();
    initSearch();

    document.addEventListener("keydown", (e) => {
      if (el.modal.style.display !== "flex") return;
      if (!materialsData.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); selectedRowIndex = Math.min(selectedRowIndex+1, materialsData.length-1); scrollToSelected(); highlightSelectedRow(); }
      if (e.key === "ArrowUp") { e.preventDefault(); selectedRowIndex = Math.max(selectedRowIndex-1, 0); scrollToSelected(); highlightSelectedRow(); }
      if (e.key === "Enter") { if (selectedRowIndex >= 0) showMsg(`تم اختيار: ${materialsData[selectedRowIndex].name}`, "success"); }
      if (e.key === "Escape") { selectedRowIndex = -1; highlightSelectedRow(); }
    });

    document.querySelectorAll("#materialsTable thead th.sortable").forEach(th => {
      th.addEventListener("click", () => sortMaterials(th.dataset.field));
    });
    loadSortState();
    if (sortState.field) sortMaterials(sortState.field);

    // 🔥 استعادة حالة الفتح بعد تحميل الصفحة (إذا كان المودال مفتوحاً سابقاً)
    if (localStorage.getItem("materialsModalOpen") === "true") {
      setTimeout(() => openModal(), 100);
    }
  }

  if (document.readyState === 'loading') document.addEventListener("DOMContentLoaded", init);
  else init();

  window.openMaterialsModal = (search = "") => openModal(search);
})();