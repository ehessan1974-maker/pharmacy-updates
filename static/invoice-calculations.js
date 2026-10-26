// دالة لحساب الحسم بناءً على قيمة "المقبوض"


/////////////////////////////////////////////////////////////
import { calculateItemTotals } from "./invoice.math.js";

export function calculateReceivedDiscount(item) {
  const q  = Number(item.quantity) || 0;
  const sp = Number(item.sellPrice) || 0;
  const c  = Number(item.cost) || 0;

  const totalBeforeDiscount = q * sp;
  const totalCost = q * c;

  const receivedRaw = item.receivedAmount;
  const discountRaw = item.discountPercent;

  let discountPercent = Number(discountRaw) || 0;
  let discountValue = 0;
  let totalAfterDiscount = totalBeforeDiscount;
  let receivedAmount = "";

  // 👑 أولوية للمقبوض
  if (receivedRaw !== "" && receivedRaw != null) {
    const received = Number(receivedRaw) || 0;
    receivedAmount = received;
    discountValue = totalBeforeDiscount - received;

    if (totalBeforeDiscount > 0) {
      discountPercent = (discountValue / totalBeforeDiscount) * 100;
    }

    totalAfterDiscount = received;
  }

  // ✍️ حسم %
  else if (discountPercent > 0) {
    discountValue = totalBeforeDiscount * discountPercent / 100;
    totalAfterDiscount = totalBeforeDiscount - discountValue;

    receivedAmount = totalAfterDiscount; // ⭐ هنا السحر
  }

  const totalProfit = totalAfterDiscount - totalCost;
  const profitPercentReal =
    totalAfterDiscount > 0
      ? (100 * totalProfit) / totalAfterDiscount
      : 0;

  return {
    discountValue,
    discountPercent,
    totalBeforeDiscount,
    totalAfterDiscount,
    totalCost,
    totalProfit,
    profitPercentReal,
    receivedAmount
  };
}


// دالة لتصفير الحسم إذا كانت خانة "المقبوض" فارغة
export function resetDiscountIfNoReceived(item, row) {
  if (item.receivedAmount !== null && item.receivedAmount !== "") return;

  item.discountPercent = 0;
  item.discountValue = 0;

  if (row) {
    const discountInput = row.querySelector('input[data-field="discountPercent"]');
    if (discountInput) discountInput.value = 0;

    const discountValueInput = row.querySelector('input[data-field="discountValue"]');
    if (discountValueInput) discountValueInput.value = 0;
  }
}
/////////////////////////////////////
// دالة لتحديث الحقول المرتبطة عند تعديل خانة "المقبوض"
export function updateReceivedAmount(item, row) {
if (item.receivedAmount === "" || item.receivedAmount == null) {
    resetDiscountIfNoReceived(item, row);
    return;
  }
  const calculations = calculateReceivedDiscount(item);

  item.discountValue = calculations.discountValue;
  item.totalAfterDiscount = calculations.totalAfterDiscount;

  // تحديث باقي الحقول بناءً على الحسابات
  item.discountPercent = calculations.discountPercent;
  item.totalBeforeDiscount = calculations.totalBeforeDiscount;
  item.totalCost = calculations.totalCost;
  item.totalProfit = calculations.totalProfit;
  item.profitPercentReal = calculations.profitPercentReal;


//  resetDiscountIfNoReceived(item, row);
//  return calculations;
}
/////////////////////////////////////
export function calculateProfitPercentage(item) {
  const totalBeforeDiscount = item.totalBeforeDiscount || 0;
  const profitReceiptTo = item.إيصال_نسبة_الربح_إلى || 0;

  // حساب نسبة الربح بناءً على إيصال نسبة الربح إلى
  const profitPercent = (profitReceiptTo / totalBeforeDiscount) * 100;
  
  const profitValue = totalBeforeDiscount * (profitPercent / 100);
  const receivedAmount = totalBeforeDiscount - profitValue;

  return {
    profitPercent, // نسبة الربح
    profitValue, // قيمة الربح
    receivedAmount // قيمة المقبوض
  };
}
/////////////////////////////////////////
export function handleItemFieldChange(item, field) {

  // 👑 أولاً نحسب دائماً من المحرك الموحد
  Object.assign(item, calculateItemTotals(item));

  switch (field) {

    case "receivedAmount":
      // إذا كان المقبوض فارغ → نصفر الحسم
      if (item.receivedAmount === "" || item.receivedAmount == null) {
        item.discountPercent = 0;
        item.discountValue = 0;
      }
      break;

    case "إيصال_نسبة_الربح_إلى":
      // نحسب المقبوض بناءً على نسبة الربح المطلوبة
      if (
        item.totalBeforeDiscount > 0 &&
        item["إيصال_نسبة_الربح_إلى"] !== "" &&
        !isNaN(item["إيصال_نسبة_الربح_إلى"])
      ) {
        const target = Number(item["إيصال_نسبة_الربح_إلى"]);

        if (target < 100) {
          const totalCost = item.totalCost;

          const received =
            (totalCost * 100) / (100 - target);

          item.receivedAmount = received;
        }
      }

      // إعادة الحساب بعد تعديل المقبوض
      Object.assign(item, calculateItemTotals(item));
      break;

    case "discountPercent":
    case "quantity":
      // فقط نعيد الحساب
      Object.assign(item, calculateItemTotals(item));
      break;
  }
}


// دالة لتحديث الخانات المرتبطة بعد تعديل المبلغ المقبوض
function updateRowWithUpdatedFields(item) {
  const row = document.querySelector(`tr[data-item-id="${item.id}"]`); // تأكد من الحصول على الصف الصحيح
  if (!row) return;

  row.querySelector('input[data-field="totalBeforeDiscount"]').value = item.totalBeforeDiscount;
  row.querySelector('input[data-field="discountValue"]').value = item.discountValue;
  row.querySelector('input[data-field="totalAfterDiscount"]').value = item.totalAfterDiscount;
  row.querySelector('input[data-field="profitPercentReal"]').value = item.profitPercentReal;
  row.querySelector('input[data-field="totalProfit"]').value = item.totalProfit;
  row.querySelector('input[data-field="totalCost"]').value = item.totalCost;


}

/////////////////////////////////////////
function applyProfitReceipt(item) {
  const q = Number(item.quantity) || 0;
  const sell = Number(item.sellPrice) || 0;
  const cost = Number(item.cost) || 0;
  if (!q || !sell) return;
  const totalBeforeDiscount = q * sell;

//  if (!totalBeforeDiscount) return;

  const profitPercentTarget = Number(item["إيصال_نسبة_الربح_إلى"]);
//  if (!profitPercentTarget) return;  // إذا كانت القيمة غير موجودة أو 0
// نسمح بالقيمة 0
  if (isNaN(profitPercentTarget)) return;
  // حماية من القسمة على صفر أو 100
  if (profitPercentTarget >= 100) return;

  const totalCost = q * cost;

  // إذا كانت النسبة صفرًا، نعتبر أن الربح صفر والمقبوض مساوٍ للسعر
  

  const discountValue = (q * sell) -  (totalCost *  100 / (100 - profitPercentTarget));
  const discountPercent = (discountValue / totalBeforeDiscount) * 100;
//  const discountValue = q * sell *  discountPercent / 100;
  const totalAfterDiscount = totalBeforeDiscount - discountValue;
  const totalProfit = totalAfterDiscount - totalCost;
  const receivedAmount = totalAfterDiscount;
  const profitPercentReal = totalAfterDiscount > 0 ? (totalProfit / totalAfterDiscount) * 100 : 0;

  // تحديث القيم في العنصر
  item.totalBeforeDiscount = totalBeforeDiscount;
  item.totalCost = totalCost;
  item.discountValue = discountValue;
  item.discountPercent = discountPercent;
//  item.totalAfterDiscount = totalAfterDiscount;
  item.totalProfit = totalProfit;
  item.receivedAmount = receivedAmount;
  item.profitPercentReal = profitPercentReal;
  item.totalAfterDiscount = receivedAmount;
}
function syncProfitReceiptWithRealProfit(item, field) {
  // 👑 احترم الحقل الذي يعدّله المستخدم
  if (field === "إيصال_نسبة_الربح_إلى") return;

  const profitPercent = Number(item.profitPercentReal);

  // حماية من القيم غير الصالحة
  if (!isFinite(profitPercent)) return;

  // لا تكتب إذا لم يكن هناك أساس حساب
  if (!item.totalBeforeDiscount || item.totalBeforeDiscount <= 0) return;

  item["إيصال_نسبة_الربح_إلى"] = profitPercent;
}

function format2(value) {
    if (value === null || value === undefined || value === '') return '';
    return Number(value).toFixed(2);
}
