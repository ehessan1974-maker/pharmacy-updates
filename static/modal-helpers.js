// modal-helpers.js - دوال مساعدة لإدارة النوافذ العائمة
(function() {
  "use strict";

  /**
   * إضافة حدث dblclick على رأس النافذة لتكبير/تصغير النافذة
   * مع تجاهل النقر على الحقول التفاعلية (input, select, button, ...)
   * @param {HTMLElement} header - عنصر رأس النافذة
   * @param {string} modalId - معرف النافذة (مثل "floatingModal")
   * @param {Function} maximizeFn - دالة التكبير/التصغير (مثل window.maximizeModal)
   */
  window.setupModalDoubleClick = function(header, modalId, maximizeFn) {
    if (!header) return;
    header.addEventListener("dblclick", function(e) {
      // منع التكبير إذا كان العنصر أو أحد أسلافه:
      // - زر (button)
      // - حقل إدخال (input, textarea, select)
      // - أي عنصر داخل منطقة البحث (google-search-wrapper أو sales-search-wrapper)
      // - أي عنصر داخل منطقة أزرار التحكم (window-controls)
      const target = e.target;
      const isInteractive = target.closest('button, input, textarea, select, .window-controls, .google-search-wrapper, .sales-search-wrapper');
      
      if (isInteractive) {
        return; // لا نفعل شيئًا
      }
      
      // تنفيذ التكبير/التصغير
      if (maximizeFn && typeof maximizeFn === 'function') {
        maximizeFn(modalId);
      }
    });
  };

})();