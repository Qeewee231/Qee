// یادآوری‌ها: اعلان گوشی + صدا/لرزش داخل برنامه + خروجی تقویم (ics)
import { state, save } from './store.js';
import { formatTime, pad2 } from './jalali.js';
import { categoryById } from './classifier.js';
import { isNative } from './native.js';

const MISSED_WINDOW = 12 * 3600000; // یادآوری‌های جاافتاده تا ۱۲ ساعت بعد هم نمایش داده می‌شوند

export function notificationsSupported() {
  return 'Notification' in window;
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

export async function notify(title, options) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, options); return true; }
    new Notification(title, options);
    return true;
  } catch { return false; }
}

function beep() {
  if (!state.settings.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* ignore */ }
  navigator.vibrate?.([200, 100, 200]);
}

function reminderBody(task) {
  const cat = categoryById(task.category);
  const when = task.hasTime ? `ساعت ${formatTime(new Date(task.due))}` : 'امروز';
  return `${cat.emoji} ${cat.name} · ${when}${task.notes ? '\n' + task.notes : ''}`;
}

/** هر ۲۰ ثانیه یادآوری‌های سررسیده را بررسی می‌کند */
export function startScheduler(onFire) {
  const tick = () => {
    const now = Date.now();
    let changed = false;
    for (const t of state.tasks) {
      if (t.done || t.reminded || !t.remindAt) continue;
      const at = new Date(t.remindAt).getTime();
      if (at > now) continue;
      t.reminded = true;
      changed = true;
      if (now - at > MISSED_WINDOW) continue;
      // در نسخهٔ اندروید اعلان را خود سیستم (از قبل زمان‌بندی‌شده) نمایش می‌دهد
      if (!isNative) notify(`🔔 ${t.title}`, {
        body: reminderBody(t), tag: t.id, renotify: true, requireInteraction: true,
        dir: 'rtl', lang: 'fa', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
        data: { id: t.id },
        actions: [{ action: 'done', title: '✅ انجام شد' }, { action: 'snooze', title: '⏱ ۱۰ دقیقه بعد' }],
      });
      if (!isNative) beep();
      onFire?.(t);
    }
    if (changed) save();
    morningBrief(onFire);
  };
  tick();
  scheduleAhead();
  return setInterval(tick, 20000);
}

function morningBrief(onFire) {
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (now.getHours() < state.settings.morningHour || state.meta.briefDay === key) return;
  state.meta.briefDay = key;
  save();
  onFire?.(null);
}

/**
 * در مرورگرهایی که Notification Triggers را پشتیبانی می‌کنند، اعلان‌ها از قبل زمان‌بندی می‌شوند
 * تا حتی وقتی برنامه بسته است هم برسند.
 */
export async function scheduleAhead() {
  if (isNative || typeof window.TimestampTrigger !== 'function' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return;
  for (const t of state.tasks) {
    if (t.done || !t.remindAt || new Date(t.remindAt) < new Date()) continue;
    try {
      await reg.showNotification(`🔔 ${t.title}`, {
        body: reminderBody(t), tag: t.id, dir: 'rtl', lang: 'fa', icon: 'icons/icon-192.png', data: { id: t.id },
        showTrigger: new window.TimestampTrigger(new Date(t.remindAt).getTime()),
      });
    } catch { return; }
  }
}

// ---------- خروجی تقویم: یادآوری مطمئن حتی وقتی برنامه بسته است ----------
const icsDate = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const icsDateTime = (d) => `${icsDate(d)}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
const icsEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);

export function toICS(tasks) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Monshi//FA', 'CALSCALE:GREGORIAN'];
  const stamp = icsDateTime(new Date());
  for (const t of tasks) {
    if (!t.due || t.done) continue;
    const due = new Date(t.due);
    lines.push('BEGIN:VEVENT', `UID:${t.id}@monshi`, `DTSTAMP:${stamp}`, `SUMMARY:${icsEscape(t.title)}`);
    if (t.hasTime) {
      lines.push(`DTSTART:${icsDateTime(due)}`, `DURATION:PT${t.duration || 30}M`);
    } else {
      const next = new Date(due); next.setDate(next.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${icsDate(due)}`, `DTEND;VALUE=DATE:${icsDate(next)}`);
    }
    if (t.notes) lines.push(`DESCRIPTION:${icsEscape(t.notes)}`);
    lines.push(`CATEGORIES:${icsEscape(categoryById(t.category).name)}`);
    if (t.recurrence) lines.push(`RRULE:FREQ=${t.recurrence.toUpperCase()}`);
    if (t.remindAt) {
      const mins = Math.max(0, Math.round((due - new Date(t.remindAt)) / 60000));
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(t.title)}`,
        mins >= 0 && t.hasTime ? `TRIGGER:-PT${mins}M` : `TRIGGER:PT${state.settings.morningHour}H`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function shareOrDownload(content, filename, type) {
  const blob = new Blob([content], { type });
  const file = new File([blob], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
