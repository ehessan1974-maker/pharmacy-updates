(function () {
  "use strict";

  // 🔒 قفل عالمي
  window.__MODAL_LOCK__ = {
    type: null,     // 'drag' | 'resize'
    owner: null     // modal id
  };
// ==================== 1️⃣ دالة حفظ عامة =====================
function saveModalState(modalId, stateObj = {}) {
  const modal = document.getElementById(modalId);
  if (!modal || modal.style.display === "none") return;

  if (stateObj.isMinimized || stateObj.isMaximized) return;

  const rect = modal.getBoundingClientRect();

  // v9-fix: حفظ بكسلات فعلية عند التمركز النسبي — "50%" المحفوظة كانت تقفز بالنافذة لاحقاً
  const __isT = modal.style.transform && modal.style.transform !== "none";
  localStorage.setItem(`modalState_${modalId}`, JSON.stringify({
    width: modal.style.width || rect.width + "px",
    height: modal.style.height || rect.height + "px",
    left: __isT ? rect.left + "px" : modal.style.left,
    top: __isT ? rect.top + "px" : modal.style.top,
    maximized: stateObj.isMaximized || false
  }));
}
// ========= 2️⃣ دالة استرجاع عامة ============================
function restoreModalState(modalId, defaultSize = {}) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const saved = localStorage.getItem(`modalState_${modalId}`);

  if (saved) {
    try {
      const s = JSON.parse(saved);

      if (s.width && !s.maximized) modal.style.width = s.width;
      if (s.height && !s.maximized) modal.style.height = s.height;

      // v8-fix: "0px" قيمة صحيحة — كانت تُعد ناقصة فتُعاد التمركزية وتعود القفزة
      // v9-fix: قيم "50%" القديمة غير صالحة — تُتمرك بدل القفز للزاوية
      const __badL = typeof s.left === "string" && s.left.indexOf("%") >= 0;
      const __badT = typeof s.top === "string" && s.top.indexOf("%") >= 0;
      const hasL = s.left !== undefined && s.left !== null && s.left !== "" && !__badL;
      const hasT = s.top !== undefined && s.top !== null && s.top !== "" && !__badT;
      if (hasL && hasT && !s.maximized) {
        modal.style.left = s.left;
        modal.style.top = s.top;
        modal.style.transform = "none";
      } else if (!s.maximized) {
        centerModal(modal);
      }

    } catch (e) {
      console.error("restore error", e);
    }
  } else {
    // default
    modal.style.width = defaultSize.width || "1000px";
    modal.style.height = defaultSize.height || "600px";
    centerModal(modal);
  }
}
// ================ 3️⃣ helper للتوسيط =========================
function centerModal(modal) {
  modal.style.left = "50%";
  modal.style.top = "50%";
  modal.style.transform = "translate(-50%, -50%)";
}
// ====================================================
  function canStart(type, id) {
    return (
      !window.__MODAL_LOCK__.type ||
      window.__MODAL_LOCK__.owner === id
    );
  }

  function lock(type, id) {
    window.__MODAL_LOCK__.type = type;
    window.__MODAL_LOCK__.owner = id;
  }

  function unlock() {
    window.__MODAL_LOCK__.type = null;
    window.__MODAL_LOCK__.owner = null;
  }
// modal.manager.js - تحديث enableModalFocus

window.enableModalFocus = function(modal, modalId) {
  modal.addEventListener("mousedown", (e) => {
    // منع التعارض مع السحب أو التغيير
    if (e.target.closest(".resize-handle")) return;
    if (e.target.closest("button") && !e.target.closest(".window-controls button")) return;
    
    // 🔥 تفعيل هذا المودال وإعادة تفعيل مقابضه
    setActiveModal(modal, modalId);
  });
};
// ================= FOCUS SYSTEM =================
window.__ACTIVE_MODAL__ = null;
let zIndexCounter = 10000;

// modal.manager.js - تحديث دالة setActiveModal

window.setActiveModal = function(modal, modalId) {
  if (!modal) return;

  // إزالة active من الجميع
  document.querySelectorAll(".modal-active").forEach(m => {
    m.classList.remove("modal-active");
  });

  // تعيين الحالي
  modal.classList.add("modal-active");
  window.__ACTIVE_MODAL__ = modalId;
  document.body.setAttribute("data-active-modal", modalId);

  // رفعه للأعلى
  zIndexCounter++;
  modal.style.zIndex = zIndexCounter;

  // 🔥 إعادة تفعيل مقابض النموذج الحالي فقط، وتعطيل الباقي
  document.querySelectorAll(".modal-window, [id$='Modal']").forEach(m => {
    const handles = m.querySelectorAll(".resize-handle");
    
    if (m === modal) {
      // 🔥 النموذج النشط: تفعيل المقابض
      handles.forEach(h => {
        h.style.pointerEvents = "auto";
        h.style.opacity = "1";
      });
    } else {
      // النماذج الأخرى: تعطيل المقابض
      handles.forEach(h => {
        h.style.pointerEvents = "none";
        h.style.opacity = "0.3";
      });
    }
  });
}
  /* ================= DRAG ================= */
  window.enableModalDrag = function (modal, header, modalId) {
    let offsetX = 0, offsetY = 0, dragging = false;
header.addEventListener("mousedown", (e) => {

  if (
    e.target.closest("button") ||
    e.target.closest("input") ||
    e.target.closest(".resize-handle")
  ) return;

setActiveModal(modal, modalId);

  // 🔥 لازم يكون هو النشط
//  if (window.__ACTIVE_MODAL__ !== modalId) return;

  // 🔥 تحقق من القفل
  if (!canStart("drag", modalId)) return;

  dragging = true;
  lock("drag", modalId);

  // v8-fix: تحويل التمركز النسبي (50% + translate) إلى بكسل قبل السحب
  // — بدونه تقفز النافذة نصف حجمها مع أول حركة
  try {
    const r0 = modal.getBoundingClientRect();
    if (modal.style.transform && modal.style.transform !== "none") {
      modal.style.transform = "none";
      modal.style.left = r0.left + "px";
      modal.style.top = r0.top + "px";
    }
  } catch (err) { }

  const rect = modal.getBoundingClientRect();
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;

  modal.style.transition = "none";
  document.body.style.userSelect = "none";
});

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      if (window.__MODAL_LOCK__.owner !== modalId) return;

      e.preventDefault();

      // v8-fix: تتبع دقيق + منع ضياع النافذة خارج الشاشة (تبقى 100px مرئية على الأقل)
      let nx = e.clientX - offsetX;
      let ny = e.clientY - offsetY;
      const w = modal.offsetWidth;
      const h = modal.offsetHeight;
      nx = Math.max(100 - w, Math.min(nx, window.innerWidth - 100));
      ny = Math.max(0, Math.min(ny, window.innerHeight - 60));
      modal.style.left = nx + "px";
      modal.style.top = ny + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;

      dragging = false;
      unlock();
      modal.style.transition = "";
      document.body.style.userSelect = "";
      // v10-fix: حفظ الموضع بعد السحب — كان يضيع عند التحديث/الإغلاق
      if (typeof window.saveModalState === "function") window.saveModalState(modalId);
    });
  };
// ===============================================

window.fitModalToScreen = function(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal || modal.style.display !== "flex") return;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  let w = modal.offsetWidth;
  let h = modal.offsetHeight;
  let changed = false;
  if (w > winW - 20) {
    w = winW - 20;
    modal.style.width = w + "px";
    changed = true;
  }
  if (h > winH - 40) {
    h = winH - 40;
    modal.style.height = h + "px";
    changed = true;
  }
  // إعادة التموضع إذا خرجت عن الحدود
  let left = parseFloat(modal.style.left) || modal.getBoundingClientRect().left;
  let top = parseFloat(modal.style.top) || modal.getBoundingClientRect().top;
  left = Math.max(5, Math.min(left, winW - w - 5));
  top = Math.max(5, Math.min(top, winH - h - 30));
  if (left !== parseFloat(modal.style.left) || top !== parseFloat(modal.style.top)) {
    modal.style.left = left + "px";
    modal.style.top = top + "px";
    modal.style.transform = "none";
    changed = true;
  }
  if (changed) saveModalState(modalId);
};

  /* ================= RESIZE ================= */
window.enableModalResize = function (modal, modalId) {
    const MIN_W = 280;   // مُخفض للشاشات الصغيرة
    const MIN_H = 150;

    let active = false;
    let type = null;
    let startX, startY, startW, startH, startL, startT;

    function getType(h) {
        if (h.classList.contains("resize-right")) return "right";
        if (h.classList.contains("resize-left")) return "left";
        if (h.classList.contains("resize-bottom")) return "bottom";
        if (h.classList.contains("resize-up")) return "up";
        if (h.classList.contains("resize-bottom-right")) return "br";
        if (h.classList.contains("resize-bottom-left")) return "bl";
        if (h.classList.contains("resize-up-right")) return "tr";
        if (h.classList.contains("resize-up-left")) return "tl";
        return null;
    }

    function onStart(e) {
        e.preventDefault();
        e.stopPropagation();

        const isTouch = e.type === "touchstart";
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;

        const handle = isTouch ? e.target : e.target.closest?.(".resize-handle");
        if (!handle) return;

        setActiveModal(modal, modalId);
        if (!canStart("resize", modalId)) return;

        // v8-fix: نفس إصلاح السحب — إلغاء التمركز النسبي قبل قراءة المستطيل
        try {
          const r0 = modal.getBoundingClientRect();
          if (modal.style.transform && modal.style.transform !== "none") {
            modal.style.transform = "none";
            modal.style.left = r0.left + "px";
            modal.style.top = r0.top + "px";
          }
        } catch (err) { }

        lock("resize", modalId);
        active = true;
        type = getType(handle);

        const rect = modal.getBoundingClientRect();
        startX = clientX;
        startY = clientY;
        startW = rect.width;
        startH = rect.height;
        startL = rect.left;
        startT = rect.top;

        document.body.style.cursor = getComputedStyle(handle).cursor;
        document.body.style.userSelect = "none";
    }

    function onMove(e) {
        if (!active) return;
        if (window.__MODAL_LOCK__.owner !== modalId) return;
        e.preventDefault();

        const isTouch = e.type === "touchmove";
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;

        const dx = clientX - startX;
        const dy = clientY - startY;

        let w = startW;
        let h = startH;
        let l = startL;
        let t = startT;

        switch (type) {
            case "right": w += dx; break;
            case "bottom": h += dy; break;
            case "br": w += dx; h += dy; break;
            case "left": w -= dx; break;
            case "up": h -= dy; break;
            case "bl": w -= dx; h += dy; break;
            case "tr": w += dx; h -= dy; break;
            case "tl": w -= dx; h -= dy; break;
        }

        // v8-fix: حدود صحيحة — الحد الأدنى + بقاء الحافة المقابلة ثابتة + داخل الشاشة
        const LEFT_EDGES = ["left", "bl", "tl"];
        const TOP_EDGES = ["up", "tr", "tl"];
        w = Math.max(MIN_W, Math.min(w, window.innerWidth - 10 - startL));
        h = Math.max(MIN_H, Math.min(h, window.innerHeight - 10 - startT));
        if (w !== startW && LEFT_EDGES.indexOf(type) >= 0) l = startL + (startW - w);
        if (h !== startH && TOP_EDGES.indexOf(type) >= 0) t = startT + (startH - h);

        modal.style.width = w + "px";
        modal.style.height = h + "px";
        modal.style.left = l + "px";
        modal.style.top = t + "px";
    }

    function onEnd() {
        if (!active) return;
        active = false;
        unlock();
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (modalId === "materialsModal") {
            if (typeof window.saveMaterialsModalState === "function") window.saveMaterialsModalState();
        } else if (modalId === "floatingModal") {
            if (typeof window.saveSalesModalState === "function") window.saveSalesModalState();
        }
    }

    // إرفاق المستمعين لكل مقبض
    modal.querySelectorAll(".resize-handle").forEach(handle => {
        // أحداث الماوس
        handle.addEventListener("mousedown", onStart);
        // أحداث اللمس
        handle.addEventListener("touchstart", onStart, { passive: false });
    });

    // أحداث الماوس العامة
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    // أحداث اللمس العامة
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
};

// ==========================================================
window.forceModalFit = function(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (window.innerWidth < 768) {
    modal.style.position = 'fixed';
    modal.style.top = '10px';
    modal.style.left = '10px';
    modal.style.right = '10px';
    modal.style.bottom = '10px';
    modal.style.width = 'auto';
    modal.style.height = 'auto';
    modal.style.maxWidth = 'calc(100vw - 20px)';
    modal.style.maxHeight = 'calc(100vh - 20px)';
    modal.style.transform = 'none';
    modal.style.margin = '0';
    modal.style.overflow = 'auto';
  }
};

// ====================== ضبط النوافذ على الشاشات الصغيرة ======================
window.fitModalToScreen = function(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal || modal.style.display !== "flex") return false;
  
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  let changed = false;
  
  // تقليص العرض إذا كان أكبر من الشاشة
  let w = modal.offsetWidth;
  if (w > winW - 20) {
    w = winW - 20;
    modal.style.width = w + "px";
    changed = true;
  }
  
  // تقليص الارتفاع إذا كان أكبر من الشاشة
  let h = modal.offsetHeight;
  if (h > winH - 40) {
    h = winH - 40;
    modal.style.height = h + "px";
    changed = true;
  }
  
  // إعادة التموضع إذا خرجت النافذة عن الحدود
  let left = parseFloat(modal.style.left) || modal.getBoundingClientRect().left;
  let top = parseFloat(modal.style.top) || modal.getBoundingClientRect().top;
  let newLeft = Math.max(5, Math.min(left, winW - w - 5));
  let newTop = Math.max(5, Math.min(top, winH - h - 30));
  
  if (newLeft !== left || newTop !== top) {
    modal.style.left = newLeft + "px";
    modal.style.top = newTop + "px";
    modal.style.transform = "none";
    changed = true;
  }
  
  if (changed && typeof window.saveModalState === "function") {
    window.saveModalState(modalId);
  }
  return changed;
};

// إضافة مستمعي الأحداث (resize + orientationchange)
if (window.innerWidth < 768) {
  // تأخير بسيط لتطبيق بعد تحميل الصفحة
  setTimeout(() => {
    fitModalToScreen("floatingModal");
    fitModalToScreen("materialsModal");
  }, 100);
}

window.addEventListener("resize", () => {
  if (window.innerWidth < 768) {
    fitModalToScreen("floatingModal");
    fitModalToScreen("materialsModal");
  }
});

window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    // إعادة الحساب بعد تغيير الاتجاه (أفقي/عمودي)
    fitModalToScreen("floatingModal");
    fitModalToScreen("materialsModal");
  }, 100);
});

function adjustModalsForMobile() {
  if (window.innerWidth < 768) {
    ['floatingModal', 'materialsModal'].forEach(id => {
      const m = document.getElementById(id);
      if (m && m.style.display === 'flex') {
        m.style.position = 'fixed';
        m.style.top = '10px';
        m.style.left = '10px';
        m.style.right = '10px';
        m.style.bottom = '10px';
        m.style.width = 'auto';
        m.style.height = 'auto';
        m.style.transform = 'none';
      }
    });
  }
}

window.addEventListener('resize', adjustModalsForMobile);
window.addEventListener('orientationchange', () => setTimeout(adjustModalsForMobile, 100));
adjustModalsForMobile(); // تنفيذ فوري


})();