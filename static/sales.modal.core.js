// sales.modal.core.js (معدل لاستخدام column-auto-fit.js)
(function () {
  "use strict";

  const state = {
    isLoading: false,
    autoRefreshInterval: null,
  };

  window.salesModalState = {};

  const el = {};

  function initDOM() {
    el.modal = document.getElementById("floatingModal");
    el.header = document.getElementById("floatingModalHeader");
    el.content = document.getElementById("floatingModalContent");
    el.openBtn = document.getElementById("openModalBtn");
    el.closeBtn = document.getElementById("closeBtnWindow");
    el.minimizeBtn = document.getElementById("minimizeBtnWindow");
    el.maximizeBtn = document.getElementById("maximizeBtnWindow");
  }
// ===========================================
function openModal() {
    window.currentDateFilter = "today";
    window.singleDate = "";
    window.startDate = "";
    window.endDate = "";

    if (typeof window.resetSalesFilter === 'function') {
        window.resetSalesFilter();
    } else {
        // تعريف دالة احتياطية إذا لم تكن موجودة
        window.currentDateFilter = "today";
        window.singleDate = "";
        window.startDate = "";
        window.endDate = "";
        if (typeof window.refreshCurrentFilter === 'function') {
            window.refreshCurrentFilter(true);
        }
    }

    if (!el.modal) return;
    // استعادة الحالة باستخدام الدالة العامة
    if (typeof window.restoreSalesModalState === "function") {
      window.restoreSalesModalState();
    } else {
      el.modal.style.display = "flex";
      centerModal(el.modal);
    }
    el.modal.style.display = "flex";
    setActiveModal(el.modal, "floatingModal");

    if (!el.modal._dragEnabled) {
      enableModalDrag(el.modal, el.header, "floatingModal");
      enableModalResize(el.modal, "floatingModal");
      enableModalFocus(el.modal, "floatingModal");
      el.modal._dragEnabled = true;
    }
    localStorage.setItem("floatingModalOpen", "true");
    
    // 🔥 تطبيق الأعمدة المخفية فوراً (قبل تحميل البيانات)

    // استعادة الفلترة وتحديث البيانات
//    if (typeof restoreFilterState === 'function') restoreFilterState();
    if (typeof refreshCurrentFilter === 'function') refreshCurrentFilter();
    else if (typeof window.loadSalesTable === 'function') window.loadSalesTable();

    // 🔥 استعادة مصطلح البحث وتنفيذ البحث

setTimeout(async () => {

    const savedSearchTerm =
        window.getSearchTerm
            ? window.getSearchTerm('floatingModal')
            : '';

    const searchInput =
        document.querySelector('.sales-search-wrapper input');

    if (searchInput) {
        searchInput.value = savedSearchTerm;
    }

    // يوجد بحث محفوظ
    if (savedSearchTerm.trim() !== '') {

        window.currentSalesSearchTerm = savedSearchTerm;

        if (typeof window.performSalesSearch === 'function') {
            await window.performSalesSearch(savedSearchTerm, true);
        }

    } else {

        // لا يوجد بحث محفوظ => العودة للفلتر الحالي
        window.currentSalesSearchTerm = '';

        if (typeof window.refreshCurrentFilter === 'function') {
            await window.refreshCurrentFilter(true);
        }
    }

}, 300);
    
    setTimeout(() => {
      const rect = el.modal.getBoundingClientRect();
      if (rect.top < 0 || rect.left < 0) {
        el.modal.style.left = "80px";
        el.modal.style.top = "60px";
        el.modal.style.transform = "none";
      }
    }, 100);
    setTimeout(() => {
      // استعادة عروض الأعمدة المخزنة
      if (typeof restoreColumnWidths === 'function') {
        restoreColumnWidths("floatingTable", "salesColumnWidths");
      }
      const searchInput = document.querySelector(".sales-search-wrapper input");
      if (searchInput) searchInput.focus();
    }, 200);

window.forceModalFit("floatingModal");  // أو materialsModal

  }
// =======================================

  function closeModal() {
    if (!el.modal) return;
    if (typeof window.saveSalesModalState === "function") window.saveSalesModalState();
    // حفظ عروض الأعمدة قبل الإغلاق
    if (typeof saveColumnWidths === 'function') {
      saveColumnWidths("floatingTable", "salesColumnWidths");
    }
    el.modal.style.display = "none";
    localStorage.setItem("floatingModalOpen", "false");
    if (window.__ACTIVE_MODAL__ === "floatingModal") {
      const visibleModals = [...document.querySelectorAll("[id$='Modal']")].filter(m => m.style.display === "flex");
      if (visibleModals.length) {
        const last = visibleModals[visibleModals.length - 1];
        setActiveModal(last, last.id);
      } else {
        window.__ACTIVE_MODAL__ = null;
      }
    }
  }

  function centerModal(modal) {
    if (!modal) return;
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
  }

  function init() {
    initDOM();
    if (!el.modal) return;
    el.openBtn?.addEventListener("click", openModal);
    el.closeBtn?.addEventListener("click", closeModal);
    // استخدام الدوال العامة للتصغير والتكبير
    if (el.minimizeBtn) el.minimizeBtn.addEventListener("click", () => { if (window.minimizeModal) window.minimizeModal("floatingModal"); });
    if (el.maximizeBtn) el.maximizeBtn.addEventListener("click", () => { if (window.maximizeModal) window.maximizeModal("floatingModal"); });
    enableModalFocus(el.modal, "floatingModal");
    enableModalDrag(el.modal, el.header, "floatingModal");
    enableModalResize(el.modal, "floatingModal");
    window.initColumnResize('floatingModal', 'floatingTable', 'salesColumnWidths');

    // ربط أزرار Auto Fit باستخدام الدوال العامة
    const fitBtn = document.getElementById("fitAllColumnsBtn");
    if (fitBtn) {
      fitBtn.onclick = () => {
        if (typeof autoFitAllColumns === 'function') {
          autoFitAllColumns("floatingTable", "salesColumnWidths");
        } else {
          console.warn("autoFitAllColumns not loaded");
        }
      };
    }
    const refitBtn = document.getElementById("refitAllColumnsBtn");
    if (refitBtn) {
      refitBtn.onclick = () => {
        if (typeof disableAutoFit === 'function') {
          disableAutoFit("floatingTable", "floatingModalContent", "salesColumnWidths");
        } else {
          console.warn("disableAutoFit not loaded");
        }
      };
    }

if (window.setupModalDoubleClick) {
  window.setupModalDoubleClick(el.header, "floatingModal", window.maximizeModal);
}
    window.addEventListener("resize", () => {
      if (el.modal && el.modal.style.display === "flex" && (!window.salesModalState || !window.salesModalState.isMaximized)) {
        const rect = el.modal.getBoundingClientRect();
        let left = parseFloat(el.modal.style.left) || rect.left;
        let top = parseFloat(el.modal.style.top) || rect.top;
        left = Math.max(20, Math.min(left, window.innerWidth - rect.width - 20));
        top = Math.max(60, Math.min(top, window.innerHeight - rect.height - 20));
        el.modal.style.left = left + "px";
        el.modal.style.top = top + "px";
      }
    });
    if (localStorage.getItem("floatingModalOpen") === "true") openModal();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.openfloatingModal = openModal;
  window.closefloatingModal = closeModal;
})();