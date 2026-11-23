/* batch.qty.rules.js — منطق نقي للتحقق بين «الكمية المكتوبة» و«رصيد الطبخة المقترحة»
   (الحالات أ/ب/ج) — بلا DOM إطلاقاً حتى يُختبر في Node مباشرة.
   وُحّد ليُستعمل من fillInvoiceRow ومن قائمة اختيار الطبخة ومن النسخة المدمجة. */

/*resolveBatchChange
  ctx:
    enteredQty        الكمية المكتوبة حالياً في خانة الكمية (رقم أو '' أو null)
    batchStock        رصيد الطبخة المقترحة (ك صيدلية) — قد يكون سالباً
    committedOtherRows مجموع كميات نفس المادة+الطبخة في بقية أسطر الفاتورة (السيناريو 4)
    originalQty       كمية السطر كما حُمّلت من فاتورة قديمة (وضع التعديل فقط)
    editMode          هل نحن في وضع تعديل فاتورة محفوظة (isLoadingOldInvoice)
  يعيد:
    action: 'default'      الحالة أ — خانة فارغة/صفر → defaultQty
            'keep'         الحالة ب — الكمية المكتوبة تكفيها → quantity كما هي
            'over'         الحالة ج — الكمية أكبر من المتاح والمتاح > 0
            'over-zero'    الحالة ج — المتاح = 0 أو أقل بسبب أسطر أخرى
            'negative'     الحالة ج3 — رصيد الطبخة سالب (نفدت) → تأكيد صريح
    available              المتاح الفعلي للسطر الحالي بعد خصم الأسطر الأخرى
    defaultQty / quantity / message (عربية)
*/
export function resolveBatchChange(ctx) {
  const stock = Number(ctx && ctx.batchStock) || 0;
  const others = Number(ctx && ctx.committedOtherRows) || 0;
  const original = Number(ctx && ctx.originalQty) || 0;
  const editMode = !!(ctx && ctx.editMode);

  // ترخيص وضع تعديل الفاتورة القديمة: الكمية المحمّلة أصلاً لنفس السطر لا تحصيل ضد نفسها
  const allowance = (editMode && original > 0) ? original : 0;
  const available = stock - others + allowance;

  const raw = ctx && ctx.enteredQty;
  const q = (raw === '' || raw === null || raw === undefined) ? null : (Number(raw) || 0);

  if (stock < 0) {
    return {
      action: 'negative', available, quantity: q,
      message: `تنبيه: رصيد الطبخة المختارة سالب (${stock}) — الطبخة نفدت ولا يُعتمد استهلاكها إلا بتأكيد صريح.`
    };
  }

  // الحالة أ — فارغة أو صفر
  if (q === null || q === 0) {
    if (available >= 1) return { action: 'default', available, defaultQty: 1, message: null };
    if (available > 0) return { action: 'default', available, defaultQty: available, message: null };
    return { action: 'default', available, defaultQty: '', message: 'تنبيه: لا رصيد متاح لهذه الطبخة' };
  }

  // الحالة ب — الكمية المكتوبة تكفيها (مع مراعاة أسطر نفس الطبخة)
  if (q <= available) {
    return { action: 'keep', available, quantity: q, message: null };
  }

  // الحالة ج — الكمية أكبر من المتاح
  if (available > 0) {
    return {
      action: 'over', available, quantity: q,
      message: `تنبيه: الكمية المطلوبة (${q}) تتجاوز رصيد الطبخة المختارة المتاح (${available})`
    };
  }
  return {
    action: 'over-zero', available, quantity: q,
    message: `تنبيه: رصيد الطبخة المختارة المتاح = ${available} — الكمية المطلوبة (${q}) تحتاج تأكيداً صريحاً.`
  };
}

/* nextBatchForSplit — أول طبخة تالية متاحة لنفس المادة (لخيار توزيع الباقي)
   batches: قائمة طبخات المادة [{batchNo, stock, ...}] — يشمل الأسطر المرشّحة فقط (stock>0)
   excludeBatchNo: الطبخة الحالية (المقصودة من الترشيح)
   reservedFor: خريطة batchNo → كمية محجوزة بأسطر أخرى (تُخصم من المتاح) */
export function nextBatchForSplit(batches, excludeBatchNo, reservedFor) {
  const reserved = reservedFor || {};
  const list = (batches || [])
    .filter(b => b && b.batchNo && String(b.batchNo) !== String(excludeBatchNo || ''))
    .filter(b => (Number(b.stock) || 0) - (Number(reserved[b.batchNo]) || 0) > 0.0001)
    .sort((a, b) => (Number(b.stock) - (Number(reserved[b.batchNo]) || 0)) - (Number(a.stock) - (Number(reserved[a.batchNo]) || 0)));
  return list.length ? list[0] : null;
}
