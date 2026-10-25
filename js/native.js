// ارتباط با نسخهٔ اندروید: اعلان‌های زمان‌بندی‌شدهٔ سیستمی و ارسال خودکار پیامک
import { state, save, computeRemindAt, contactById } from './store.js';
import { smsText } from './contacts.js';
import { categoryById } from './classifier.js';
import { formatTime, fa } from './jalali.js';
import { briefText } from './analytics.js';

const Cap = window.Capacitor;
export const isNative = !!Cap?.isNativePlatform?.();
const LN = isNative ? Cap.registerPlugin('LocalNotifications') : null;
const SMS = isNative ? Cap.registerPlugin('SmsScheduler') : null;
export const smsAutoSupported = isNative;

const BRIEF_ID = 2000000001;
const MAX_SCHEDULED = 60;

/** شناسهٔ عددی پایدار برای اعلان اندروید */
function intId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h % 2000000000);
}

/** زمان ارسال پیامک: زمان یادآوری اصلی کار (تعویق یادآوری خودِ کاربر روی پیامک اثر ندارد) */
export function smsSendAt(task) {
  const at = computeRemindAt(task);
  return at ? new Date(at) : null;
}

export async function initNative(onAction) {
  if (!isNative) return;
  try {
    await LN.createChannel({ id: 'reminders', name: 'یادآوری کارها', importance: 5, vibration: true, visibility: 1 });
    await LN.registerActionTypes({ types: [{ id: 'TASK', actions: [{ id: 'done', title: '✅ انجام شد' }, { id: 'snooze', title: '⏱ ۱۰ دقیقه بعد' }] }] });
    LN.addListener('localNotificationActionPerformed', (e) => {
      const id = e.notification?.extra?.id;
      onAction(e.actionId === 'tap' ? 'open' : e.actionId, id);
    });
  } catch (err) { console.warn('native init', err); }
}

export async function requestNativePermissions() {
  if (!isNative) return 'unsupported';
  const r = await LN.requestPermissions();
  try {
    const exact = await LN.checkExactNotificationSetting();
    if (exact?.exact_alarm && exact.exact_alarm !== 'granted') await LN.changeExactNotificationSetting();
  } catch { /* اندروید قدیمی */ }
  return r.display;
}

export async function nativePermission() {
  if (!isNative) return 'unsupported';
  try { return (await LN.checkPermissions()).display; } catch { return 'unsupported'; }
}

export async function requestSmsPermission() {
  if (!isNative) return 'unsupported';
  const r = await SMS.requestPermissions({ permissions: ['sms'] });
  return r.sms;
}

export async function smsPermission() {
  if (!isNative) return 'unsupported';
  try { return (await SMS.checkPermissions()).sms; } catch { return 'unsupported'; }
}

export async function sendSmsNow(phone, message) {
  if (!isNative) return false;
  await SMS.sendNow({ phone, message });
  return true;
}

/** لینک باز کردن برنامهٔ پیامک گوشی با متن آماده (برای نسخهٔ وب) */
export function smsLink(phone, message) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return `sms:${phone}${ios ? '&' : '?'}body=${encodeURIComponent(message)}`;
}

let timer = null;
/** همهٔ یادآوری‌ها و پیامک‌ها را با سیستم اندروید همگام می‌کند (با تأخیر کوتاه برای تجمیع تغییرات) */
export function syncNative() {
  if (!isNative) return;
  clearTimeout(timer);
  timer = setTimeout(() => { doSync().catch((e) => console.warn('sync', e)); }, 400);
}

async function doSync() {
  const now = Date.now();
  // ۱) اعلان‌های سیستمی
  const pending = await LN.getPending();
  if (pending.notifications?.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  const upcoming = state.tasks
    .filter((t) => !t.done && t.remindAt && new Date(t.remindAt).getTime() > now)
    .sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt))
    .slice(0, MAX_SCHEDULED);
  const notifications = upcoming.map((t) => {
    const cat = categoryById(t.category);
    const contact = t.smsTo ? contactById(t.smsTo) : null;
    return {
      id: intId(t.id), title: `🔔 ${t.title}`,
      body: `${cat.emoji} ${cat.name} · ${t.hasTime ? 'ساعت ' + formatTime(new Date(t.due)) : 'امروز'}${contact ? ` · 📩 پیامک به ${contact.name}` : ''}${t.notes ? '\n' + t.notes : ''}`,
      schedule: { at: new Date(t.remindAt), allowWhileIdle: true },
      channelId: 'reminders', actionTypeId: 'TASK', extra: { id: t.id }, smallIcon: 'ic_stat_monshi', iconColor: '#3b4cca',
    };
  });
  // گزارش صبحگاهی فردا (یا امروز اگر هنوز ساعتش نرسیده)
  const brief = new Date(); brief.setHours(state.settings.morningHour, 0, 0, 0);
  if (brief.getTime() <= now) brief.setDate(brief.getDate() + 1);
  notifications.push({ id: BRIEF_ID, title: '☀️ گزارش امروز منشی', body: briefText(state.tasks, state.settings, brief), schedule: { at: brief, allowWhileIdle: true }, channelId: 'reminders', smallIcon: 'ic_stat_monshi' });
  await LN.schedule({ notifications });

  // ۲) پیامک‌ها
  const wanted = new Set();
  for (const t of state.tasks) {
    const contact = t.smsTo ? contactById(t.smsTo) : null;
    const at = contact && !t.done ? smsSendAt(t) : null;
    if (!at) continue;
    const known = (state.meta.smsIds || []).includes(t.id);
    // پیامکی که زمانش بیش از ۲ دقیقه گذشته فرستاده نمی‌شود تا کارهای قدیمی ناگهان پیامک نفرستند
    if (at.getTime() < now - 120000 && !known) continue;
    wanted.add(t.id);
    await SMS.schedule({ id: t.id, phone: contact.phone, name: contact.name, message: smsText(t, contact, state.settings, at), at: at.getTime() });
  }
  for (const id of state.meta.smsIds || []) if (!wanted.has(id)) await SMS.cancel({ id });

  // ۳) وضعیت ارسال را در کارها ثبت کن
  const { items } = await SMS.list();
  const statusById = Object.fromEntries(items.map((i) => [i.id, i]));
  let changed = JSON.stringify(state.meta.smsIds || []) !== JSON.stringify([...wanted]);
  state.meta.smsIds = [...wanted];
  for (const t of state.tasks) {
    const st = t.smsTo ? statusById[t.id]?.status || null : null;
    if ((t.smsStatus || null) !== st) { t.smsStatus = st; changed = true; }
  }
  if (changed) save();
}

export const SMS_STATUS_TEXT = { scheduled: '⏳ زمان‌بندی شد', sent: '✓ ارسال شد', failed: '⚠️ ناموفق', missed: '⚠️ جا ماند' };
export { fa };
