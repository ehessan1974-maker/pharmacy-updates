// columns-manager.js – إدارة ديناميكية لإخفاء/إظهار الأعمدة مع دعم tfoot
(function() {
  'use strict';

  const STORAGE_PREFIX = 'hiddenColumns_';

  function getStorageKey(modalId) {
    return STORAGE_PREFIX + modalId;
  }

  function saveHiddenColumns(modalId, hiddenIndexes) {
    localStorage.setItem(getStorageKey(modalId), JSON.stringify(hiddenIndexes));
  }

function loadHiddenColumns(modalId) {
  const saved = localStorage.getItem(getStorageKey(modalId));
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch(e) { console.warn(e); }
  }
  // 🆕 القيم الافتراضية للمستخدم الجديد
  if (modalId === 'floatingModal') {
    return [15]; // افترض أن فهرس tarkim هو 15 (بدءاً من 0)
  }
  return [];
}
  // تطبيق الإخفاء/الإظهار على جميع الصفوف (بما فيها thead, tbody, tfoot)
  function applyColumnVisibility(table, hiddenIndexes) {
    if (!table) return;
    // اجمع كل الصفوف (بدون استثناء)
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      // نتعامل مع الخلايا (th أو td)
      const cells = row.children; // HTMLCollection
      // نمر على جميع الخلايا
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (hiddenIndexes.includes(i)) {
          cell.style.display = 'none';
        } else {
          cell.style.display = ''; // إظهار (استعادة القيمة الافتراضية)
        }
      }
    });
  }

  // جمع أسماء الأعمدة من thead (للقائمة)
  function getColumnNames(table) {
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return [];
    const headers = headerRow.querySelectorAll('th');
    return Array.from(headers).map(th => th.innerText.trim());
  }

  // إنشاء قائمة اختيار الأعمدة (نفس السابق)
  function createColumnPicker(modal, table, modalId) {
    const existingPicker = modal.querySelector('.column-picker-dropdown');
    if (existingPicker) existingPicker.remove();

    const columnNames = getColumnNames(table);
    if (columnNames.length === 0) return;

    let hiddenIndexes = loadHiddenColumns(modalId);
    const picker = document.createElement('div');
    picker.className = 'column-picker-dropdown';
    picker.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      max-height: 300px;
      overflow-y: auto;
      z-index: 10002;
      min-width: 200px;
      padding: 8px 0;
    `;

    columnNames.forEach((name, idx) => {
      const isHidden = hiddenIndexes.includes(idx);
      const label = document.createElement('label');
      label.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 13px;
        color: #333;
      `;
      label.innerHTML = `
        <input type="checkbox" value="${idx}" ${isHidden ? '' : 'checked'}>
        <span>${name}</span>
      `;
      const checkbox = label.querySelector('input');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        let currentHidden = loadHiddenColumns(modalId);
        if (checkbox.checked) {
          // إظهار العمود: إزالة idx
          currentHidden = currentHidden.filter(i => i !== idx);
        } else {
          // إخفاء العمود: إضافة idx
          if (!currentHidden.includes(idx)) currentHidden.push(idx);
        }
        saveHiddenColumns(modalId, currentHidden);
        applyColumnVisibility(table, currentHidden);
      });
      picker.appendChild(label);
    });

    // إغلاق القائمة عند النقر خارجها
    const closePicker = (e) => {
      if (!picker.contains(e.target) && !e.target.closest('.toggle-columns-btn')) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 0);

    return picker;
  }

  // إضافة زر "تخصيص الأعمدة" إلى شريط العنوان
  function addColumnsToggleButton(modal, table, modalId) {
    // نبحث عن أول عنصر window-controls داخل رأس المودال (قد يختلف بين المودالات)
    let header = modal.querySelector('.window-controls:first-of-type');
    if (!header) {
      // محاولة بديلة لـ materialsModal
      header = modal.querySelector('#materialsHeader .window-controls:first-of-type');
    }
    if (!header) return;

    if (header.querySelector('.toggle-columns-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'toggle-columns-btn';
    btn.innerHTML = '☷';
    btn.title = 'تخصيص الأعمدة';
    btn.style.cssText = 'margin-left: 6px; background: transparent; border: none; font-size: 16px; cursor: pointer;';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = modal.querySelector('.column-picker-dropdown');
      if (existing) {
        existing.remove();
        return;
      }
      const picker = createColumnPicker(modal, table, modalId);
      if (picker) {
        // نضع القائمة داخل رأس المودال (لضمان الموضع النسبي الصحيح)
        const headerContainer = modal.querySelector('#materialsHeader, #floatingModalHeader');
        if (headerContainer) {
          headerContainer.style.position = 'relative';
          headerContainer.appendChild(picker);
        } else {
          modal.style.position = 'relative';
          modal.appendChild(picker);
        }
        // ضبط الموضع تحت الزر
        const rect = btn.getBoundingClientRect();
        const modalRect = modal.getBoundingClientRect();
        picker.style.top = `${rect.bottom - modalRect.top}px`;
        picker.style.right = '0';
      }
    });
    header.insertBefore(btn, header.firstChild);
  }
// ==============================================

window.applyColumnsVisibilityToModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const table = modal.querySelector('table');
  if (!table) return;

  // دالة مساعدة لتحميل الإعدادات المخزنة لهذا المودال
  const storageKey = 'hiddenColumns_' + modalId;
  let hiddenIndexes = [];
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try { hiddenIndexes = JSON.parse(saved); } catch(e) {}
  }

  // تطبيق الإخفاء على كل الصفوف (thead, tbody, tfoot)
  const rows = table.querySelectorAll('tr');
  rows.forEach(row => {
    const cells = row.children;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (hiddenIndexes.includes(i)) {
        cell.style.display = 'none';
      } else {
        cell.style.display = ''; // إعادة الإظهار (إزالة display:none)
      }
    }
  });
};
// ==============================================
  // تهيئة لكل مودال
  function initModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const table = modal.querySelector('table');
    if (!table) return;
    const hidden = loadHiddenColumns(modalId);
    applyColumnVisibility(table, hidden);
    addColumnsToggleButton(modal, table, modalId);
  }

  // الواجهة العامة
  function init() {
    initModal('floatingModal');
    initModal('materialsModal');
  }

  function refresh(modalId) {
    initModal(modalId); // يعيد التطبيق وإضافة الزر إذا لزم
  }

  window.ColumnsManager = {
    init: init,
    refresh: refresh
  };

// ====================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();