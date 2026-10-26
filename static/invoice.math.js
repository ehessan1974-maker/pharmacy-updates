export function calculateItemTotals(item, activeField = null) {

  if (!item) return {};

  const quantity  = Number(item.quantity) || 0;
  const sellPrice = Number(item.sellPrice) || 0;
  const cost      = Number(item.cost) || 0;

  const totalBeforeDiscount = quantity * sellPrice;
  const totalCost           = quantity * cost;

  let discountPercent = Number(item.discountPercent) || 0;
  let discountValue   = 0;
  let receivedAmount  = item.receivedAmount;
  let profitReceiptTo = item["إيصال_نسبة_الربح_إلى"];

  // ===============================
  // 👑 1) أولوية للمبلغ المقبوض
  // ===============================
// ===============================
// 👑 تحديد مصدر الحساب حسب الحقل المعدل
// ===============================

if (activeField === "receivedAmount") {

  receivedAmount = Number(item.receivedAmount) || 0;
  discountValue  = totalBeforeDiscount - receivedAmount;

  if (totalBeforeDiscount > 0) {
    discountPercent =
      (discountValue / totalBeforeDiscount) * 100;
  }

}

else if (activeField === "إيصال_نسبة_الربح_إلى") {

  const target = Number(item["إيصال_نسبة_الربح_إلى"]) || 0;

  if (target < 100 && totalCost > 0) {

    receivedAmount =
      (totalCost * 100) / (100 - target);

    discountValue =
      totalBeforeDiscount - receivedAmount;

    if (totalBeforeDiscount > 0) {
      discountPercent =
        (discountValue / totalBeforeDiscount) * 100;
    }
  }

}

else if (activeField === "discountPercent") {

  discountPercent = Number(item.discountPercent) || 0;

  discountValue =
    (totalBeforeDiscount * discountPercent) / 100;

  receivedAmount =
    totalBeforeDiscount - discountValue;

}

else {
  // 👑 أي تعديل آخر (كمية – سعر – تكلفة...)
  // نتجاهل القيم اليدوية القديمة

  discountValue  = 0;
  discountPercent = 0;
  receivedAmount = totalBeforeDiscount;
}


  // ===============================
  // الإجمالي بعد الحسم
  // ===============================
  const totalAfterDiscount =
    totalBeforeDiscount - discountValue;

  const totalProfit =
    totalAfterDiscount - totalCost;

  const profitPercentReal =
    totalAfterDiscount > 0
      ? (totalProfit * 100) / totalAfterDiscount
      : 0;

  // إعادة حساب إيصال نسبة الربح دائماً
  let newProfitReceiptTo = 0;

  if (totalAfterDiscount > 0) {
    newProfitReceiptTo =
      100 - (totalCost * 100) / totalAfterDiscount;
  }

  return {
    totalBeforeDiscount,
    discountValue,
    discountPercent,
    receivedAmount,
    totalAfterDiscount,
    totalCost,
    totalProfit,
    profitPercentReal,
    إيصال_نسبة_الربح_إلى: newProfitReceiptTo
  };
}

