window.MEDICINES = [];             // للبحث الجزئي — صف لكل طبخة (ك صيدلية)
window.MEDICINES_MAP = {};         // للوصول السريع — آخر طبخة لكل اسم
window.MEDICINE_BATCHES = {};      // v110: المادة -> كل طبخاتها مرتبة (قائمة اختيار الطبخة)

/* v110: تطبيع استجابة /medicines إلى المخازن الثلاثة — تستعمله أيضًا
   reloadMedicinesOnly في invoice.core.js حتى لا تنهار الطبخات إلى صف واحد */
window.buildMedicineStores = function (data) {
  if (!Array.isArray(data)) return;
  window.MEDICINES = data.map(m => ({
    ...m,
    pharmacyQty: m.stock,
    batchNo: m.batch_no || m.batchNo,
    mfgDate: m.mfg_date,
    expDate: m.exp_date,
    purchasesQty: m.qty_buy,
    salesQty: m.qty_sell,
    basePrice: m.base_price
  }));

  window.MEDICINES_MAP = {};
  window.MEDICINE_BATCHES = {};
  window.MEDICINES.forEach(m => {
    window.MEDICINES_MAP[m.name] = m;
    if (!window.MEDICINE_BATCHES[m.name]) window.MEDICINE_BATCHES[m.name] = [];
    window.MEDICINE_BATCHES[m.name].push(m);
  });
  /* الأوفر رصيدًا أولًا داخل قائمة الطبخات — الأنسب للتقسيم والاختيار */
  Object.values(window.MEDICINE_BATCHES).forEach(list =>
    list.sort((a, b) => (Number(b.pharmacyQty) || 0) - (Number(a.pharmacyQty) || 0))
  );
};

function loadMedicinesFromServer() {
  fetch("/medicines")
    .then(res => res.json())
    .then(data => {
      if (!Array.isArray(data)) {
        console.error("الاستجابة ليست مصفوفة");
        return;
      }
      window.buildMedicineStores(data);
      console.log(`✔ تم تحميل ${window.MEDICINES.length} دواء (${Object.keys(window.MEDICINE_BATCHES).length} مادة)`);
    })
    .catch(err => {
      console.error("فشل تحميل الأدوية", err);
    });
}

loadMedicinesFromServer();
