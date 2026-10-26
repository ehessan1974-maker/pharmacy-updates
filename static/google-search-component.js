/**
 * مكون بحث بنمط Google مع قائمة سجل البحث
 * - يتم البحث فقط عند: Enter، زر البحث، اختيار من التاريخ، زر مسح (يبحث فارغ)
 * - لا يوجد بحث أثناء الكتابة (تم إلغاء debounce)
 */
class GoogleSearchComponent {
  constructor(options) {
    this.container = options.container;
    this.storageKey = options.storageKey;
    this.onSearch = options.onSearch;
    this.placeholder = options.placeholder || 'بحث...';
    this.historyLimit = options.historyLimit || 15;
    this.rightAlignButtons = options.rightAlignButtons !== false;

    this.searchInput = null;
    this.searchBtn = null;
    this.clearBtn = null;
    this.dropdown = null;

    this.init();
  }

  init() {
    this.render();
    this.loadHistory();
    this.attachEvents();
  }

  render() {
    this.container.classList.add('google-search-wrapper');
    this.container.innerHTML = `
      <input type="text" class="google-search-input" placeholder="${this.placeholder}">
      <button type="button" class="google-search-btn">🔍</button>
      <button type="button" class="google-clear-btn">✖</button>
      <div class="google-search-dropdown"></div>
    `;

    this.searchInput = this.container.querySelector('.google-search-input');
    this.searchBtn = this.container.querySelector('.google-search-btn');
    this.clearBtn = this.container.querySelector('.google-clear-btn');
    this.dropdown = this.container.querySelector('.google-search-dropdown');

    this.applyDefaultStyles();
  }

  applyDefaultStyles() {
    if (!document.querySelector('#google-search-styles')) {
      const style = document.createElement('style');
      style.id = 'google-search-styles';
      style.textContent = `
        .google-search-wrapper {
          position: relative;
          width: 100%;
        }
        .google-search-input {
          width: 100%;
          padding: 10px 20px 10px 80px;
          border-radius: 28px;
          border: 1px solid #dfe1e5;
          font-size: 15px;
          outline: none;
          transition: all 0.2s;
        }
        .google-search-input:focus {
          border-color: #4285f4;
          box-shadow: 0 1px 6px rgba(66,133,244,0.3);
        }
        .google-search-btn, .google-clear-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 18px;
          color: #5f6368;
          padding: 0;
          margin: 0;
        }
        .google-search-btn { left: 12px; }
        .google-clear-btn { left: 48px; display: none; }
        .google-search-btn:hover, .google-clear-btn:hover { color: #1a73e8; }
        .google-search-dropdown {
          position: absolute;
          top: calc(100% + 5px);
          left: 0;
          right: 0;
          background: #fff;
          border-radius: 24px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          border: 1px solid #e5e5e5;
          z-index: 10000;
          max-height: 380px;
          overflow-y: auto;
          display: none;
          padding: 8px 0;
        }
        .google-search-dropdown.show {
          display: block;
        }
        .search-history-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 18px;
          cursor: pointer;
          font-size: 14px;
          color: #202124;
        }
        .search-history-item:hover {
          background: #f1f3f4;
        }
        .search-history-icon {
          font-size: 18px;
          color: #9aa0a6;
        }
        .search-history-text {
          flex: 1;
        }
        .search-history-clear {
          font-size: 18px;
          color: #9aa0a6;
          visibility: hidden;
        }
        .search-history-item:hover .search-history-clear {
          visibility: visible;
        }
        .search-history-clear:hover {
          color: #ea4335;
        }
      `;
      document.head.appendChild(style);
    }
  }

  loadHistory() {
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      try {
        this.history = JSON.parse(stored);
        if (!Array.isArray(this.history)) {
          console.warn(`localStorage key "${this.storageKey}" is not an array, resetting.`);
          this.history = [];
          this.saveHistory();
        }
      } catch(e) {
        console.warn(`Invalid JSON in localStorage key "${this.storageKey}":`, e.message);
        if (typeof stored === 'string' && stored.trim() !== '') {
          this.history = [stored];
        } else {
          this.history = [];
        }
        this.saveHistory();
      }
    } else {
      this.history = [];
    }
  }

  saveHistory() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.history.slice(0, this.historyLimit)));
  }

  addToHistory(term) {
    if (!term?.trim()) return;
    const cleaned = term.trim();
    this.history = this.history.filter(item => item !== cleaned);
    this.history.unshift(cleaned);
    if (this.history.length > this.historyLimit) this.history.pop();
    this.saveHistory();
  }

  removeFromHistory(term) {
    this.history = this.history.filter(t => t !== term);
    this.saveHistory();
    if (this.searchInput.value.trim() !== '') this.showDropdown();
  }

  showDropdown() {
    if (!this.dropdown) return;
    const term = this.searchInput.value.trim();
    if (term === '' || this.history.length === 0) {
      this.hideDropdown();
      return;
    }

    this.dropdown.innerHTML = '';
    this.history.forEach(termItem => {
      const item = document.createElement('div');
      item.className = 'search-history-item';
      item.innerHTML = `
        <span class="search-history-icon">🔍</span>
        <span class="search-history-text">${this.escapeHtml(termItem)}</span>
        <span class="search-history-clear" data-term="${this.escapeHtml(termItem)}">✖</span>
      `;
      item.querySelector('.search-history-text').addEventListener('click', (e) => {
        e.stopPropagation();
        this.searchInput.value = termItem;
        this.toggleClearButton();
        this.addToHistory(termItem);
        this.onSearch(termItem);
        this.hideDropdown();
      });
      item.querySelector('.search-history-clear').addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFromHistory(termItem);
      });
      this.dropdown.appendChild(item);
    });
    this.dropdown.classList.add('show');
  }

  hideDropdown() {
    if (this.dropdown) this.dropdown.classList.remove('show');
  }

  toggleClearButton() {
    if (this.clearBtn) {
      this.clearBtn.style.display = this.searchInput.value.trim() !== '' ? 'block' : 'none';
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  attachEvents() {
    // ✅ 1. حدث الكتابة: فقط حفظ القيمة في localStorage وعرض/إخفاء القائمة (بدون بحث)
    this.searchInput.addEventListener('input', () => {
      const currentValue = this.searchInput.value;
      localStorage.setItem(this.storageKey, currentValue);
      this.toggleClearButton();
      if (currentValue.trim() === '') {
        this.hideDropdown();
      } else {
        this.showDropdown();
      }
    });

    // ✅ 2. زر البحث: تنفيذ البحث
    this.searchBtn.addEventListener('click', () => {
      const term = this.searchInput.value.trim();
      if (term) this.addToHistory(term);
      this.onSearch(term);
      this.hideDropdown();
    });

    // ✅ 3. زر المسح: تفريغ الحقل، حفظ القيمة الفارغة، تنفيذ بحث فارغ
    this.clearBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      localStorage.setItem(this.storageKey, '');
      this.toggleClearButton();
      this.onSearch('');
      this.hideDropdown();
      this.searchInput.focus();
    });

    // ✅ 4. الضغط على Enter: تنفيذ البحث
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const term = this.searchInput.value.trim();
        if (term) this.addToHistory(term);
        this.onSearch(term);
        this.hideDropdown();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideDropdown();
      }
    });

    // ✅ 5. عند التركيز: إظهار القائمة إذا كان الحقل غير فارغ
    this.searchInput.addEventListener('focus', () => {
      if (this.searchInput.value.trim() !== '') {
        this.showDropdown();
      }
    });

    // ✅ 6. إغلاق القائمة عند النقر خارج الحاوية
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.hideDropdown();
      }
    });

    // منع فقدان التركيز عند النقر داخل القائمة
    this.dropdown.addEventListener('mousedown', (e) => e.preventDefault());

    this.toggleClearButton();
  }

  getValue() {
    return this.searchInput.value.trim();
  }

  setValue(value, triggerEvent = false) {
    let safeValue = '';
    if (typeof value === 'string') {
      safeValue = value;
    } else if (value && typeof value === 'object') {
      safeValue = value.target?.value || '';
      if (safeValue === '[object PointerEvent]') safeValue = '';
      console.warn('setValue received an object, extracted:', safeValue);
    }
    this.searchInput.value = safeValue;
    this.toggleClearButton();
    if (triggerEvent) {
      // نريد فقط تحديث القيمة في الحقل، لا ننفذ بحث تلقائي
      // لكن نعرض القائمة إذا كان النص غير فارغ
      if (safeValue.trim() !== '') {
        this.showDropdown();
      } else {
        this.hideDropdown();
      }
    }
  }

  focus() {
    this.searchInput.focus();
  }
}