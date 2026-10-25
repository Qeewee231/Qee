// مخاطبین و متن پیامک یادآوری
import { normalizeText } from './classifier.js';
import { describeDue } from './parser.js';

export const DEFAULT_SMS_TEMPLATE = 'سلام {نام} عزیز، یادآوری: «{کار}» — {زمان}.';

/** شمارهٔ تلفن را به ارقام لاتین و بدون فاصله تبدیل می‌کند؛ اگر معتبر نباشد null */
export function normalizePhone(input) {
  let p = normalizeText(input).replace(/[\s\-()]/g, '');
  if (p.startsWith('0098')) p = '+98' + p.slice(4);
  if (/^9\d{9}$/.test(p)) p = '0' + p;
  return /^\+?\d{7,15}$/.test(p) ? p : null;
}

/**
 * مخاطب را از متن ثبت سریع پیدا می‌کند:
 * «@علی» یا «به علی پیامک بده/بزن» یا «برای علی پیامک کن»
 * خروجی: {text: متن بدون اشاره به مخاطب، contact}
 */
export function extractContact(text, contacts = []) {
  if (!contacts.length) return { text, contact: null };
  const norm = (s) => normalizeText(s).trim();
  const byName = (name) => {
    const n = norm(name);
    return contacts.find((c) => norm(c.name) === n) || contacts.find((c) => norm(c.name).split(/\s+/)[0] === n);
  };

  const at = /(^|\s)@(\S+)/.exec(text);
  if (at) {
    const contact = byName(at[2].replace(/[،,.]$/, ''));
    if (contact) return { text: (text.slice(0, at.index) + text.slice(at.index + at[0].length)).replace(/\s+/g, ' ').trim(), contact };
  }

  const names = [...contacts].sort((a, b) => b.name.length - a.name.length);
  for (const c of names) {
    for (const name of [c.name, c.name.split(/\s+/)[0]]) {
      const escName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`[،,]?\\s*(?:به|برای)\\s+${escName}\\s+(?:پیامک|اس ?ام ?اس|sms)\\s*(?:بده|بزن|کن|بفرست|ارسال کن)?(?:\\s+(?:و\\s+)?یادآوری کن)?`, 'i');
      const m = re.exec(text);
      if (m) return { text: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(), contact: c };
    }
  }
  return { text, contact: null };
}

/** متن پیامک یک کار؛ زمان نسبت به لحظهٔ ارسال بیان می‌شود (مثلاً «امروز ۱۰:۰۰») */
export function smsText(task, contact, settings, sendAt = new Date()) {
  if (task.smsMessage) return task.smsMessage;
  const when = task.due ? describeDue(task.due, task.hasTime, new Date(sendAt)) : 'به زودی';
  let msg = (settings.smsTemplate || DEFAULT_SMS_TEMPLATE)
    .replaceAll('{نام}', contact?.name || '')
    .replaceAll('{کار}', task.title)
    .replaceAll('{زمان}', when);
  if (settings.name && !msg.includes(settings.name)) msg += `\n${settings.name}`;
  return msg.replace(/ {2,}/g, ' ');
}
