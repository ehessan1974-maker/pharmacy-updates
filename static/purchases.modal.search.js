// purchases.modal.search.js - نسخة مستقرة وآمنة
(function() {
  "use strict";

  let purchasesSearchComponent = null;

  function initDOM() {
    let wrapper = document.querySelector('.purchases-search-wrapper');
    if (!wrapper) {
      const header = document.getElementById("purchasesModalHeader");
      if (!header) return null;
      wrapper = document.createElement('div');
      wrapper.className = 'purchases-search-wrapper';
      wrapper.style.cssText = 'flex: 1; margin: 0 15px; max-width: 420px; position: relative;';
      const controls = header.querySelector('.window-controls:last-child');
      header.insertBefore(wrapper, controls);
    }
    return wrapper;
  }

  function performPurchasesSearch(term) {
    let safeTerm = (typeof term === 'string') ? term : '';
    window.currentPurchasesSearchTerm = safeTerm;
    if (!safeTerm) {
      if (typeof window.refreshPurchasesCurrentFilter === 'function') {
        window.refreshPurchasesCurrentFilter(true);
      }
      return;
    }
    const tbody = document.querySelector("#purchasesTable tbody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="20">🔎 جاري البحث...<\/td><\/tr>';
    const url = `/api/purchases/search?q=${encodeURIComponent(safeTerm)}&limit=1000&_=${Date.now()}`;
    fetch(url)
      .then(res => res.json())
      .then(result => {
        let data = result.data || [];
        if (!Array.isArray(data)) data = [];
        if (typeof window.renderPurchasesRows === 'function') {
          window.renderPurchasesRows(data, safeTerm, true);
        }
      })
      .catch(err => {
        console.error(err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="20">❌ خطأ في البحث<\/td><\/tr>';
      });
  }

  function initSearch() {
    const wrapper = initDOM();
    if (!wrapper) return;
    if (typeof GoogleSearchComponent === 'undefined') {
      setTimeout(initSearch, 500);
      return;
    }
    purchasesSearchComponent = new GoogleSearchComponent({
      container: wrapper,
      storageKey: 'purchasesSearchHistory',
      placeholder: 'بحث ...',
      onSearch: function(input) {
        let term = '';
        if (typeof input === 'string') {
          term = input;
        } else if (input && input.target && typeof input.target.value === 'string') {
          term = input.target.value;
        }
        performPurchasesSearch(term);
      },
      debounceMs: 400
    });
    if (window.bindSearchPersistence && purchasesSearchComponent) {
      window.bindSearchPersistence(purchasesSearchComponent, "purchasesModal", performPurchasesSearch);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
  } else {
    initSearch();
  }

  window.performPurchasesSearch = performPurchasesSearch;
})();