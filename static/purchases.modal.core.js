// purchases.modal.core.js - تهيئة النموذج العائم للمشتريات
(function () {
  "use strict";

  const state = {
    isLoading: false,
    autoRefreshInterval: null,
  };

  window.purchasesModalState = {};

  const el = {};

  function initDOM() {
    el.modal = document.getElementById("purchasesModal");
    el.header = document.getElementById("purchasesModalHeader");
    el.content = document.getElementById("purchasesModalContent");
    el.openBtn = document.getElementById("openPurchasesBtn");
    el.closeBtn = document.getElementById("closePurchasesBtn");
    el.minimizeBtn = document.getElementById("minimizePurchasesBtn");
    el.maximizeBtn = document.getElementById("maximizePurchasesBtn");
  }

  function centerModal(modal) {
    if (!modal) return;
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
  }

// ================================================

function openModal(searchTerm = "") {
    if (!el.modal) return;
    
    if (el.modal.style.display === "flex") {
      if (typeof setActiveModal === 'function') {
        setActiveModal(el.modal, "purchasesModal");
      }
      return;
    }
    
    if (typeof window.restorePurchasesModalState === "function") {
      window.restorePurchasesModalState();
    } else {
      el.modal.style.display = "flex";
      centerModal(el.modal);
    }
    
    el.modal.style.display = "flex";
    
    if (typeof setActiveModal === 'function') {
      setActiveModal(el.modal, "purchasesModal");
    }
    
    if (!el.modal._dragEnabled) {
      if (typeof enableModalDrag === 'function') {
        enableModalDrag(el.modal, el.header, "purchasesModal");
      }
      if (typeof enableModalResize === 'function') {
        enableModalResize(el.modal, "purchasesModal");
      }
      if (typeof enableModalFocus === 'function') {
        enableModalFocus(el.modal, "purchasesModal");
      }
      el.modal._dragEnabled = true;
    }
    
    localStorage.setItem("purchasesModalOpen", "true");
    
    if (typeof restorePurchasesFilterState === 'function') {
      restorePurchasesFilterState();
    }
    if (typeof refreshPurchasesCurrentFilter === 'function') {
      refreshPurchasesCurrentFilter();
    }
    
    setTimeout(() => {
      const rect = el.modal.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      
      let left = parseFloat(el.modal.style.left) || rect.left;
      let top = parseFloat(el.modal.style.top) || rect.top;
      let changed = false;
      
      if (isNaN(left)) { left = (winW - rect.width) / 2; changed = true; }
      if (isNaN(top)) { top = (winH - rect.height) / 2; changed = true; }
      
      left = Math.max(20, Math.min(left, winW - rect.width - 20));
      top = Math.max(60, Math.min(top, winH - rect.height - 20));
      
      if (changed || left !== parseFloat(el.modal.style.left) || top !== parseFloat(el.modal.style.top)) {
        el.modal.style.left = left + "px";
        el.modal.style.top = top + "px";
        el.modal.style.transform = "none";
      }
    }, 100);
    
    
    setTimeout(() => {
      if (typeof restoreColumnWidths === 'function') {
        restoreColumnWidths("purchasesTable", "purchasesColumnWidths");
      }
      const searchInput = document.querySelector(".purchases-search-wrapper input");
      if (searchInput && !searchTerm) searchInput.focus();
    }, 200);
    
    // 🔥 البحث التلقائي إذا كان هناك مصطلح
    const searchTermStr = String(searchTerm || "");
if (searchTermStr && searchTermStr.trim() !== "") {
      setTimeout(() => {
        const searchInput = document.querySelector(".purchases-search-wrapper input");
        if (searchInput) {
          searchInput.value = searchTerm;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 350);
    }
    
    if (typeof window.forceModalFit === 'function') {
      window.forceModalFit("purchasesModal");
    }
  }

// =========================================

  function closeModal() {
    if (!el.modal) return;
    
    if (typeof window.savePurchasesModalState === "function") {
      window.savePurchasesModalState();
    }
    if (typeof saveColumnWidths === 'function') {
      saveColumnWidths("purchasesTable", "purchasesColumnWidths");
    }
    
    el.modal.style.display = "none";
    localStorage.setItem("purchasesModalOpen", "false");
    
    if (window.__ACTIVE_MODAL__ === "purchasesModal") {
      const visibleModals = [...document.querySelectorAll("[id$='Modal']")].filter(m => m.style.display === "flex");
      if (visibleModals.length) {
        const last = visibleModals[visibleModals.length - 1];
        if (typeof setActiveModal === 'function') {
          setActiveModal(last, last.id);
        }
      } else {
        window.__ACTIVE_MODAL__ = null;
      }
    }
    
  }



  function init() {
    initDOM();
    if (!el.modal) return;
    
    el.openBtn?.addEventListener("click", openModal);
    el.closeBtn?.addEventListener("click", closeModal);
    
    if (el.minimizeBtn) {
      el.minimizeBtn.addEventListener("click", () => {
        if (typeof window.minimizeModal === 'function') {
          window.minimizeModal("purchasesModal");
        }
      });
    }
    if (el.maximizeBtn) {
      el.maximizeBtn.addEventListener("click", () => {
        if (typeof window.maximizeModal === 'function') {
          window.maximizeModal("purchasesModal");
        }
      });
    }
    
    if (typeof enableModalFocus === 'function') {
      enableModalFocus(el.modal, "purchasesModal");
    }
    
    if (typeof window.initColumnResize === 'function') {
      window.initColumnResize('purchasesModal', 'purchasesTable', 'purchasesColumnWidths');
    }
    
    const fitBtn = document.getElementById("fitAllColumnsPurchasesBtn");
    if (fitBtn) {
      fitBtn.onclick = () => {
        if (typeof autoFitAllColumns === 'function') {
          autoFitAllColumns("purchasesTable", "purchasesColumnWidths");
        }
      };
    }
    
    const refitBtn = document.getElementById("refitAllColumnsPurchasesBtn");
    if (refitBtn) {
      refitBtn.onclick = () => {
        if (typeof disableAutoFit === 'function') {
          disableAutoFit("purchasesTable", "purchasesModalContent", "purchasesColumnWidths");
        }
      };
    }
    
    if (typeof window.setupModalDoubleClick === 'function') {
      window.setupModalDoubleClick(el.header, "purchasesModal", window.maximizeModal);
    }
    
    window.addEventListener("resize", () => {
      if (el.modal && el.modal.style.display === "flex" && (!window.purchasesModalState || !window.purchasesModalState.isMaximized)) {
        const rect = el.modal.getBoundingClientRect();
        let left = parseFloat(el.modal.style.left) || rect.left;
        let top = parseFloat(el.modal.style.top) || rect.top;
        left = Math.max(20, Math.min(left, window.innerWidth - rect.width - 20));
        top = Math.max(60, Math.min(top, window.innerHeight - rect.height - 20));
        el.modal.style.left = left + "px";
        el.modal.style.top = top + "px";
      }
    });
    
    if (localStorage.getItem("purchasesModalOpen") === "true") {
      setTimeout(openModal, 100);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  
  window.openPurchasesModal = openModal;
  window.closePurchasesModal = closeModal;


})();