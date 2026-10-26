// invoice-columns-manager.js - إدارة إخفاء/إظهار الأعمدة باستخدام نافذة منبثقة
(function() {
  "use strict";

  const STORAGE_KEY = "hiddenInvoiceColumns";
  let hiddenIndexes = [];

  const columnNames = [
    "المادة",
    "الكمية",
    "المبلغ المقبوض من مادة واحدة",
    "إيصال نسبة الربح إلى",
    "حسم %",
    "الإجمالي قبل الحسم",
    "رقم الطبخة",
    "قيمة الحسم",
    "سعر المبيع",
    "الإجمالي بعد الحسم",
    "نسبة الربح",
    "إجمالي الربح",
    "التكلفة",
    "إجمالي التكلفة",
    "حذف"
  ];

  function loadHiddenColumns() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        hiddenIndexes = JSON.parse(saved);
      } catch(e) { console.warn(e); }
    }
  }

  function saveHiddenColumns() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hiddenIndexes));
  }

  function applyColumnVisibility() {
    const table = document.querySelector("#items-tbody")?.closest("table");
    if (!table) return;

    const theadRow = table.querySelector("thead tr");
    if (theadRow) {
      const ths = theadRow.querySelectorAll("th");
      ths.forEach((th, idx) => {
        th.style.display = hiddenIndexes.includes(idx) ? "none" : "";
      });
    }

    const tbodyRows = document.querySelectorAll("#items-tbody tr");
    tbodyRows.forEach(row => {
      const cells = row.querySelectorAll("td");
      cells.forEach((cell, idx) => {
        cell.style.display = hiddenIndexes.includes(idx) ? "none" : "";
      });
    });

    const tfootRow = table.querySelector("tfoot tr");
    if (tfootRow) {
      const footCells = tfootRow.querySelectorAll("td");
      footCells.forEach((cell, idx) => {
        cell.style.display = hiddenIndexes.includes(idx) ? "none" : "";
      });
    }
  }

  function showColumnsModal() {
    // إزالة أي مودال مفتوح
    const existing = document.querySelector(".invoice-columns-overlay");
    if (existing) { existing.remove(); return; }

    // الخلفية المعتمة
    const overlay = document.createElement("div");
    overlay.className = "invoice-columns-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // نافذة المحتوى
    const modal = document.createElement("div");
    modal.style.cssText = `
      background: white;
      border-radius: 16px;
      width: 90%;
      max-width: 450px;
      max-height: 85%;
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      direction: rtl;
    `;

    // الرأس
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 15px 20px;
      background: #1f4f3a;
      color: white;
      font-size: 18px;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 16px 16px 0 0;
    `;
    header.innerHTML = `<span>📋 تخصيص الأعمدة</span><button id="closeColumnsModalBtn" style="background:none; border:none; color:white; font-size:28px; cursor:pointer; line-height:1;">&times;</button>`;

    // منطقة القائمة (قابلة للتمرير)
    const listContainer = document.createElement("div");
    listContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    `;

    // إضافة خيارات الأعمدة
    columnNames.forEach((name, idx) => {
      const isHidden = hiddenIndexes.includes(idx);
      const label = document.createElement("label");
      label.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        cursor: pointer;
        font-size: 16px;
        border-bottom: 1px solid #eee;
      `;
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !isHidden; // المربع علامة إذا كان العمود ظاهرًا
      chk.style.width = "20px";
      chk.style.height = "20px";
      const span = document.createElement("span");
      span.textContent = name;
      label.appendChild(chk);
      label.appendChild(span);
      
      chk.addEventListener("change", () => {
        if (chk.checked) {
          hiddenIndexes = hiddenIndexes.filter(i => i !== idx);
        } else {
          if (!hiddenIndexes.includes(idx)) hiddenIndexes.push(idx);
        }
        saveHiddenColumns();
        applyColumnVisibility();
      });
      
      listContainer.appendChild(label);
    });

    // أزرار الإجراءات
    const actions = document.createElement("div");
    actions.style.cssText = `
      padding: 12px 16px;
      border-top: 1px solid #ddd;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;
    
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "إغلاق";
    closeBtn.style.cssText = `
      padding: 8px 18px;
      background: #6c757d;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    `;
    
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "إظهار الكل";
    resetBtn.style.cssText = `
      padding: 8px 18px;
      background: #198754;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    `;
    
    actions.appendChild(resetBtn);
    actions.appendChild(closeBtn);

    modal.appendChild(header);
    modal.appendChild(listContainer);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // دوال الإغلاق
    const closeModal = () => overlay.remove();
    header.querySelector("#closeColumnsModalBtn").addEventListener("click", closeModal);
    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    // إظهار الكل
    resetBtn.addEventListener("click", () => {
      hiddenIndexes = [];
      saveHiddenColumns();
      applyColumnVisibility();
      const checkboxes = listContainer.querySelectorAll("input[type='checkbox']");
      checkboxes.forEach(cb => cb.checked = true);
    });
  }

  function ensureButtonExists() {
    if (!document.getElementById('toggleInvoiceColumnsBtn')) {
      const actionsDiv = document.querySelector('.actions');
      if (actionsDiv) {
        const btn = document.createElement('button');
        btn.id = 'toggleInvoiceColumnsBtn';
        btn.textContent = '📋 تخصيص الأعمدة';
        btn.className = 'btn btn-secondary';
        btn.style.cssText = 'background-color:#6c757d; color:white; margin:5px;';
        actionsDiv.appendChild(btn);
        console.log('✅ تم إضافة الزر تلقائيًا');
      }
    }
  }

  function init() {
    loadHiddenColumns();
    applyColumnVisibility();
    ensureButtonExists();

    const toggleBtn = document.getElementById('toggleInvoiceColumnsBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showColumnsModal();
      });
    }

    // تحديث عند إضافة صفوف جديدة
    const observer = new MutationObserver(() => applyColumnVisibility());
    const tbody = document.getElementById("items-tbody");
    if (tbody) observer.observe(tbody, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();