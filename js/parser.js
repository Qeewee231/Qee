// درک جملات فارسی: «فردا ساعت ۱۰ صبح جلسه با مدیر، فوری، ۳۰ دقیقه قبل یادم بنداز»
import { fromJalali, toJalali, jalaliMonthLength, addJalaliMonths, JALALI_MONTHS, WEEKDAYS, fa, pad2 } from './jalali.js';
import { CATEGORIES, normalizeText } from './classifier.js';

const L = '(?<=^|[\\s،,.!؟?:;()])';
const R = '(?=$|[\\s،,.!؟?:;()])';
const NUM_WORDS = { 'یک': 1, 'یه': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5, 'شش': 6, 'شیش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9, 'ده': 10, 'یازده': 11, 'دوازده': 12, 'پونزده': 15, 'پانزده': 15, 'بیست': 20, 'سی': 30, 'چهل': 40, 'پنجاه': 50 };
const NUM = `(?:\\d{1,3}|${Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join('|')})`;
const toNum = (s) => (s === undefined ? NaN : /^\d+$/.test(s) ? Number(s) : NUM_WORDS[s] ?? NaN);

// ترتیب مهم است: «سه شنبه» باید پیش از «شنبه» بررسی شود
const WEEKDAY_PATTERNS = [
  ['سه ?شنبه', 2], ['چهار ?شنبه', 3], ['پنج ?شنبه', 4], ['یک ?شنبه', 0], ['دو ?شنبه', 1], ['شنبه', 6], ['جمعه', 5],
];
const WEEKDAY_RE = WEEKDAY_PATTERNS.map((p) => p[0]).join('|');
const weekdayIndex = (s) => WEEKDAY_PATTERNS.find(([p]) => new RegExp(`^(?:${p})$`).test(s))[1];

const PERIOD = '(صبح|بامداد|ظهر|بعد ?از ?ظهر|بعدازظهر|عصر|شب)';
const PERIOD_DEFAULT_HOUR = { 'صبح': 9, 'بامداد': 6, 'ظهر': 13, 'بعدازظهر': 15, 'عصر': 17, 'شب': 21 };
const periodKey = (p) => (p ? p.replace(/ /g, '') : p);

const UNIT_MIN = { 'دقیقه': 1, 'ساعت': 60, 'روز': 1440, 'هفته': 10080 };

function applyPeriod(h, period) {
  const p = periodKey(period);
  if (!p) return h >= 1 && h <= 6 ? h + 12 : h; // «ساعت ۵ جلسه» یعنی ۵ عصر
  if (p === 'بعدازظهر' || p === 'عصر') return h < 12 ? h + 12 : h;
  if (p === 'شب') return h >= 5 && h < 12 ? h + 12 : h === 12 ? 0 : h;
  if (p === 'ظهر') return h <= 4 ? h + 12 : h;
  return h === 12 ? 0 : h; // صبح/بامداد
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/**
 * متن ورودی را تحلیل می‌کند.
 * خروجی: {title, due, hasTime, priority, category, recurrence, remindOffset, duration, chips}
 */
export function parseTask(input, now = new Date()) {
  const original = String(input || '');
  // نرمال‌سازی یک‌به‌یک (طول رشته ثابت می‌ماند تا بتوانیم بازه‌ها را از متن اصلی حذف کنیم)
  let work = original
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏‎]/g, ' ')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[٫]/g, ':');
  const removed = new Array(original.length).fill(false);
  const chips = [];

  const take = (pattern) => {
    const re = new RegExp(pattern);
    const m = re.exec(work);
    if (!m) return null;
    for (let i = m.index; i < m.index + m[0].length; i++) removed[i] = true;
    work = work.slice(0, m.index) + ' '.repeat(m[0].length) + work.slice(m.index + m[0].length);
    return m;
  };

  const res = { priority: 1, category: null, recurrence: null, remindOffset: undefined, duration: null };
  let day = null;       // Date (نیمه‌شب) اگر روز مشخص شده باشد
  let time = null;      // {h, m}
  let exact = null;     // زمان دقیق نسبی («۲ ساعت دیگه»)
  let period = null;

  // عبارات «یادم بنداز» و مشابه فقط حذف می‌شوند
  take(`${L}(یادم (بنداز|بیار|باشه)( که)?|یادآوری کن( که)?|یادت باشه( که)?|لطفا|لطفاً)${R}`);

  // تکرار
  let m;
  if ((m = take(`${L}هر (روز|هفته|ماه|سال)${R}`))) {
    res.recurrence = { 'روز': 'daily', 'هفته': 'weekly', 'ماه': 'monthly', 'سال': 'yearly' }[m[1]];
  } else if ((m = take(`${L}هر (${WEEKDAY_RE})${R}`))) {
    res.recurrence = 'weekly';
    const wd = weekdayIndex(m[1]);
    const today = startOfDay(now);
    day = addDays(today, (wd - today.getDay() + 7) % 7);
  } else if ((m = take(`${L}(روزانه|هفتگی|ماهانه|ماهیانه|سالانه)${R}`))) {
    res.recurrence = { 'روزانه': 'daily', 'هفتگی': 'weekly', 'ماهانه': 'monthly', 'ماهیانه': 'monthly', 'سالانه': 'yearly' }[m[1]];
  }
  if (res.recurrence) chips.push({ type: 'repeat', text: { daily: 'هر روز', weekly: 'هر هفته', monthly: 'هر ماه', yearly: 'هر سال' }[res.recurrence] });

  // یادآوری قبل از موعد: «۳۰ دقیقه قبل»، «یک روز زودتر»
  if ((m = take(`${L}(?:یادآوری )?(${NUM}|نیم) ?(دقیقه|ساعت|روز) (قبل|زودتر|پیش)(?: یادم بنداز| خبرم کن)?${R}`))) {
    const n = m[1] === 'نیم' ? 0.5 : toNum(m[1]);
    res.remindOffset = Math.round(n * UNIT_MIN[m[2]]);
    chips.push({ type: 'remind', text: `یادآوری ${fa(m[1] === 'نیم' ? 'نیم' : n)} ${m[2]} قبل` });
  }

  // مدت: «به مدت ۲ ساعت»
  if ((m = take(`${L}(?:به مدت|حدود) (${NUM}|نیم) ?(دقیقه|ساعت)${R}`))) {
    res.duration = Math.round((m[1] === 'نیم' ? 0.5 : toNum(m[1])) * UNIT_MIN[m[2]]);
    chips.push({ type: 'duration', text: `${fa(res.duration)} دقیقه` });
  }

  // زمان نسبی: «۲ ساعت دیگه»، «سه روز بعد»، «نیم ساعت دیگر»
  if ((m = take(`${L}(?:(${NUM}|نیم) ?(دقیقه|ساعت|روز|هفته|ماه)|(یک ربع)) (?:دیگه|دیگر|بعد)${R}`))) {
    const unit = m[2] || 'دقیقه';
    const n = m[3] ? 15 : m[1] === 'نیم' ? 0.5 : toNum(m[1]);
    if (unit === 'ماه') day = startOfDay(addJalaliMonths(now, n));
    else if (unit === 'روز' || unit === 'هفته') day = addDays(startOfDay(now), n * (unit === 'هفته' ? 7 : 1));
    else exact = new Date(now.getTime() + n * UNIT_MIN[unit] * 60000);
  }

  // تاریخ کامل: ۱۴۰۵/۸/۱۲ یا 2026-11-02
  if (!day && (m = take(`${L}(\\d{4})[/\\-.](\\d{1,2})[/\\-.](\\d{1,2})${R}`))) {
    const y = +m[1], mo = +m[2], d = +m[3];
    day = y < 1700 ? fromJalali(y, mo, d) : new Date(y, mo - 1, d);
  }
  // تاریخ ماه/روز شمسی: ۸/۱۲
  if (!day && (m = take(`${L}(\\d{1,2})/(\\d{1,2})${R}`))) {
    day = nextJalali(now, +m[1], +m[2]);
  }
  // «۱۲ آبان» یا «۱۲ام آبان ۱۴۰۵»
  if (!day && (m = take(`${L}(${NUM})(?: ?ام| ?م)? (${JALALI_MONTHS.join('|')})(?: (?:ماه|سال))?(?: (\\d{4}))?${R}`))) {
    const d = toNum(m[1]), mo = JALALI_MONTHS.indexOf(m[2]) + 1;
    day = m[3] ? fromJalali(+m[3], mo, d) : nextJalali(now, mo, d);
  }

  // روزهای نسبی
  if (!day && (m = take(`${L}(پس ?فردا|فردا|امروز|امشب|آخر هفته|هفته (?:بعد|دیگه|دیگر|آینده)|ماه (?:بعد|دیگه|دیگر|آینده))${R}`))) {
    const w = m[1].replace(/ /g, '');
    const today = startOfDay(now);
    if (w === 'پسفردا') day = addDays(today, 2);
    else if (w === 'فردا') day = addDays(today, 1);
    else if (w === 'امروز') day = today;
    else if (w === 'امشب') { day = today; period = 'شب'; }
    else if (w === 'آخرهفته') day = addDays(today, (5 - today.getDay() + 7) % 7 || 7);
    else if (w.startsWith('هفته')) day = addDays(today, 7);
    else day = startOfDay(addJalaliMonths(today, 1));
  }

  // روز هفته: «دوشنبه»، «این پنجشنبه»، «شنبه بعد»
  if (!day && (m = take(`${L}(این )?(${WEEKDAY_RE})( (?:بعد|آینده|دیگه))?${R}`))) {
    const wd = weekdayIndex(m[2]);
    const today = startOfDay(now);
    let diff = (wd - today.getDay() + 7) % 7;
    if (diff === 0 && !m[1]) diff = 7; // «دوشنبه» در روز دوشنبه یعنی هفتهٔ بعد
    day = addDays(today, diff);
  }

  // ساعت: «ساعت ۱۰»، «ساعت ۱۰:۳۰ صبح»، «ساعت ۵ و نیم عصر»
  if ((m = take(`${L}(?:سر )?ساعت ?(${NUM})(?::(\\d{1,2}))?(?: و (نیم|ربع|(\\d{1,2}) ?دقیقه))?(?: ?${PERIOD})?${R}`))) {
    let mm = m[2] ? +m[2] : m[3] === 'نیم' ? 30 : m[3] === 'ربع' ? 15 : m[4] ? +m[4] : 0;
    if (m[5]) period = m[5];
    time = { h: applyPeriod(toNum(m[1]), period), m: mm };
  } else if ((m = take(`${L}(\\d{1,2}):(\\d{2})(?: ?${PERIOD})?${R}`))) {
    if (m[3]) period = m[3];
    time = { h: applyPeriod(+m[1], period), m: +m[2] };
  } else if ((m = take(`${L}(${NUM})(?: و (نیم|ربع))? ${PERIOD}${R}`))) {
    period = m[3];
    time = { h: applyPeriod(toNum(m[1]), period), m: m[2] === 'نیم' ? 30 : m[2] === 'ربع' ? 15 : 0 };
  } else if ((m = take(`${L}${PERIOD}${R}`))) {
    period = m[1];
  }
  if (!time && period) time = { h: PERIOD_DEFAULT_HOUR[periodKey(period)], m: 0 };
  if (time && (time.h > 23 || time.m > 59 || Number.isNaN(time.h))) time = null;

  // اولویت
  if ((m = take(`${L}(غیر ?ضروری|کم ?اهمیت|اگه وقت شد|اگر وقت شد|هر وقت شد)${R}`))) res.priority = 0;
  else if ((m = take(`${L}(خیلی مهم|فوری|فوریه|ضروری|اورژانسی|خیلی فوری)${R}`)) || (m = take('!{3,}'))) res.priority = 3;
  else if ((m = take(`${L}(مهم|حتما|حتماً)${R}`)) || (m = take('!{2}'))) res.priority = 2;
  if (res.priority !== 1) chips.push({ type: 'priority', text: ['کم‌اهمیت', '', 'مهم', 'فوری'][res.priority] });

  // برچسب دسته: #مالی
  if ((m = take('#(\\S+)'))) {
    const tag = normalizeText(m[1]);
    const cat = CATEGORIES.find((c) => normalizeText(c.name).startsWith(tag) || c.id === tag);
    if (cat) res.category = cat.id;
  }

  // ساخت موعد نهایی
  let due = null, hasTime = false;
  if (exact) {
    due = exact; hasTime = true;
  } else if (time) {
    const base = day || startOfDay(now);
    due = new Date(base.getFullYear(), base.getMonth(), base.getDate(), time.h, time.m);
    hasTime = true;
    if (!day && due < now) due = addDays(due, 1); // ساعتی که امروز گذشته یعنی فردا
  } else if (day) {
    due = day;
  } else if (res.recurrence) {
    due = startOfDay(now);
  }
  if (due) chips.unshift({ type: 'date', text: describeDue(due, hasTime, now) });

  // عنوان = متن اصلی منهای بخش‌های شناخته‌شده
  let title = '';
  for (let i = 0; i < original.length; i++) title += removed[i] ? ' ' : original[i];
  title = title.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    title = title
      .replace(/^[\s،,.\-:]+|[\s،,.\-:]+$/g, '')
      .replace(/^(و|که|در|برای|تا)\s+/, '')
      .replace(/\s+(و|که|در|برای|تا|،)$/, '')
      .replace(/\s+،/g, '،').trim();
  }

  return { title, due, hasTime, ...res, chips };
}

function nextJalali(now, jm, jd) {
  if (jm < 1 || jm > 12) return null;
  const { jy } = toJalali(now);
  let d = fromJalali(jy, jm, Math.min(jd, jalaliMonthLength(jy, jm)));
  if (d < addDays(startOfDay(now), -1)) d = fromJalali(jy + 1, jm, Math.min(jd, jalaliMonthLength(jy + 1, jm)));
  return d;
}

/** توصیف دوستانهٔ موعد: «فردا ۱۰:۰۰»، «پنجشنبه ۸ آبان» */
export function describeDue(due, hasTime, now = new Date()) {
  const d = new Date(due);
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  let s;
  if (diff === 0) s = 'امروز';
  else if (diff === 1) s = 'فردا';
  else if (diff === 2) s = 'پس‌فردا';
  else if (diff === -1) s = 'دیروز';
  else {
    const { jm, jd } = toJalali(d);
    s = `${diff > 1 && diff < 7 ? WEEKDAYS[d.getDay()] + ' ' : ''}${fa(jd)} ${JALALI_MONTHS[jm - 1]}`;
  }
  if (hasTime) s += ` ${fa(pad2(d.getHours()) + ':' + pad2(d.getMinutes()))}`;
  return s;
}
