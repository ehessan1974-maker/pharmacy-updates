let AC_INDEX = -1;

export function setIndex(i) {
  AC_INDEX = i;
}

export function getIndex() {
  return AC_INDEX;
}

export function resetIndex() {
  AC_INDEX = -1;
}

///////////////////////////////////////////////////////
// ربط اختيار الصفوف بالماوس
export function bindRowSelection(list, onChange) {
  const rows = list.querySelectorAll(".ac-row:not(.ac-header)");

  rows.forEach(row => {
    row.addEventListener("mouseenter", () => {
      const index = Number(row.dataset.index);
      setIndex(index);
      onChange?.(index);
    });

    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const index = Number(row.dataset.index);
      setIndex(index);

      // فقط نرسل الحدث المخصص – لا ننفذ الاختيار هنا
      row.dispatchEvent(new CustomEvent("ac-select", {
        bubbles: true,
        cancelable: true,
        detail: { index }
      }));
    });
  });
}
///////////////////////////////////////////////////////
// اختيار باستخدام Enter
export function handleEnter(input, matches, onSelect) {

  if (!matches?.length) return false;

  let idx = getIndex();

  if (idx < 0) {
    if (matches.length === 1) {
      idx = 0;
    } else {
      return false;
    }
  }

  onSelect(input, matches[idx]);

  resetIndex();

  return true;
}
/////////////////////////////////////////////////////
const modal = document.getElementById("floatingModal");
const openBtn = document.getElementById("openModalBtn");
const closeBtn = modal?.querySelector(".close-btn"); // ? لتجنب الخطأ

if (openBtn) {
  openBtn.onclick = () => {
    if (modal) modal.style.display = "block";
  };
}

if (closeBtn) {
  closeBtn.onclick = () => {
    if (modal) modal.style.display = "none";
  };
}

/* // إغلاق عند النقر خارج المحتوى
window.onclick = (e) => {
  if (modal && e.target === modal) {
    modal.style.display = "none";
  }
};
*/