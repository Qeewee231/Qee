// تحلیل کارها و توصیه‌های منشی
import { CATEGORIES, categoryById } from './classifier.js';
import { fa, formatTime, WEEKDAYS } from './jalali.js';

const DAY = 86400000;
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const durationOf = (t) => t.duration || 30;

export function isOverdue(t, now = new Date()) {
  if (t.done || !t.due) return false;
  const due = new Date(t.due);
  return t.hasTime ? due < now : endOfDay(due) < now;
}

export const tasksOnDay = (tasks, day) => tasks.filter((t) => t.due && sameDay(new Date(t.due), day));

export function sortByTime(list) {
  return [...list].sort((a, b) => {
    if (a.hasTime !== b.hasTime) return a.hasTime ? -1 : 1;
    const d = new Date(a.due || 0) - new Date(b.due || 0);
    return d || b.priority - a.priority;
  });
}

/** امتیاز فوریت برای پیشنهاد «الان روی چه کاری تمرکز کنم» */
export function urgencyScore(t, now = new Date()) {
  let s = t.priority * 25;
  if (!t.due) return s;
  const due = new Date(t.due);
  const hours = (due - now) / 3600000;
  if (isOverdue(t, now)) s += 40 + Math.min(20, (t.postponeCount || 0) * 5);
  else if (t.hasTime && hours < 2) s += 45 - hours * 10;
  else if (sameDay(due, now)) s += 25;
  else if (hours < 48) s += 10;
  return s;
}

export function focusTask(tasks, now = new Date()) {
  const candidates = tasks.filter((t) => !t.done && (!t.due || new Date(t.due) <= endOfDay(now)));
  candidates.sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now));
  return candidates[0] || null;
}

/** کارهای ساعت‌داری که زمانشان با هم تداخل دارد */
export function findConflicts(tasks) {
  const timed = tasks.filter((t) => !t.done && t.hasTime).sort((a, b) => new Date(a.due) - new Date(b.due));
  const out = [];
  for (let i = 0; i < timed.length - 1; i++) {
    const a = timed[i], b = timed[i + 1];
    if (new Date(a.due).getTime() + durationOf(a) * 60000 > new Date(b.due).getTime()) out.push([a, b]);
  }
  return out;
}

export function todaySummary(tasks, now = new Date()) {
  const today = tasksOnDay(tasks, now);
  return {
    total: today.length,
    done: today.filter((t) => t.done).length,
    remaining: today.filter((t) => !t.done).length,
    timed: today.filter((t) => t.hasTime && !t.done).length,
    overdue: tasks.filter((t) => isOverdue(t, now) && !sameDay(new Date(t.due), now)).length,
    inbox: tasks.filter((t) => !t.done && !t.due).length,
    loadMinutes: today.filter((t) => !t.done).reduce((s, t) => s + durationOf(t), 0),
  };
}

export function streak(tasks, now = new Date()) {
  const days = new Set(tasks.filter((t) => t.doneAt).map((t) => startOfDay(new Date(t.doneAt)).getTime()));
  let d = startOfDay(now);
  if (!days.has(d.getTime())) d = startOfDay(new Date(d.getTime() - DAY / 2));
  let n = 0;
  while (days.has(d.getTime())) { n++; d = startOfDay(new Date(d.getTime() - DAY / 2)); }
  return n;
}

export function stats(tasks, now = new Date()) {
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const day = startOfDay(new Date(now.getTime() - i * DAY));
    last7.push({
      day,
      planned: tasksOnDay(tasks, day).length,
      done: tasks.filter((t) => t.doneAt && sameDay(new Date(t.doneAt), day)).length,
    });
  }
  const weekAgo = startOfDay(new Date(now.getTime() - 6 * DAY));
  const dueWeek = tasks.filter((t) => t.due && new Date(t.due) >= weekAgo && new Date(t.due) <= now);
  const completionRate = dueWeek.length ? Math.round((dueWeek.filter((t) => t.done).length / dueWeek.length) * 100) : null;

  const doneWithDue = tasks.filter((t) => t.done && t.due && t.doneAt);
  const onTime = doneWithDue.filter((t) => new Date(t.doneAt) <= (t.hasTime ? new Date(new Date(t.due).getTime() + 3600000) : endOfDay(new Date(t.due))));
  const onTimeRate = doneWithDue.length ? Math.round((onTime.length / doneWithDue.length) * 100) : null;

  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const recent = tasks.filter((t) => new Date(t.createdAt) >= monthAgo || (t.due && new Date(t.due) >= monthAgo));
  const byCategory = CATEGORIES.map((c) => {
    const list = recent.filter((t) => t.category === c.id);
    return { ...c, total: list.length, done: list.filter((t) => t.done).length };
  }).filter((c) => c.total).sort((a, b) => b.total - a.total);

  const hours = new Array(24).fill(0);
  const weekdays = new Array(7).fill(0);
  for (const t of tasks) {
    if (!t.doneAt) continue;
    const d = new Date(t.doneAt);
    hours[d.getHours()]++;
    weekdays[d.getDay()]++;
  }
  const doneTotal = tasks.filter((t) => t.done).length;
  const postponed = tasks.filter((t) => !t.done && (t.postponeCount || 0) >= 2).sort((a, b) => b.postponeCount - a.postponeCount);

  return { last7, completionRate, onTimeRate, byCategory, hours, weekdays, doneTotal, postponed, streak: streak(tasks, now), doneWeek: last7.reduce((s, d) => s + d.done, 0) };
}

/** بهترین بازهٔ دوساعتهٔ کاری بر اساس سابقهٔ انجام کارها */
export function peakHours(hours) {
  let best = -1, max = 0;
  for (let h = 0; h < 23; h++) { const v = hours[h] + hours[h + 1]; if (v > max) { max = v; best = h; } }
  return max >= 3 ? best : null;
}

/** یادداشت‌های منشی: هشدارها، پیشنهادها و تشویق */
export function insights(tasks, settings, now = new Date()) {
  const out = [];
  const sum = todaySummary(tasks, now);
  const overdue = tasks.filter((t) => isOverdue(t, now));

  if (overdue.length) {
    out.push({ level: 'warn', icon: '⏰', text: `${fa(overdue.length)} کار از موعدش گذشته. بهتر است همین حالا یا برای امروز/فردا زمان‌بندی‌شان کنید.`, action: 'reschedule-overdue', actionText: 'انتقال همه به امروز' });
  }

  const upcoming = tasks.filter((t) => !t.done && t.hasTime && new Date(t.due) > now && new Date(t.due) - now < 2 * 3600000)
    .sort((a, b) => new Date(a.due) - new Date(b.due))[0];
  if (upcoming) {
    const mins = Math.round((new Date(upcoming.due) - now) / 60000);
    out.push({ level: 'info', icon: '📌', text: `کار بعدی: «${upcoming.title}» ساعت ${formatTime(new Date(upcoming.due))} (${mins < 60 ? fa(mins) + ' دقیقهٔ دیگر' : 'حدود ' + fa(Math.round(mins / 60)) + ' ساعت دیگر'}).` });
  }

  const conflicts = findConflicts(tasksOnDay(tasks, now).concat(tasksOnDay(tasks, new Date(now.getTime() + DAY))));
  for (const [a, b] of conflicts.slice(0, 2)) {
    out.push({ level: 'warn', icon: '⚠️', text: `تداخل زمانی: «${a.title}» و «${b.title}» هم‌پوشانی دارند. یکی را جابه‌جا کنید.` });
  }

  const available = Math.max(0, (settings.workEnd - Math.max(settings.workStart, now.getHours())) * 60);
  if (sum.loadMinutes > 0 && sum.remaining >= 3 && sum.loadMinutes > available + 60) {
    out.push({ level: 'warn', icon: '🔥', text: `برنامهٔ امروز حدود ${fa(Math.round(sum.loadMinutes / 60))} ساعت کار دارد ولی ${available ? `تا پایان ساعت کاری فقط ${fa(Math.round(available / 60))} ساعت مانده` : 'ساعت کاری امروز تمام شده'}. پیشنهاد: کارهای کم‌اهمیت را به فردا منتقل کنید.`, action: 'defer-low', actionText: 'انتقال کم‌اهمیت‌ها' });
  }

  const procrastinated = tasks.filter((t) => !t.done && (t.postponeCount || 0) >= 3);
  if (procrastinated.length) {
    out.push({ level: 'info', icon: '🐢', text: `«${procrastinated[0].title}» را ${fa(procrastinated[0].postponeCount)} بار عقب انداخته‌اید. شاید بهتر باشد آن را به چند قدم کوچک‌تر بشکنید یا اگر دیگر لازم نیست حذفش کنید.` });
  }

  if (sum.inbox >= 3) {
    out.push({ level: 'info', icon: '📥', text: `${fa(sum.inbox)} کار بدون زمان دارید. کاری که زمان ندارد معمولاً انجام نمی‌شود؛ برای مهم‌ترینشان روز تعیین کنید.` });
  }

  const s = stats(tasks, now);
  const peak = peakHours(s.hours);
  if (peak !== null) {
    out.push({ level: 'good', icon: '🧠', text: `طبق سابقه، شما بین ساعت ${fa(peak)} تا ${fa(peak + 2)} بیشترین بازدهی را دارید. کارهای سخت را در این بازه بگذارید.` });
  }

  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const recentCats = new Set(tasks.filter((t) => new Date(t.createdAt) > weekAgo).map((t) => t.category));
  if (tasks.length >= 10 && !recentCats.has('health')) {
    out.push({ level: 'info', icon: '🩺', text: 'این هفته هیچ کاری برای سلامتی‌تان ثبت نکرده‌اید. یک پیاده‌روی کوتاه هم حساب است!' });
  }
  if (tasks.length >= 10 && !recentCats.has('family')) {
    out.push({ level: 'info', icon: '💜', text: 'مدتی است کاری برای خانواده و دوستان ثبت نشده. شاید وقت یک تماس یا دیدار باشد.' });
  }

  if (s.streak >= 3) out.push({ level: 'good', icon: '🔥', text: `${fa(s.streak)} روز پشت سر هم کارهایتان را انجام داده‌اید. عالیه، ادامه بدهید!` });
  if (sum.total > 0 && sum.remaining === 0) out.push({ level: 'good', icon: '🎉', text: 'همهٔ کارهای امروز انجام شد. خسته نباشید!' });

  return out;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'شب بخیر';
  if (h < 12) return 'صبح بخیر';
  if (h < 17) return 'ظهر بخیر';
  if (h < 21) return 'عصر بخیر';
  return 'شب بخیر';
}

/** متن خلاصهٔ روزانه، مثل گزارش یک منشی */
export function briefText(tasks, settings, now = new Date()) {
  const sum = todaySummary(tasks, now);
  const parts = [];
  if (sum.total === 0) parts.push('برای امروز کاری ثبت نشده.');
  else {
    parts.push(`امروز ${fa(sum.total)} کار دارید`);
    if (sum.done) parts[0] += `، ${fa(sum.done)} مورد انجام شده و ${fa(sum.remaining)} مورد مانده`;
    parts[0] += '.';
  }
  const first = tasksOnDay(tasks, now).filter((t) => !t.done && t.hasTime && new Date(t.due) > now).sort((a, b) => new Date(a.due) - new Date(b.due))[0];
  if (first) parts.push(`اولین قرار: «${first.title}» ساعت ${formatTime(new Date(first.due))}.`);
  if (sum.overdue) parts.push(`${fa(sum.overdue)} کار عقب‌افتاده هم از روزهای قبل مانده.`);
  const urgent = tasks.filter((t) => !t.done && t.priority === 3).length;
  if (urgent) parts.push(`${fa(urgent)} کار فوری در لیست است.`);
  return parts.join(' ');
}

export { WEEKDAYS, categoryById };
