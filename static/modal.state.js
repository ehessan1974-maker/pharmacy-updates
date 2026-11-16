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
    // v9-fix: عند التمركز النسبي نحفظ بكسلات فعلية — حفظ "50%" كان يعيد النافذة للزاوية لاحقاً
    const __isT = modal.style.transform && modal.style.transform !== "none";
    const data = {
      left: __isT ? rect.left + "px" : (modal.style.left || rect.left + "px"),
      top: __isT ? rect.top + "px" : (modal.style.top || rect.top + "px"),
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
        // v10-fix: نبدأ بحالة غير مصغرة ثم نستدعي minimizeModal — كان isMinimized:true
        // يقلب التبديل فيستعيد النافذة بدل تصغيرها فتضيع حالة التصغير بعد إعادة الفتح/التحديث
        modalStates[modalId] = {
          isMinimized: false,
          normalSize: data.normalSize,
          isMaximized: data.isMaximized || false
        };
        if (data.normalSize) {
          modal.style.width = data.normalSize.width;
          modal.style.height = data.normalSize.height;
          // v10-fix: قيم "%" القديمة غير صالحة — نترك التمركز الافتراضي
          const __nl0 = String(data.normalSize.left || "");
          const __nt0 = String(data.normalSize.top || "");
          if (__nl0 && __nt0 && __nl0.indexOf("%") < 0 && __nt0.indexOf("%") < 0) {
            modal.style.left = __nl0;
            modal.style.top = __nt0;
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
        // v9-fix: قيم "50%" القديمة المحفوظة غير صالحة — تمركز بدل القفز للزاوية
        const __badL = typeof data.left === "string" && data.left.indexOf("%") >= 0;
        const __badT = typeof data.top === "string" && data.top.indexOf("%") >= 0;
        if (data.left && data.top && !__badL && !__badT) {
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
        // v9-fix: حفظ بكسلات فعلية عند التمركز النسبي
        const __isT2 = modal.style.transform && modal.style.transform !== "none";
        state.normalSize = {
          width: modal.style.width || rect.width + "px",
          height: modal.style.height || rect.height + "px",
          left: __isT2 ? rect.left + "px" : (modal.style.left || rect.left + "px"),
          top: __isT2 ? rect.top + "px" : (modal.style.top || rect.top + "px")
        };
      }
      state.isMinimized = true;
      state.isMaximized = false;
      // v10-fix: ارتفاع الشريط = ارتفاع الهيدر الفعلي + هامش — 52px الثابتة كانت تقصّ الأزرار أو تترك فجوة
      let __hdr = null;
      let __strip = 34;
      try {
        __hdr = modal.querySelector("#floatingModalHeader, #materialsHeader, #purchasesModalHeader, .modal-window-header");
        if (__hdr) {
          const __wasHidden = modal.style.display !== "flex";
          if (__wasHidden) modal.style.display = "flex";
          const __hh = __hdr.getBoundingClientRect().height;
          if (__wasHidden) modal.style.display = "none";
          if (__hh > 0) __strip = Math.round(__hh) + 4;
        }
      } catch (err) { __hdr = null; }
      modal.style.height = __strip + "px";
      modal.style.minHeight = __strip + "px";
      modal.classList.add("modal-minimized");
      modal.style.overflow = "hidden";
      if (content) content.style.display = "none";
      handles.forEach(h => h.style.display = "none");
      // v10-fix: إخفاء كل ما دون الهيدر (شريط Bulk في المبيعات وغيره) حتى لا يفيض خارج الشريط
      modal.querySelectorAll(":scope > *").forEach(ch => {
        if (ch === content || ch === __hdr) return;
        const __tg = ch.tagName || "";
        if (__tg === "STYLE" || __tg === "LINK" || __tg === "SCRIPT") return;
        if (ch.classList && ch.classList.contains("resize-handle")) return;
        if (ch.style.display === "none") return;
        ch.setAttribute("data-min-hidden", "1");
        ch.style.display = "none";
      });
      const __mb = modal.querySelector("#minimizeBtnWindow, #minimizeMaterialsBtn, #minimizePurchasesBtn");
      if (__mb) __mb.title = "استعادة";
    } else {
      if (state.normalSize) {
        modal.style.width = state.normalSize.width;
        modal.style.height = state.normalSize.height;
        // v9-fix: علاج قيم "50%" القديمة — تمركز بدل القفز
        const __nl = String(state.normalSize.left || "");
        const __nt = String(state.normalSize.top || "");
        if (__nl.indexOf("%") >= 0 || __nt.indexOf("%") >= 0) {
          centerModal(modal);
        } else {
          modal.style.left = __nl;
          modal.style.top = __nt;
          modal.style.transform = "none";
        }
      }
      modal.classList.remove("modal-minimized");
      modal.querySelectorAll('[data-min-hidden="1"]').forEach(ch => {
        ch.style.display = "";
        ch.removeAttribute("data-min-hidden");
      });
      modal.style.minHeight = "";
      modal.style.overflow = "";
      if (content) content.style.display = "";
      handles.forEach(h => h.style.display = "");
      state.isMinimized = false;
      const __mb2 = modal.querySelector("#minimizeBtnWindow, #minimizeMaterialsBtn, #minimizePurchasesBtn");
      if (__mb2) __mb2.title = "تصغير";
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
        // v9-fix: حفظ بكسلات فعلية عند التمركز النسبي
        const __isT2 = modal.style.transform && modal.style.transform !== "none";
        state.normalSize = {
          width: modal.style.width || rect.width + "px",
          height: modal.style.height || rect.height + "px",
          left: __isT2 ? rect.left + "px" : (modal.style.left || rect.left + "px"),
          top: __isT2 ? rect.top + "px" : (modal.style.top || rect.top + "px")
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
        // v9-fix: علاج قيم "50%" القديمة — تمركز بدل القفز
        const __nl = String(state.normalSize.left || "");
        const __nt = String(state.normalSize.top || "");
        if (__nl.indexOf("%") >= 0 || __nt.indexOf("%") >= 0) {
          centerModal(modal);
        } else {
          modal.style.left = __nl;
          modal.style.top = __nt;
          modal.style.transform = "none";
        }
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