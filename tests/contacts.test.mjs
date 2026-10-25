import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractContact, normalizePhone, smsText } from '../js/contacts.js';

const contacts = [{ id: 'a', name: 'علی رضایی', phone: '09121234567' }, { id: 'b', name: 'مریم', phone: '09351112233' }];

test('نرمال‌سازی شماره', () => {
  assert.equal(normalizePhone('۰۹۱۲ ۱۲۳ ۴۵۶۷'), '09121234567');
  assert.equal(normalizePhone('9121234567'), '09121234567');
  assert.equal(normalizePhone('+98 912-123-4567'), '+989121234567');
  assert.equal(normalizePhone('abc'), null);
});

test('تشخیص مخاطب در متن', () => {
  let r = extractContact('فردا ساعت ۹ تحویل گزارش @علی', contacts);
  assert.equal(r.contact.id, 'a');
  assert.equal(r.text, 'فردا ساعت ۹ تحویل گزارش');
  r = extractContact('فردا ساعت ۱۰ دندانپزشکی، به مریم پیامک بده', contacts);
  assert.equal(r.contact.id, 'b');
  assert.equal(r.text, 'فردا ساعت ۱۰ دندانپزشکی');
  r = extractContact('پرداخت قسط برای علی رضایی اس ام اس کن', contacts);
  assert.equal(r.contact.id, 'a');
  assert.equal(r.text, 'پرداخت قسط');
  r = extractContact('جلسه با علی', contacts);
  assert.equal(r.contact, null);
});

test('متن پیامک زمان را نسبت به لحظهٔ ارسال می‌گوید', () => {
  const task = { title: 'تحویل گزارش', due: new Date(2026, 9, 26, 10, 0).toISOString(), hasTime: true };
  const msg = smsText(task, contacts[1], { smsTemplate: 'سلام {نام}، یادآوری: «{کار}» — {زمان}.', name: '' }, new Date(2026, 9, 26, 9, 50));
  assert.equal(msg, 'سلام مریم، یادآوری: «تحویل گزارش» — امروز ۱۰:۰۰.');
});
