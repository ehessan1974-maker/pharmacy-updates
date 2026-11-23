/* batch_rules.test.mjs — السيناريوهات الأربعة المطلوبة لآلية تغيير رقم الطبخة
   تشغيل: node tests/batch_rules.test.mjs */
import { resolveBatchChange, nextBatchForSplit } from '../static/batch.qty.rules.js';

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra) : ''); }
}

console.log('السيناريو 1: كمية 3 → طبخة رصيدها 10 ← تبقى 3');
let r = resolveBatchChange({ enteredQty: 3, batchStock: 10 });
check('action=keep', r.action === 'keep', r);
check('quantity=3', r.quantity === 3, r);
check('لا رسالة', r.message === null, r);

console.log('السيناريو 2: كمية 5 → طبخة رصيدها 2 ← تنبيه + خيارات');
r = resolveBatchChange({ enteredQty: 5, batchStock: 2 });
check('action=over', r.action === 'over', r);
check('الرسالة تذكر 5 و 2', r.message.includes('(5)') && r.message.includes('(2)'), r);
check('المتاح=2', r.available === 2, r);

console.log('السيناريو 3: طبخة رصيدها سالب ← تحذير نفدت + تأكيد صريح');
r = resolveBatchChange({ enteredQty: 3, batchStock: -2 });
check('action=negative', r.action === 'negative', r);
check('الرسالة تذكر سالب', r.message.includes('سالب') && r.message.includes('نفدت'), r);

console.log('السيناريو 4: نفس المادة+الطبخة في سطرين — مجموع الكميتين');
r = resolveBatchChange({ enteredQty: 4, batchStock: 10, committedOtherRows: 6 });
check('المجموع 10 يكفي بالضبط → keep', r.action === 'keep', r);
r = resolveBatchChange({ enteredQty: 5, batchStock: 10, committedOtherRows: 6 });
check('المجموع 11 > 10 → over', r.action === 'over', r);
check('المتاح = 4', r.available === 4, r);

console.log('الحالة أ: خانة فارغة/صفر');
r = resolveBatchChange({ enteredQty: '', batchStock: 10 });
check('افتراضي 1', r.action === 'default' && r.defaultQty === 1, r);
r = resolveBatchChange({ enteredQty: 0, batchStock: 0.5 });
check('رصيد بين 0 و1 → كامل الرصيد', r.action === 'default' && r.defaultQty === 0.5, r);

console.log('وضع تعديل فاتورة قديمة: الكمية المحمّلة لا تُحصَل ضد نفسها');
r = resolveBatchChange({ enteredQty: 5, batchStock: 4, originalQty: 5, editMode: true });
check('ترخيص 5 → keep', r.action === 'keep', r);
r = resolveBatchChange({ enteredQty: 5, batchStock: 4, originalQty: 2, editMode: true });
check('5 ≤ المتاح 6 → keep بلا تحذير خاطئ', r.action === 'keep' && r.available === 6, r);
r = resolveBatchChange({ enteredQty: 7, batchStock: 4, originalQty: 2, editMode: true });
check('7 > 6 → over', r.action === 'over' && r.available === 6, r);

console.log('over-zero: المتاح صفر بأسطر أخرى');
r = resolveBatchChange({ enteredQty: 3, batchStock: 2, committedOtherRows: 2 });
check('action=over-zero', r.action === 'over-zero', r);

console.log('nextBatchForSplit: أقرب طبخة تالية متاحة');
const batches = [
  { batchNo: 'B1', stock: 1 },
  { batchNo: 'B2', stock: 8 },
  { batchNo: 'B3', stock: 3 },
];
let nb = nextBatchForSplit(batches, 'B0', {});
check('الأوفر B2', nb && nb.batchNo === 'B2', nb);
nb = nextBatchForSplit(batches, 'B2', {});
check('بعد استبعاد B2 → B3', nb && nb.batchNo === 'B3', nb);
nb = nextBatchForSplit([{ batchNo: 'X', stock: -1 }], '', {});
check('لا مرشح برصيد سالب', nb === null, nb);

console.log(`\nالنتيجة: نجح ${passed} / فشل ${failed}`);
process.exit(failed ? 1 : 0);
