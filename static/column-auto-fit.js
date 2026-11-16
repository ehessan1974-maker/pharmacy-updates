// column-auto-fit.js - حل نهائي لمشكلة اختفاء العناوين بعد disableAutoFit
(function() {
  "use strict";

  window.saveColumnWidths = function(tableId, storageKey) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const headers = table.querySelectorAll("thead th");
    const widths = [];
    headers.forEach(th => {
      let width = th.style.width;
      if (!width || width === "auto") width = th.offsetWidth + "px";
      widths.push(width);
    });
    localStorage.setItem(storageKey, JSON.stringify(widths));
  };

  window.restoreColumnWidths = function(tableId, storageKey) {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const widths = JSON.parse(saved);
      const table = document.getElementById(tableId);
      if (!table) return;
      const headers = table.querySelectorAll("thead th");
      headers.forEach((th, i) => {
        if (widths[i] && widths[i] !== "auto") th.style.width = widths[i];
      });
      table.style.tableLayout = "fixed";
    } catch(e) { console.warn(e); }
  };

  function reapplyHiddenColumns(table) {
    // البحث عن المودال الذي يحتوي الجدول
    const modal = table.closest("[id$='Modal']") || table.closest(".modal-window");
    if (!modal) return;
    const modalId = modal.id;
    if (!modalId) return;

    // استخدام الدالة العامة إن وجدت
    if (typeof window.applyColumnsVisibilityToModal === 'function') {
      window.applyColumnsVisibilityToModal(modalId);
    } else {
      // تطبيق يدوي من localStorage
      const storageKey = 'hiddenColumns_' + modalId;
      let hidden = [];
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) hidden = JSON.parse(saved);
      } catch(e) {}
      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = row.children;
        for (let i = 0; i < cells.length; i++) {
          cells[i].style.display = hidden.includes(i) ? 'none' : '';
        }
      });
    }
  }

  window.autoFitAllColumns = function(tableId, storageKey) {
    const table = document.getElementById(tableId);
    if (!table) return;
    table.classList.remove("no-auto-fit");
    table.classList.add("auto-fit-mode");
    table.style.tableLayout = "auto";

    const headers = table.querySelectorAll("thead th");
    const rows = table.querySelectorAll("tbody tr");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = "14px Arial";

    headers.forEach((th, colIndex) => {
      let maxWidth = ctx.measureText(th.textContent.trim()).width + 50;
      rows.forEach(row => {
        const cell = row.children[colIndex];
        if (cell) {
          const text = cell.textContent.trim();
          if (text) maxWidth = Math.max(maxWidth, ctx.measureText(text).width + 60);
        }
      });
      maxWidth = Math.min(Math.max(maxWidth, 70), 420);
      th.style.width = maxWidth + "px";
    });
    table.style.tableLayout = "fixed";
    if (storageKey) window.saveColumnWidths(tableId, storageKey);
    reapplyHiddenColumns(table);
  };

  window.disableAutoFit = function(tableId, modalContentId, storageKey) {
    const table = document.getElementById(tableId);
    if (!table) return;

    // 1️⃣ إعادة تطبيق الإخفاء أولاً (لضمان بقاء الأعمدة المخفية)
    reapplyHiddenColumns(table);

    // 2️⃣ تغيير نمط الجدول والعرض
    table.classList.remove("auto-fit-mode");
    table.classList.add("no-auto-fit");
    table.style.tableLayout = "fixed";

    const headers = table.querySelectorAll("thead th");
    const modalContent = document.getElementById(modalContentId);
    let availableWidth = modalContent ? modalContent.clientWidth - 40 : 900;
    const columnCount = headers.length;
    let columnWidth = Math.max(85, Math.floor(availableWidth / columnCount));
    headers.forEach(th => {
      th.style.width = columnWidth + "px";
      th.style.whiteSpace = "normal";
      th.style.wordBreak = "break-word";
    });
    table.querySelectorAll("td").forEach(td => {
      td.style.whiteSpace = "normal";
      td.style.wordBreak = "break-word";
    });
    if (storageKey) window.saveColumnWidths(tableId, storageKey);

    // 3️⃣ إعادة تطبيق الإخفاء مرة أخرى بعد تغيير العرض (للتأكد من عدم فقدانه)
    setTimeout(() => reapplyHiddenColumns(table), 5);
  };
})();