// highlight-utils.js
(function() {
  "use strict";

  window.highlightText = function(text, term) {
    if (!term) return text;
    if (text === null || text === undefined) return '';
    const str = String(text);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, "gi");
    return str.replace(regex, `<span class="highlight">$1</span>`);
  };
})();