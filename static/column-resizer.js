// column-resizer.js - إدارة تغيير عرض الأعمدة يدويًا (عام لجميع المودالات)
(function() {
  "use strict";

  // تخزين مؤقت لعروض الأعمدة لكل جدول
  const resizeState = new Map();

  window.initColumnResize = function(modalId, tableId, storageKey) {
    const modal = document.getElementById(modalId);
    const table = document.getElementById(tableId);
    if (!modal || !table) {
      console.warn(`initColumnResize: لا يمكن العثور على المودال "${modalId}" أو الجدول "${tableId}"`);
      return;
    }

    // إزالة المقابض القديمة لمنع التكرار
    const oldResizers = table.querySelectorAll(".resizer");
    oldResizers.forEach(r => r.remove());

    // استعادة العروض المحفوظة
    let savedWidths = null;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) savedWidths = JSON.parse(saved);
    } catch(e) {}

    // الحصول على رؤوس الأعمدة
    const headers = table.querySelectorAll("thead th");
    if (!headers.length) return;

    // تعيين العروض المحفوظة إذا وجدت
    if (savedWidths && savedWidths.length === headers.length) {
      headers.forEach((th, idx) => {
        if (savedWidths[idx]) {
          th.style.width = savedWidths[idx];
        }
      });
      table.style.tableLayout = "fixed";
    }

    // إضافة مقبض لكل عمود
    headers.forEach((th, idx) => {
      const resizer = document.createElement("div");
      resizer.className = "resizer";
      resizer.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: 6px;
        height: 100%;
        cursor: col-resize;
        user-select: none;
        z-index: 2;
      `;
      // جعل الـ th نسبيًا لوضع المقبض
      th.style.position = "relative";
      th.appendChild(resizer);

      let startX, startWidth, nextWidth;
      let isResizing = false;

      const mouseDownHandler = function(e) {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = th.offsetWidth;

        isResizing = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        document.addEventListener("mousemove", mouseMoveHandler);
        document.addEventListener("mouseup", mouseUpHandler);
      };

      const mouseMoveHandler = function(e) {
        if (!isResizing) return;
        const dx = startX - e.clientX;
        let newWidth = startWidth + dx;
        newWidth = Math.max(50, Math.min(newWidth, 500));
        th.style.width = newWidth + "px";
        table.style.tableLayout = "fixed";
      };

      const mouseUpHandler = function() {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        // حفظ العروض الحالية لكل الأعمدة
        const widths = [];
        headers.forEach((h, i) => {
          let w = h.style.width;
          if (!w) w = h.offsetWidth + "px";
          widths.push(w);
        });
        localStorage.setItem(storageKey, JSON.stringify(widths));

        document.removeEventListener("mousemove", mouseMoveHandler);
        document.removeEventListener("mouseup", mouseUpHandler);
      };

      resizer.addEventListener("mousedown", mouseDownHandler);
    });
  };
})();