// modal-persistence.js - نسخة مستقرة ومحصنة
(function() {
  "use strict";

  window.saveSearchTerm = function(modalId, term) {
    let safeTerm = '';
    if (typeof term === 'string') {
      safeTerm = term;
    } else if (term && term.target && typeof term.target.value === 'string') {
      safeTerm = term.target.value;
      console.warn('saveSearchTerm corrected event to:', safeTerm);
    } else {
      console.warn('saveSearchTerm ignored non-string value:', term);
      return;
    }
    localStorage.setItem(`searchTerm_${modalId}`, safeTerm);
  };

  window.getSearchTerm = function(modalId) {
    const val = localStorage.getItem(`searchTerm_${modalId}`);
    if (!val || val === '[object PointerEvent]' || val === '[object Event]' || typeof val !== 'string') {
      return "";
    }
    return val;
  };

  window.clearSearchTerm = function(modalId) {
    localStorage.removeItem(`searchTerm_${modalId}`);
  };
// ==============================================================
// modal-persistence.js (عدل دالة bindSearchPersistence)
window.bindSearchPersistence = function(searchComponent, modalId, onSearchCallback) {
    if (!searchComponent) return;

    // استعادة القيمة المحفوظة فقط لوضعها في الحقل (بدون بحث)
    const savedTerm = window.getSearchTerm(modalId);
    if (typeof searchComponent.setValue === 'function') {
        searchComponent.setValue(savedTerm, false);
    }

    // لا نستدعي onSearchCallback هنا أبداً (نترك ذلك لـ modal.open)

const saveHandler = function() {

    let val = searchComponent.getValue();

    if (typeof val !== 'string') {
        val = '';
    }

    val = val.trim();

    if (val === '') {

        localStorage.removeItem(
            `searchTerm_${modalId}`
        );

    } else {

        localStorage.setItem(
            `searchTerm_${modalId}`,
            val
        );
    }
};

    const inputElement = searchComponent.searchInput;
    if (inputElement) {
        inputElement.removeEventListener('input', saveHandler);
        inputElement.removeEventListener('change', saveHandler);
        inputElement.addEventListener('input', saveHandler);
        inputElement.addEventListener('change', saveHandler);
    }
};
// =================================================================
})();