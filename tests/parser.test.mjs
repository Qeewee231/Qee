import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTask } from '../js/parser.js';
import { toJalali, fromJalali, addJalaliMonths } from '../js/jalali.js';
import { classify, learn } from '../js/classifier.js';

// یکشنبه ۳ آبان ۱۴۰۵، ساعت ۱۴:۰۰
const NOW = new Date(2026, 9, 25, 14, 0);
const ymdhm = (d) => d && `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;

test('تبدیل تاریخ شمسی با Intl مطابقت دارد', () => {
  const fmt = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });
  for (let t = Date.UTC(2015, 0, 1); t < Date.UTC(2035, 0, 1); t += 86400000 * 3) {
    const g = new Date(t); const d = new Date(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate(), 12);
    const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
    const j = toJalali(d);
    assert.deepEqual([j.jy, j.jm, j.jd], [parseInt(p.year), +p.month, +p.day], d.toDateString());
    const back = fromJalali(j.jy, j.jm, j.jd);
    assert.equal(back.toDateString(), d.toDateString());
  }
  assert.equal(ymdhm(addJalaliMonths(fromJalali(1405, 6, 31), 1)), '2026-10-22 0:0'); // ۳۱ شهریور + ۱ ماه = ۳۰ مهر
});

const cases = [
  ['فردا ساعت ۱۰ جلسه با مدیر', 'جلسه با مدیر', '2026-10-26 10:0', 'work'],
  ['پس فردا ساعت ۵ عصر دندانپزشکی', 'دندانپزشکی', '2026-10-27 17:0', 'health'],
  ['ساعت 9:30 صبح زنگ به بانک', 'زنگ به بانک', '2026-10-26 9:30', 'finance'],
  ['ساعت ۱۸ خرید نان و شیر', 'خرید نان و شیر', '2026-10-25 18:0', 'shopping'],
  ['سه‌شنبه تولد مامان', 'تولد مامان', '2026-10-27 0:0', 'family'],
  ['شنبه ساعت ۸ کلاس زبان', 'کلاس زبان', '2026-10-31 8:0', 'study'],
  ['۲ ساعت دیگه قرص بخورم', 'قرص بخورم', '2026-10-25 16:0', 'health'],
  ['نیم ساعت دیگر زنگ بزنم به همکار', 'زنگ بزنم به همکار', '2026-10-25 14:30', 'work'],
  ['۱۲ آبان پرداخت قسط وام', 'پرداخت قسط وام', '2026-11-3 0:0', 'finance'],
  ['1405/9/1 تمدید گواهینامه', 'تمدید گواهینامه', '2026-11-22 0:0', 'admin'],
  ['امشب نظافت آشپزخانه', 'نظافت آشپزخانه', '2026-10-25 21:0', 'home'],
  ['یادم بنداز فردا صبح تعویض روغن ماشین', 'تعویض روغن ماشین', '2026-10-26 9:0', 'home'],
  ['ساعت ۵ و نیم عصر باشگاه', 'باشگاه', '2026-10-25 17:30', 'health'],
  ['۳ روز دیگه تحویل گزارش', 'تحویل گزارش', '2026-10-28 0:0', 'work'],
  ['یه کتاب جدید بخونم', 'یه کتاب جدید بخونم', null, 'study'],
];
for (const [input, title, due, cat] of cases) {
  test(input, () => {
    const r = parseTask(input, NOW);
    assert.equal(r.title, title);
    assert.equal(ymdhm(r.due), due);
    assert.equal(classify(r.title), cat);
  });
}

test('اولویت، تکرار، یادآوری و مدت', () => {
  let r = parseTask('هر دوشنبه ساعت ۷ صبح جلسه تیم، فوری، ۳۰ دقیقه قبل یادم بنداز', NOW);
  assert.equal(r.title, 'جلسه تیم');
  assert.equal(r.recurrence, 'weekly');
  assert.equal(r.priority, 3);
  assert.equal(r.remindOffset, 30);
  assert.equal(ymdhm(r.due), '2026-10-26 7:0');
  r = parseTask('هر روز ورزش به مدت نیم ساعت', NOW);
  assert.equal(r.recurrence, 'daily');
  assert.equal(r.duration, 30);
  assert.equal(r.title, 'ورزش');
  r = parseTask('خرید کادو اگه وقت شد', NOW);
  assert.equal(r.priority, 0);
  assert.equal(r.title, 'خرید کادو');
  r = parseTask('جواب ایمیل‌ها مهم #مالی', NOW);
  assert.equal(r.priority, 2);
  assert.equal(r.category, 'finance');
  assert.equal(r.title, 'جواب ایمیل‌ها');
  r = parseTask('ساعت ۱۰ صبح پیاده‌روی', NOW); // ساعت گذشته → فردا
  assert.equal(ymdhm(r.due), '2026-10-26 10:0');
});

test('یادگیری از اصلاح دسته', () => {
  const learned = {};
  assert.equal(classify('تمرین گیتار'), 'study');
  learn(learned, 'تمرین گیتار', 'personal');
  assert.equal(classify('تمرین گیتار با استاد', learned), 'personal');
});
