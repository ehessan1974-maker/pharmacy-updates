// sales.modal.search.js - نسخة مستقرة مع دعم حفظ الحالة الفارغة
(function() {
  "use strict";

  let salesSearchComponent = null;
  let isSearching = false;
  let searchOffset = 0;
  let searchLimit = 200;
  let hasMoreSearchData = true;
  let isLoadingMoreSearch = false;
  let currentSearchTerm = "";
  let searchGlobalTotals = null;

  const el = {};

  function initDOM() {
    el.tbody = document.querySelector("#floatingTable tbody");
    el.searchWrapper = document.querySelector(".sales-search-wrapper");
    if (!el.searchWrapper) {
      // إذا لم يكن موجوداً، ننشئه داخل الهيدر
      const header = document.getElementById("floatingModalHeader");
      if (header) {
        const existing = header.querySelector('.window-controls:last-child');
        const wrapper = document.createElement('div');
        wrapper.className = 'sales-search-wrapper';
        wrapper.style.cssText = 'flex: 1; margin: 0 15px; max-width: 420px; position: relative;';
        header.insertBefore(wrapper, existing);
        el.searchWrapper = wrapper;
        console.log("✅ تم إنشاء حاوية البحث في الهيدر");
      } else {
        console.error("❌ لم يتم العثور على #floatingModalHeader");
      }
    }
  }
// ===========================================================
async function performSalesSearch(term, reset = true) {

    const searchTerm =
        typeof term === 'string'
            ? term.trim()
            : '';

    currentSearchTerm = searchTerm;
    window.currentSalesSearchTerm = searchTerm;

    if (searchTerm === '') {

        localStorage.removeItem('searchTerm_floatingModal');

        if (typeof window.refreshCurrentFilter === 'function') {
            await window.refreshCurrentFilter(true);
        }

        return;
    }

    localStorage.setItem(
        'searchTerm_floatingModal',
        searchTerm
    );


    // 🔍 البحث العادي (غير فارغ)
    if (reset) {
        el.tbody.innerHTML = '<tr><td colspan="16">🔎 جاري البحث...<\/td><\/tr>';
        // إعادة تعيين الإجماليات المؤقتة
        const totalsRow = document.getElementById("totalsRow");
        if (totalsRow) {
            totalsRow.querySelector('[data-field="total_items"]').textContent = "0";
            totalsRow.querySelector('[data-field="total_qty"]').textContent = "0";
            totalsRow.querySelector('[data-field="total_cost"]').textContent = "0.00";
            totalsRow.querySelector('[data-field="total_profit"]').textContent = "0.00";
            totalsRow.querySelector('[data-field="total_after"]').textContent = "0.00";
        }
    }

    if (!term || term.trim() === "") {
      // إذا كان البحث فارغاً، نعود لوضع الفلترة العادي
      if (typeof window.refreshCurrentFilter === 'function') {
        window.refreshCurrentFilter(true);
      }
      return;
    }

    if (isLoadingMoreSearch) return;
    isLoadingMoreSearch = true;

    const query = encodeURIComponent(term.replace(/\*/g, "%"));
    const url = `/api/sales/search?q=${query}&offset=${searchOffset}&limit=${searchLimit}&_=${Date.now()}`;
    try {
        const response = await fetch(url);
        const result = await response.json();
        let data = result.data || [];
        const totals = result.totals || {};
        const hasMore = result.has_more === true;

        if (!Array.isArray(data)) data = [];

        if (reset) {
            searchGlobalTotals = totals;
            window.salesAllData = data;
            if (typeof window.renderRows === 'function') {
                window.renderRows(data, term, false);
            }
            if (typeof window.updateTotalsFromServer === 'function') {
                window.updateTotalsFromServer(totals);
            }
        } else {
            window.salesAllData.push(...data);
            if (typeof window.renderRows === 'function') {
                window.renderRows(data, term, true);
            }
        }

        hasMoreSearchData = hasMore;
        if (hasMore) searchOffset += searchLimit;

    } catch (err) {
        console.error("خطأ في البحث:", err);
        if (reset) {
            el.tbody.innerHTML = '<tr><td colspan="16">❌ خطأ في البحث<\/td><\/tr>';
        }
    } finally {
        isLoadingMoreSearch = false;
    }
}

// =============================================

  async function loadMoreSearchResults() {
    if (!currentSearchTerm || currentSearchTerm.trim() === "") return;
    if (!hasMoreSearchData) return;
    if (isLoadingMoreSearch) return;
    await performSalesSearch(currentSearchTerm, false);
  }

  function setupSearchInfiniteScroll() {
    const content = document.getElementById("floatingModalContent");
    if (!content) return;
    if (content._searchScrollHandler) {
      content.removeEventListener('scroll', content._searchScrollHandler);
    }
    const scrollHandler = async () => {
      const scrollTop = content.scrollTop;
      const clientHeight = content.clientHeight;
      const scrollHeight = content.scrollHeight;
      if (scrollTop + clientHeight >= scrollHeight - 300) {
        await loadMoreSearchResults();
      }
    };
    content.addEventListener('scroll', scrollHandler, { passive: true });
    content._searchScrollHandler = scrollHandler;
  }
// ========================================================
function initSearch() {
    initDOM();
    if (!el.searchWrapper) return;
    if (typeof GoogleSearchComponent === 'undefined') {
        setTimeout(initSearch, 500);
        return;
    }

    salesSearchComponent = new GoogleSearchComponent({
        container: el.searchWrapper,
        storageKey: 'salesSearchHistory',
        placeholder: 'بحث في المبيعات...',
        onSearch: function(term) {
            // فقط نمرر المصطلح إلى performSalesSearch
            performSalesSearch(term, true);
        },
        debounceMs: 400
    });

    window.salesSearchComponent = salesSearchComponent;

    if (window.bindSearchPersistence && salesSearchComponent) {
        window.bindSearchPersistence(salesSearchComponent, "floatingModal", (term) => {
            // نستخدم نفس المنطق
            performSalesSearch(term, true);
        });
    }

    setupSearchInfiniteScroll();
}

// ========================================================================
  window.performSalesSearch = performSalesSearch;
  window.loadMoreSearchResults = loadMoreSearchResults;
  window.getSalesSearchState = function() {
    return salesSearchComponent ? salesSearchComponent.getValue() : "";
  };

// ========================================================================

  function init() {
    initSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();