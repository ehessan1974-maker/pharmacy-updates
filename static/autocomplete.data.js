window.MEDICINES = [];             // للبحث الجزئي
window.MEDICINES_MAP = {};         // للوصول السريع

function loadMedicinesFromServer() {
  fetch("/medicines")
    .then(res => res.json())
    .then(data => {
      if (!Array.isArray(data)) {
        console.error("الاستجابة ليست مصفوفة");
        return;
      }

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
      window.MEDICINES.forEach(m => {
        window.MEDICINES_MAP[m.name] = m;
      });

      console.log(`✔ تم تحميل ${window.MEDICINES.length} دواء`);
    })
    .catch(err => {
      console.error("فشل تحميل الأدوية", err);
    });
}

loadMedicinesFromServer();