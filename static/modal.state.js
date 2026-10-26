// modal.state.js - إدارة موحدة لحفظ واستعادة حالة النوافذ العائمة
(function() {
  "use strict";

  const STORAGE_KEYS = {
    floatingModal: "floatingModalState",
    materialsModal: "materialsModalState",
    purchasesModal: "purchasesModalState"
  };

  const modalStates = {};

  function getModalElement(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) console.warn(`Modal element not found: ${modalId}`);
    return modal;
  }

  window.saveModalState = function(modalId) {
    const modal = getModalElement(modalId);
    if (!modal || modal.style.display !== "flex") return;

    const state = modalStates[modalId] || {};
    if (state.isMinimized) {
      localStorage.setItem(STORAGE_KEYS[modalId], JSON.stringify({
        minimized: true,
        normalSize: state.normalSize,
        isMaximized: state.isMaximized
      }));
      return;
    }

    const rect = modal.getBoundingClientRect();
    const data = {
      left: modal.style.left || rect.left + "px",
      top: modal.style.top || rect.top + "px",
      width: modal.style.width || rect.width + "px",
      height: modal.style.height || rect.height + "px",
      maximized: state.isMaximized || false,
      minimized: false
    };
    if (state.isMaximized && state.normalSize) {
      data.normalSize = state.normalSize;
    }
    localStorage.setItem(STORAGE_KEYS[modalId], JSON.stringify(data));
  };

  window.restoreModalState = function(modalId, defaultWidth = "1100px", defaultHeight = "700px") {
    const modal = getModalElement(modalId);
    if (!modal) return;

    const saved = localStorage.getItem(STORAGE_KEYS[modalId]);
    if (!saved) {
      modal.style.width = defaultWidth;
      modal.style.height = defaultHeight;
      centerModal(modal);
      return;
    }

    try {
      const data = JSON.parse(saved);
      if (data.minimized) {
        modalStates[modalId] = {
          isMinimized: true,
          normalSize: data.normalSize,
          isMaximized: data.isMaximized || false
        };
        if (data.normalSize) {
          modal.style.width = data.normalSize.width;
          modal.style.height = data.normalSize.height;
          if (data.normalSize.left && data.normalSize.top) {
            modal.style.left = data.normalSize.left;
            modal.style.top = data.normalSize.top;
            modal.style.transform = "none";
          }
        }
        if (typeof window.minimizeModal === "function") {
          window.minimizeModal(modalId);
        }
        return;
      }

      if (!data.maximized) {
        const isMobile = window.innerWidth < 600;
        if (isMobile) {
          modal.style.width = "calc(100vw - 20px)";
          modal.style.height = "calc(100vh - 20px)";
          modal.style.left = "10px";
          modal.style.top = "10px";
          modal.style.transform = "none";
          return;
        }

        if (data.width) {
          let w = parseFloat(data.width);
          if (w > window.innerWidth - 20) w = window.innerWidth - 20;
          if (w < 200) w = 200;
          modal.style.width = w + "px";
        }
        if (data.height) {
          let h = parseFloat(data.height);
          if (h > window.innerHeight - 40) h = window.innerHeight - 40;
          modal.style.height = h + "px";
        }
        if (data.left && data.top) {
          let left = parseFloat(data.left);
          let top = parseFloat(data.top);
          left = Math.max(10, Math.min(left, window.innerWidth - modal.offsetWidth - 10));
          top = Math.max(10, Math.min(top, window.innerHeight - modal.offsetHeight - 10));
          modal.style.left = left + "px";
          modal.style.top = top + "px";
          modal.style.transform = "none";
        } else {
          centerModal(modal);
        }
      } else {
        if (data.normalSize) {
          modalStates[modalId] = modalStates[modalId] || {};
          modalStates[modalId].normalSize = data.normalSize;
        }
        if (typeof window.maximizeModal === "function") {
          window.maximizeModal(modalId);
        } else {
          modal.style.width = "calc(100vw - 20px)";
          modal.style.height = "calc(100vh - 20px)";
          modal.style.left = "10px";
          modal.style.top = "10px";
          modal.style.transform = "none";
          if (modalStates[modalId]) modalStates[modalId].isMaximized = true;
        }
      }
    } catch(e) {
      console.error(`Error restoring modal ${modalId}:`, e);
      centerModal(modal);
    }
  };

  function centerModal(modal) {
    if (!modal) return;
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
  }

  window.minimizeModal = function(modalId) {
    const modal = getModalElement(modalId);
    if (!modal) return;
    const content = modal.querySelector("#purchasesModalContent, #floatingModalContent, #materialsContent");
    const handles = modal.querySelectorAll(".resize-handle");

    const state = modalStates[modalId] || {};
    if (!state.isMinimized) {
      if (!state.normalSize) {
        const rect = modal.getBoundingClientRect();
        state.normalSize = {
          width: modal.style.width || rect.width + "px",
          height: modal.style.height || rect.height + "px",
          left: modal.style.left || rect.left + "px",
          top: modal.style.top || rect.top + "px"
        };
      }
      state.isMinimized = true;
      state.isMaximized = false;
      modal.style.height = "52px";
      modal.style.minHeight = "52px";
      modal.style.overflow = "hidden";
      if (content) content.style.display = "none";
      handles.forEach(h => h.style.display = "none");
    } else {
      if (state.normalSize) {
        modal.style.width = state.normalSize.width;
        modal.style.height = state.normalSize.height;
        modal.style.left = state.normalSize.left;
        modal.style.top = state.normalSize.top;
        modal.style.transform = "none";
      }
      modal.style.minHeight = "";
      modal.style.overflow = "";
      if (content) content.style.display = "";
      handles.forEach(h => h.style.display = "");
      state.isMinimized = false;
    }
    modalStates[modalId] = state;
    window.saveModalState(modalId);
  };

  window.maximizeModal = function(modalId) {
    const modal = getModalElement(modalId);
    if (!modal) return;

    const state = modalStates[modalId] || {};
    if (state.isMinimized) {
      window.minimizeModal(modalId);
    }

    if (!state.isMaximized) {
      if (!state.normalSize) {
        const rect = modal.getBoundingClientRect();
        state.normalSize = {
          width: modal.style.width || rect.width + "px",
          height: modal.style.height || rect.height + "px",
          left: modal.style.left || rect.left + "px",
          top: modal.style.top || rect.top + "px"
        };
      }
      modal.style.width = "calc(100vw - 20px)";
      modal.style.height = "calc(100vh - 20px)";
      modal.style.left = "10px";
      modal.style.top = "10px";
      modal.style.transform = "none";
      state.isMaximized = true;
    } else {
      if (state.normalSize) {
        modal.style.width = state.normalSize.width;
        modal.style.height = state.normalSize.height;
        modal.style.left = state.normalSize.left;
        modal.style.top = state.normalSize.top;
        modal.style.transform = "none";
      } else {
        centerModal(modal);
      }
      state.isMaximized = false;
    }
    modalStates[modalId] = state;
    window.saveModalState(modalId);
  };

  window.savePurchasesModalState = function() { window.saveModalState("purchasesModal"); };
  window.restorePurchasesModalState = function() { window.restoreModalState("purchasesModal", "1100px", "700px"); };
  window.saveSalesModalState = function() { window.saveModalState("floatingModal"); };
  window.restoreSalesModalState = function() { window.restoreModalState("floatingModal", "900px", "600px"); };
  window.saveMaterialsModalState = function() { window.saveModalState("materialsModal"); };
  window.restoreMaterialsModalState = function() { window.restoreModalState("materialsModal", "1100px", "700px"); };
})();