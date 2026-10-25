// ذخیره‌سازی محلی (روی خود گوشی؛ بدون نیاز به اینترنت یا سرور)
import { addJalaliMonths } from './jalali.js';

const KEY = 'monshi.v1';

export const DEFAULT_SETTINGS = {
  name: '',
  defaultRemind: 10,     // دقیقه قبل از کارهای ساعت‌دار
  morningHour: 8,        // ساعت یادآوری کارهای بدون ساعت و گزارش صبحگاهی
  workStart: 8,
  workEnd: 18,
  sound: true,
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

export const state = Object.assign({ tasks: [], learned: {}, settings: { ...DEFAULT_SETTINGS }, meta: {} }, read() || {});
state.settings = { ...DEFAULT_SETTINGS, ...state.settings };

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* حافظه پر یا غیرفعال */ }
  listeners.forEach((fn) => fn());
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** زمان یادآوری را بر اساس موعد و تنظیمات محاسبه می‌کند */
export function computeRemindAt(task, settings = state.settings) {
  if (!task.due || task.remindOffset === null) return null;
  const due = new Date(task.due);
  const offset = task.remindOffset ?? (task.hasTime ? settings.defaultRemind : 0);
  if (task.hasTime) return new Date(due.getTime() - offset * 60000).toISOString();
  const d = new Date(due);
  d.setHours(settings.morningHour, 0, 0, 0);
  return new Date(d.getTime() - offset * 60000).toISOString();
}

export function addTask(data) {
  const task = {
    id: uid(), title: '', notes: '', category: 'personal', priority: 1,
    due: null, hasTime: false, duration: null, recurrence: null, remindOffset: undefined,
    done: false, doneAt: null, createdAt: new Date().toISOString(), postponeCount: 0, reminded: false,
    ...data,
  };
  if (task.due instanceof Date) task.due = task.due.toISOString();
  task.remindAt = computeRemindAt(task);
  state.tasks.push(task);
  save();
  return task;
}

export function updateTask(id, patch, { recompute = true } = {}) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return null;
  Object.assign(t, patch);
  if (t.due instanceof Date) t.due = t.due.toISOString();
  if (recompute) {
    const prev = t.remindAt;
    t.remindAt = computeRemindAt(t);
    if (t.remindAt !== prev) t.reminded = false;
  }
  save();
  return t;
}

export function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  save();
}

export function nextOccurrence(due, recurrence) {
  const d = new Date(due);
  if (recurrence === 'daily') d.setDate(d.getDate() + 1);
  else if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurrence === 'monthly') return addJalaliMonths(d, 1);
  else if (recurrence === 'yearly') return addJalaliMonths(d, 12);
  return d;
}

/** انجام شد؛ برای کارهای تکراری نوبت بعدی ساخته می‌شود */
export function completeTask(id, now = new Date()) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t || t.done) return null;
  t.done = true;
  t.doneAt = now.toISOString();
  let next = null;
  if (t.recurrence && t.due) {
    let nd = nextOccurrence(t.due, t.recurrence);
    while (nd < now && t.recurrence === 'daily') nd = nextOccurrence(nd, 'daily');
    const { id: _id, done, doneAt, createdAt, postponeCount, reminded, remindAt, ...rest } = t;
    next = addTask({ ...rest, due: nd.toISOString() });
  }
  save();
  return next;
}

export function uncompleteTask(id) {
  return updateTask(id, { done: false, doneAt: null }, { recompute: false });
}

/** به تعویق انداختن: تعداد تعویق‌ها برای تحلیل اهمال‌کاری ثبت می‌شود */
export function postponeTask(id, newDue, hasTime) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  updateTask(id, { due: newDue.toISOString(), hasTime: hasTime ?? t.hasTime, postponeCount: (t.postponeCount || 0) + 1, reminded: false });
}

export function snooze(id, minutes = 10) {
  updateTask(id, { remindAt: new Date(Date.now() + minutes * 60000).toISOString(), reminded: false }, { recompute: false });
}

export function exportData() {
  return JSON.stringify({ app: 'monshi', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importData(json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.tasks)) throw new Error('فایل پشتیبان معتبر نیست');
  state.tasks = data.tasks;
  state.learned = data.learned || {};
  state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  save();
}

export function clearAll() {
  state.tasks = [];
  state.learned = {};
  state.meta = {};
  save();
}
