// تبدیل تاریخ شمسی/میلادی (الگوریتم jalaali) و ابزارهای نمایش فارسی

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;

function jalCal(jy) {
  const gy = jy + 621;
  let leapJ = -14, jp = BREAKS[0], jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toJalali(date) {
  return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

/** تاریخ شمسی را به Date محلی (نیمه‌شب) تبدیل می‌کند */
export function fromJalali(jy, jm, jd) {
  const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
  return new Date(gy, gm - 1, gd);
}

export function isLeapJalali(jy) {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalali(jy) ? 30 : 29;
}

/** افزودن n ماه شمسی (روز در صورت نیاز به آخر ماه محدود می‌شود) */
export function addJalaliMonths(date, n) {
  const { jy, jm, jd } = toJalali(date);
  const total = jy * 12 + (jm - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const d = fromJalali(ny, nm, Math.min(jd, jalaliMonthLength(ny, nm)));
  d.setHours(date.getHours(), date.getMinutes(), 0, 0);
  return d;
}

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
// اندیس بر اساس Date.getDay() (۰ = یکشنبه)
export const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

const FA = '۰۱۲۳۴۵۶۷۸۹';
export function fa(value) {
  return String(value).replace(/\d/g, (d) => FA[d]);
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatTime(date) {
  return fa(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`);
}

export function formatJalali(date, { weekday = true, year = false } = {}) {
  const { jy, jm, jd } = toJalali(date);
  let s = `${fa(jd)} ${JALALI_MONTHS[jm - 1]}`;
  if (year) s += ` ${fa(jy)}`;
  if (weekday) s = `${WEEKDAYS[date.getDay()]} ${s}`;
  return s;
}
