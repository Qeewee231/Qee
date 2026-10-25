import { state, save, subscribe, addTask, updateTask, deleteTask, completeTask, uncompleteTask, postponeTask, snooze, exportData, importData, clearAll } from './store.js';
import { parseTask, describeDue } from './parser.js';
import { CATEGORIES, categoryById, classify, learn } from './classifier.js';
import { fa, formatJalali, formatTime, toJalali, WEEKDAYS, pad2 } from './jalali.js';
import { isOverdue, tasksOnDay, sortByTime, focusTask, insights, stats, peakHours, todaySummary, briefText, greeting, startOfDay } from './analytics.js';
import { startScheduler, requestPermission, notificationsSupported, notify, toICS, shareOrDownload, scheduleAhead } from './reminders.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const PRIORITY = ['کم‌اهمیت', 'معمولی', 'مهم', 'فوری'];
const RECURRENCE = { '': 'بدون تکرار', daily: 'هر روز', weekly: 'هر هفته', monthly: 'هر ماه (شمسی)', yearly: 'هر سال' };
const REMIND = [['none', 'بدون یادآوری'], ['0', 'سر وقت'], ['5', '۵ دقیقه قبل'], ['10', '۱۰ دقیقه قبل'], ['15', '۱۵ دقیقه قبل'], ['30', '۳۰ دقیقه قبل'], ['60', '۱ ساعت قبل'], ['120', '۲ ساعت قبل'], ['1440', '۱ روز قبل']];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

let currentView = 'today';
const filters = { cat: 'all', mode: 'upcoming', q: '' };

// ---------------- اجزای مشترک ----------------
function taskItem(t, { showDate = false } = {}) {
  const cat = categoryById(t.category);
  const now = new Date();
  const late = isOverdue(t, now);
  const info = [`<span>${cat.emoji} ${esc(cat.name)}</span>`];
  if (t.due && (showDate || late)) info.push(`<span class="${late ? 'late' : ''}">${late ? 'عقب‌افتاده · ' : ''}${esc(describeDue(t.due, t.hasTime, now))}</span>`);
  if (t.recurrence) info.push(`<span>🔁 ${RECURRENCE[t.recurrence]}</span>`);
  if (t.remindAt && !t.done) info.push('<span>🔔</span>');
  if (t.duration) info.push(`<span>⏳ ${fa(t.duration)} دقیقه</span>`);
  if (t.postponeCount >= 2 && !t.done) info.push(`<span>↪️ ${fa(t.postponeCount)} بار تعویق</span>`);
  if (t.priority >= 2 && !t.done) info.push(`<span class="flag">${PRIORITY[t.priority]}</span>`);
  return `<div class="task ${t.done ? 'done' : ''}" style="--cat:${cat.color}" data-id="${t.id}">
    <button class="check" data-act="toggle" aria-label="${t.done ? 'برگرداندن' : 'انجام شد'}">${t.done ? '✓' : ''}</button>
    <div class="body" data-act="edit"><div class="title">${esc(t.title)}</div><div class="info">${info.join('')}</div>${t.notes ? `<div class="info">📝 ${esc(t.notes.slice(0, 80))}</div>` : ''}</div>
    ${t.hasTime && !showDate ? `<div class="time">${formatTime(new Date(t.due))}</div>` : ''}
  </div>`;
}

const section = (title, list, opts) => (list.length ? `<h2>${title}<span class="count">${fa(list.length)}</span></h2>${list.map((t) => taskItem(t, opts)).join('')}` : '');

function insightHtml(i) {
  return `<div class="insight ${i.level}"><span class="ic">${i.icon}</span><div>${esc(i.text)}${i.action ? `<div><button data-insight="${i.action}">${esc(i.actionText)}</button></div>` : ''}</div></div>`;
}

// ---------------- نمای امروز ----------------
function renderToday() {
  const now = new Date();
  const tasks = state.tasks;
  const sum = todaySummary(tasks, now);
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
  const today = sortByTime(tasksOnDay(tasks, now));
  const overdue = sortByTime(tasks.filter((t) => isOverdue(t, now) && startOfDay(new Date(t.due)) < startOfDay(now)));
  const inbox = tasks.filter((t) => !t.done && !t.due).sort((a, b) => b.priority - a.priority);
  const focus = focusTask(tasks, now);
  const notes = insights(tasks, state.settings, now);
  const tomorrow = tasksOnDay(tasks, new Date(now.getTime() + 86400000)).filter((t) => !t.done);

  if (!tasks.length) {
    return `<div class="card brief"><b>${greeting(now)}! من منشی شما هستم 👋</b>
      <p>کارهایتان را همان‌طور که حرف می‌زنید بنویسید یا بگویید؛ من زمان، اولویت و دسته‌اش را تشخیص می‌دهم، سر وقت یادآوری می‌کنم و عملکردتان را تحلیل می‌کنم.</p></div>
      <h2>چند نمونه را امتحان کنید</h2>
      ${['فردا ساعت ۱۰ صبح جلسه با مدیر، فوری', 'هر روز ساعت ۸ شب قرص ویتامین', '۵ آبان پرداخت قسط وام، یک روز قبل یادم بنداز', 'پنجشنبه تولد مامان، کادو بخرم', 'ساعت ۵ عصر باشگاه به مدت ۲ ساعت']
        .map((s) => `<div class="insight"><span class="ic">💬</span><div>${esc(s)}<div><button data-example="${esc(s)}">امتحان کن</button></div></div></div>`).join('')}`;
  }

  let html = `<div class="card brief">
    <b>${greeting(now)}${state.settings.name ? '، ' + esc(state.settings.name) : ''}</b>
    <p>${esc(briefText(tasks, state.settings, now))}</p>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="meta"><span>پیشرفت امروز ${fa(pct)}٪</span><span>${tomorrow.length ? `فردا: ${fa(tomorrow.length)} کار` : ''}</span></div>
  </div>`;

  if (focus) {
    html += `<div class="card focus"><div class="label">🎯 پیشنهاد من: الان روی این تمرکز کنید</div>${taskItem(focus, { showDate: true })}</div>`;
  }
  if (notes.length) html += `<h2>یادداشت‌های منشی</h2>${notes.map(insightHtml).join('')}`;
  html += section('⏰ عقب‌افتاده', overdue, { showDate: true });
  html += today.length ? section('📅 برنامهٔ امروز', [...today.filter((t) => !t.done), ...today.filter((t) => t.done)]) : '<h2>📅 برنامهٔ امروز</h2><div class="empty">برای امروز کاری ندارید ☕</div>';
  html += section('📥 بدون زمان', inbox.slice(0, 6));
  return html;
}

// ---------------- نمای همهٔ کارها ----------------
function renderTasksShell() {
  return `<input class="search" id="search" type="search" placeholder="🔍 جستجو در کارها" value="${esc(filters.q)}">
    <div class="seg" id="modeSeg">${[['upcoming', 'پیش رو'], ['inbox', 'بدون زمان'], ['done', 'انجام‌شده'], ['all', 'همه']].map(([k, v]) => `<button data-mode="${k}" class="${filters.mode === k ? 'active' : ''}">${v}</button>`).join('')}</div>
    <div class="filters" id="catFilters"><button class="pill ${filters.cat === 'all' ? 'active' : ''}" data-cat="all">همه</button>${CATEGORIES.map((c) => `<button class="pill ${filters.cat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.emoji} ${c.name}</button>`).join('')}</div>
    <div id="taskList"></div>`;
}

function renderTaskList() {
  const now = new Date();
  let list = state.tasks.filter((t) => (filters.cat === 'all' || t.category === filters.cat));
  if (filters.q) list = list.filter((t) => (t.title + ' ' + t.notes).includes(filters.q.trim()));
  if (filters.mode === 'upcoming') list = list.filter((t) => !t.done && t.due);
  else if (filters.mode === 'inbox') list = list.filter((t) => !t.done && !t.due);
  else if (filters.mode === 'done') list = list.filter((t) => t.done).sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt));
  if (!list.length) return '<div class="empty"><div class="big">🗂️</div>کاری در این بخش نیست.</div>';
  if (filters.mode === 'inbox' || filters.mode === 'done') return list.map((t) => taskItem(t, { showDate: true })).join('');

  list = list.sort((a, b) => (a.due ? new Date(a.due) : Infinity) - (b.due ? new Date(b.due) : Infinity) || (a.hasTime ? -1 : 1));
  const groups = new Map();
  for (const t of list) {
    let key, label;
    if (!t.due) { key = 'z'; label = 'بدون زمان'; }
    else if (isOverdue(t, now) && startOfDay(new Date(t.due)) < startOfDay(now)) { key = '0'; label = '⏰ عقب‌افتاده'; }
    else {
      const d = startOfDay(new Date(t.due));
      key = String(d.getTime());
      const rel = describeDue(d, false, now);
      label = /امروز|فردا|دیروز/.test(rel) ? `${rel} — ${formatJalali(d)}` : formatJalali(d, { year: toJalali(d).jy !== toJalali(now).jy });
    }
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(t);
  }
  return [...groups.values()].map((g) => section(esc(g.label), g.items, { showDate: g.label.includes('عقب') })).join('');
}

// ---------------- نمای تحلیل ----------------
function renderStats() {
  const now = new Date();
  const s = stats(state.tasks, now);
  if (!state.tasks.length) return '<div class="empty"><div class="big">📊</div>بعد از ثبت و انجام چند کار، تحلیل عملکردتان اینجا نمایش داده می‌شود.</div>';
  const max7 = Math.max(1, ...s.last7.map((d) => Math.max(d.planned, d.done)));
  const maxH = Math.max(1, ...s.hours);
  const maxW = Math.max(1, ...s.weekdays);
  const peak = peakHours(s.hours);
  const order = [6, 0, 1, 2, 3, 4, 5]; // شنبه تا جمعه
  const bestDay = s.weekdays.some((x) => x) ? WEEKDAYS[s.weekdays.indexOf(Math.max(...s.weekdays))] : null;

  return `<div class="tiles">
      <div class="tile"><div class="v">${s.completionRate === null ? '—' : fa(s.completionRate) + '٪'}</div><div class="k">نرخ انجام کارهای ۷ روز اخیر</div></div>
      <div class="tile"><div class="v">${s.onTimeRate === null ? '—' : fa(s.onTimeRate) + '٪'}</div><div class="k">انجام به‌موقع</div></div>
      <div class="tile"><div class="v">${fa(s.doneWeek)}</div><div class="k">کار انجام‌شده در این هفته</div></div>
      <div class="tile"><div class="v">${fa(s.streak)} 🔥</div><div class="k">روزهای پیاپی فعال</div></div>
    </div>
    <h2>۷ روز اخیر</h2>
    <div class="card"><div class="bars">${s.last7.map((d) => `<div class="col"><div class="stack"><i style="height:${(d.planned / max7) * 100}%;background:var(--line)" title="برنامه"></i><i style="height:${(d.done / max7) * 100}%;background:var(--good)" title="انجام"></i></div>${['یک', 'دو', 'سه', 'چهار', 'پنج', 'جمعه', 'شنبه'][d.day.getDay()]}</div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--line)"></i>برنامه‌ریزی‌شده</span><span><i style="background:var(--good)"></i>انجام‌شده</span></div></div>
    <h2>دسته‌بندی کارها (۳۰ روز)</h2>
    <div class="card">${s.byCategory.map((c) => `<div class="hbar"><div class="row"><span>${c.emoji} ${c.name}</span><span>${fa(c.done)} از ${fa(c.total)}</span></div><div class="track"><i style="width:${(c.done / c.total) * 100}%;background:${c.color}"></i></div></div>`).join('') || '<div class="note">هنوز داده‌ای نیست.</div>'}</div>
    <h2>ساعت‌های پربازده</h2>
    <div class="card"><div class="hours">${s.hours.map((v) => `<i style="height:${(v / maxH) * 100}%"></i>`).join('')}</div><div class="hours-axis"><span>۰</span><span>۶</span><span>۱۲</span><span>۱۸</span><span>۲۳</span></div>
      <p class="note">${peak !== null ? `بیشترین کارها را بین ساعت ${fa(peak)} تا ${fa(peak + 2)} انجام می‌دهید.` : 'با انجام کارهای بیشتر، ساعت‌های طلایی‌تان مشخص می‌شود.'}${bestDay ? ` پرکارترین روز هفتهٔ شما: <b>${bestDay}</b>.` : ''}</p></div>
    <h2>روزهای هفته</h2>
    <div class="card">${order.map((i) => `<div class="hbar"><div class="row"><span>${WEEKDAYS[i]}</span><span>${fa(s.weekdays[i])}</span></div><div class="track"><i style="width:${(s.weekdays[i] / maxW) * 100}%;background:var(--primary)"></i></div></div>`).join('')}</div>
    ${s.postponed.length ? `<h2>کارهایی که مدام عقب می‌افتند</h2><p class="note">این‌ها را کوچک‌تر کنید، به کسی بسپارید یا اگر لازم نیستند حذف کنید.</p>${s.postponed.slice(0, 5).map((t) => taskItem(t, { showDate: true })).join('')}` : ''}
    <h2>جمع‌بندی منشی</h2>${insights(state.tasks, state.settings, now).map(insightHtml).join('') || '<div class="note">همه‌چیز مرتب است 👌</div>'}
    <p class="note">کل کارهای انجام‌شده: ${fa(s.doneTotal)} از ${fa(state.tasks.length)}</p>`;
}

// ---------------- تنظیمات ----------------
function renderSettings() {
  const st = state.settings;
  const perm = notificationsSupported() ? Notification.permission : 'unsupported';
  const permText = { granted: '✅ فعال', denied: '⛔ مسدود (از تنظیمات مرورگر فعال کنید)', default: 'غیرفعال', unsupported: 'این مرورگر پشتیبانی نمی‌کند' }[perm];
  const hours = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${fa(pad2(h))}:۰۰</option>`).join('');
  return `<div class="settings">
    <h2>شخصی</h2>
    <div class="card"><div class="field"><label for="sName">نام شما</label><input id="sName" data-setting="name" value="${esc(st.name)}" placeholder="مثلاً: علی"></div></div>
    <h2>یادآوری‌ها</h2>
    <div class="card">
      <div class="field"><label>اعلان‌های گوشی</label><span>${permText}</span></div>
      ${perm === 'default' ? '<button class="btn primary" data-action="perm" style="width:100%;margin-bottom:12px">فعال‌سازی اعلان‌ها</button>' : ''}
      <div class="field"><label for="sRemind">یادآوری پیش‌فرض</label><select id="sRemind" data-setting="defaultRemind" data-num>${REMIND.filter(([k]) => k !== 'none').map(([k, v]) => `<option value="${k}" ${+k === st.defaultRemind ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="sMorning">گزارش صبحگاهی و یادآوری کارهای بدون ساعت</label><select id="sMorning" data-setting="morningHour" data-num>${hours(st.morningHour)}</select></div>
      <div class="field"><label for="sSound">صدا و لرزش</label><input id="sSound" type="checkbox" data-setting="sound" ${st.sound ? 'checked' : ''} style="width:auto"></div>
      <p class="note">💡 برای اطمینان صددرصد از یادآوری حتی وقتی برنامه بسته است، کارها را با دکمهٔ زیر به تقویم گوشی هم اضافه کنید.</p>
      <button class="btn" data-action="ics-all" style="width:100%">📆 افزودن همهٔ کارهای پیش رو به تقویم گوشی</button>
    </div>
    <h2>ساعات کاری (برای تحلیل حجم کار)</h2>
    <div class="card">
      <div class="field"><label for="sStart">شروع</label><select id="sStart" data-setting="workStart" data-num>${hours(st.workStart)}</select></div>
      <div class="field"><label for="sEnd">پایان</label><select id="sEnd" data-setting="workEnd" data-num>${hours(st.workEnd)}</select></div>
    </div>
    <h2>داده‌ها</h2>
    <div class="card">
      <p class="note">همهٔ اطلاعات فقط روی همین گوشی ذخیره می‌شود. برای انتقال به گوشی دیگر یا اطمینان، پشتیبان بگیرید.</p>
      <div class="btns">
        <button class="btn" data-action="export">💾 پشتیبان‌گیری</button>
        <button class="btn" data-action="import">📂 بازیابی</button>
        <button class="btn danger" data-action="clear">🗑 پاک کردن همه</button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>
    <h2>راهنمای نوشتن کارها</h2>
    <div class="card note">
      <p>• زمان: «امروز، فردا، پس‌فردا، امشب، شنبه، ۱۲ آبان، ۱۴۰۵/۹/۱، ۳ روز دیگه، هفته بعد»</p>
      <p>• ساعت: «ساعت ۱۰»، «ساعت ۹:۳۰ صبح»، «۵ و نیم عصر»، «۲ ساعت دیگه»، «صبح / ظهر / عصر / شب»</p>
      <p>• تکرار: «هر روز»، «هر دوشنبه»، «هر ماه»، «روزانه»</p>
      <p>• اولویت: «فوری»، «مهم»، «اگه وقت شد» یا «!!!»</p>
      <p>• یادآوری: «۳۰ دقیقه قبل یادم بنداز»، «یک روز زودتر»</p>
      <p>• مدت: «به مدت ۲ ساعت» · دسته: «#مالی»</p>
      <p>• اگر دسته‌ای را اصلاح کنید، منشی یاد می‌گیرد و دفعهٔ بعد درست تشخیص می‌دهد.</p>
    </div>
  </div>`;
}

// ---------------- رندر کلی ----------------
function render() {
  const now = new Date();
  $('#hello').textContent = `${greeting(now)}${state.settings.name ? '، ' + state.settings.name : ''}`;
  $('#todayDate').textContent = formatJalali(now, { year: true });
  $('#bellBtn').classList.toggle('on', notificationsSupported() && Notification.permission === 'granted');
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === currentView));
  $('#quickAdd').hidden = currentView === 'settings' || currentView === 'stats';
  const view = $('#view');
  if (currentView === 'tasks') {
    if (view.dataset.view !== 'tasks') view.innerHTML = renderTasksShell();
    $('#taskList').innerHTML = renderTaskList();
  } else if (currentView !== 'settings' || view.dataset.view !== 'settings') {
    view.innerHTML = currentView === 'today' ? renderToday() : currentView === 'stats' ? renderStats() : renderSettings();
  }
  view.dataset.view = currentView;
  updateBadge();
}

function updateBadge() {
  if (!('setAppBadge' in navigator)) return;
  const n = state.tasks.filter((t) => !t.done && t.due && (isOverdue(t) || startOfDay(new Date(t.due)).getTime() === startOfDay(new Date()).getTime())).length;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

function setView(v) {
  currentView = v;
  $('#view').dataset.view = '';
  render();
  window.scrollTo({ top: 0 });
}

// ---------------- اعلان کوتاه ----------------
let toastTimer;
function toast(text, actionText, action, ms = 4500) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${actionText ? `<button>${esc(actionText)}</button>` : ''}`;
  el.hidden = false;
  if (actionText) el.querySelector('button').onclick = () => { el.hidden = true; action(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------------- ثبت سریع ----------------
const qaInput = $('#qaInput');
function updatePreview() {
  const text = qaInput.value.trim();
  if (!text) { $('#previewChips').innerHTML = ''; return; }
  const p = parseTask(text);
  const cat = categoryById(p.category || classify(p.title || text, state.learned));
  const chips = [...p.chips.map((c) => c.text), `${cat.emoji} ${cat.name}`];
  $('#previewChips').innerHTML = chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('');
}
qaInput.addEventListener('input', updatePreview);

$('#quickAdd').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = qaInput.value.trim();
  if (!text) return;
  const p = parseTask(text);
  const title = p.title || text;
  const task = addTask({
    title, due: p.due, hasTime: p.hasTime, priority: p.priority, recurrence: p.recurrence,
    remindOffset: p.remindOffset, duration: p.duration, category: p.category || classify(title, state.learned),
  });
  qaInput.value = '';
  updatePreview();
  const cat = categoryById(task.category);
  toast(`ثبت شد: ${task.title}${task.due ? ' · ' + describeDue(task.due, task.hasTime) : ''} · ${cat.name}`, 'ویرایش', () => openSheet(task.id));
  if (notificationsSupported() && Notification.permission === 'default' && task.remindAt) {
    setTimeout(() => toast('برای دریافت یادآوری، اعلان‌ها را فعال کنید', 'فعال‌سازی', enableNotifications, 8000), 4600);
  }
  scheduleAhead();
});

// ورودی صوتی
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const mic = $('#micBtn');
  mic.hidden = false;
  let rec = null;
  mic.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'fa-IR';
    rec.interimResults = true;
    rec.onresult = (e) => { qaInput.value = [...e.results].map((r) => r[0].transcript).join(' '); updatePreview(); };
    rec.onend = () => { mic.classList.remove('listening'); rec = null; qaInput.focus(); };
    rec.onerror = () => toast('ورودی صوتی در دسترس نیست');
    mic.classList.add('listening');
    rec.start();
  });
}

// ---------------- فرم ویرایش ----------------
function toDateInput(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function jalaliHint(value) {
  if (!value) return 'بدون تاریخ (در صندوق «بدون زمان»)';
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${formatJalali(date, { year: true })} — ${describeDue(date, false)}`;
}

function openSheet(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  const due = t.due ? new Date(t.due) : null;
  const remindVal = t.remindOffset === null ? 'none' : String(t.remindOffset ?? (t.hasTime ? state.settings.defaultRemind : 0));
  const sheet = $('#sheet');
  sheet.innerHTML = `<h3>${t.done ? '✅ ' : ''}ویرایش کار</h3>
    <div class="field"><label for="fTitle">عنوان</label><input id="fTitle" value="${esc(t.title)}"></div>
    <div class="row2">
      <div class="field"><label for="fDate">تاریخ</label><input id="fDate" type="date" value="${due ? toDateInput(due) : ''}"></div>
      <div class="field"><label for="fTime">ساعت</label><input id="fTime" type="time" value="${due && t.hasTime ? pad2(due.getHours()) + ':' + pad2(due.getMinutes()) : ''}"></div>
    </div>
    <div class="field" style="margin-top:-8px"><div class="hint" id="fDateHint">${esc(jalaliHint(due ? toDateInput(due) : ''))}</div>
      <div class="quick-dates">${[['0', 'امروز'], ['1', 'فردا'], ['2', 'پس‌فردا'], ['7', 'هفته بعد'], ['', 'بدون تاریخ']].map(([k, v]) => `<button type="button" class="pill" data-qd="${k}">${v}</button>`).join('')}</div></div>
    <div class="row2">
      <div class="field"><label for="fCat">دسته</label><select id="fCat">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === t.category ? 'selected' : ''}>${c.emoji} ${c.name}</option>`).join('')}</select></div>
      <div class="field"><label for="fPri">اولویت</label><select id="fPri">${PRIORITY.map((p, i) => `<option value="${i}" ${i === t.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    </div>
    <div class="row2">
      <div class="field"><label for="fRem">یادآوری</label><select id="fRem">${REMIND.map(([k, v]) => `<option value="${k}" ${k === remindVal ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="fRep">تکرار</label><select id="fRep">${Object.entries(RECURRENCE).map(([k, v]) => `<option value="${k}" ${k === (t.recurrence || '') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="fDur">مدت تقریبی</label><select id="fDur"><option value="">نامشخص</option>${DURATIONS.map((d) => `<option value="${d}" ${d === t.duration ? 'selected' : ''}>${d < 60 ? fa(d) + ' دقیقه' : fa(d / 60) + ' ساعت'}</option>`).join('')}</select></div>
    <div class="field"><label for="fNotes">یادداشت</label><textarea id="fNotes" rows="2">${esc(t.notes)}</textarea></div>
    <div class="btns"><button class="btn primary" data-s="save">ذخیره</button><button class="btn" data-s="toggle">${t.done ? 'برگرداندن' : '✓ انجام شد'}</button></div>
    ${t.done ? '' : `<div class="btns"><button class="btn ghost" data-s="p1h">⏱ ۱ ساعت بعد</button><button class="btn ghost" data-s="ptom">فردا</button><button class="btn ghost" data-s="pweek">هفته بعد</button></div>`}
    <div class="btns">${t.due && !t.done ? '<button class="btn ghost" data-s="ics">📆 افزودن به تقویم گوشی</button>' : ''}<button class="btn danger" data-s="delete">حذف</button></div>`;
  sheet.dataset.id = id;
  sheet.hidden = false;
  $('#sheetBackdrop').hidden = false;

  $('#fDate').addEventListener('input', (e) => { $('#fDateHint').textContent = jalaliHint(e.target.value); });
  sheet.querySelectorAll('[data-qd]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.qd;
    $('#fDate').value = v === '' ? '' : toDateInput(new Date(Date.now() + v * 86400000));
    if (v === '') $('#fTime').value = '';
    $('#fDateHint').textContent = jalaliHint($('#fDate').value);
  }));
}

function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
}

function readSheet(t) {
  const date = $('#fDate').value, time = $('#fTime').value;
  let due = null, hasTime = false;
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    due = new Date(y, m - 1, d);
    if (time) { const [h, mi] = time.split(':').map(Number); due.setHours(h, mi); hasTime = true; }
  } else if (time) {
    const [h, mi] = time.split(':').map(Number);
    due = new Date(); due.setHours(h, mi, 0, 0); hasTime = true;
  }
  const rem = $('#fRem').value;
  return {
    title: $('#fTitle').value.trim() || t.title, notes: $('#fNotes').value.trim(),
    due: due ? due.toISOString() : null, hasTime, category: $('#fCat').value, priority: +$('#fPri').value,
    recurrence: $('#fRep').value || null, remindOffset: rem === 'none' ? null : +rem, duration: $('#fDur').value ? +$('#fDur').value : null,
  };
}

$('#sheet').addEventListener('click', (e) => {
  const act = e.target.closest('[data-s]')?.dataset.s;
  if (!act) return;
  const id = $('#sheet').dataset.id;
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return closeSheet();
  if (act === 'save') {
    const patch = readSheet(t);
    if (patch.category !== t.category) { learn(state.learned, patch.title, patch.category); toast('دسته اصلاح شد؛ یاد گرفتم 👍'); }
    const moved = t.due && patch.due && new Date(patch.due) > new Date(t.due) && startOfDay(new Date(patch.due)) > startOfDay(new Date(t.due));
    updateTask(id, { ...patch, postponeCount: (t.postponeCount || 0) + (moved ? 1 : 0) });
    scheduleAhead();
  } else if (act === 'toggle') toggleTask(id);
  else if (act === 'delete') {
    const copy = { ...t };
    deleteTask(id);
    toast('حذف شد', 'بازگردانی', () => { state.tasks.push(copy); save(); });
  } else if (act === 'p1h') postponeTask(id, new Date(Date.now() + 3600000), true);
  else if (act === 'ptom' || act === 'pweek') {
    const base = t.due ? new Date(t.due) : new Date();
    const nd = new Date(Math.max(startOfDay(new Date()).getTime(), startOfDay(base).getTime()));
    nd.setDate(nd.getDate() + (act === 'ptom' ? 1 : 7));
    if (t.hasTime) nd.setHours(base.getHours(), base.getMinutes());
    postponeTask(id, nd);
    toast(`منتقل شد به ${describeDue(nd, t.hasTime)}`);
  } else if (act === 'ics') {
    shareOrDownload(toICS([t]), 'task.ics', 'text/calendar');
    return;
  }
  closeSheet();
});
$('#sheetBackdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  if (t.done) { uncompleteTask(id); return; }
  const next = completeTask(id);
  navigator.vibrate?.(30);
  toast(next ? `انجام شد ✓ نوبت بعدی: ${describeDue(next.due, next.hasTime)}` : 'انجام شد ✓ آفرین!', 'برگرداندن', () => {
    uncompleteTask(id);
    if (next) deleteTask(next.id);
  });
}

// ---------------- رویدادهای کلی ----------------
$('#view').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-insight],[data-example],[data-mode],[data-cat],[data-action]');
  if (!el) return;
  const id = el.closest('[data-id]')?.dataset.id;
  if (el.dataset.act === 'toggle') toggleTask(id);
  else if (el.dataset.act === 'edit') openSheet(id);
  else if (el.dataset.example) { qaInput.value = el.dataset.example; updatePreview(); qaInput.focus(); }
  else if (el.dataset.mode) { filters.mode = el.dataset.mode; $('#view').dataset.view = ''; render(); }
  else if (el.dataset.cat) { filters.cat = el.dataset.cat; $('#view').dataset.view = ''; render(); }
  else if (el.dataset.insight) runInsightAction(el.dataset.insight);
  else if (el.dataset.action) runSettingsAction(el.dataset.action);
});

$('#view').addEventListener('input', (e) => {
  if (e.target.id === 'search') { filters.q = e.target.value; $('#taskList').innerHTML = renderTaskList(); }
});
$('#view').addEventListener('change', (e) => {
  const key = e.target.dataset.setting;
  if (key) {
    state.settings[key] = e.target.type === 'checkbox' ? e.target.checked : 'num' in e.target.dataset ? +e.target.value : e.target.value;
    if (key === 'defaultRemind' || key === 'morningHour') {
      state.tasks.forEach((t) => { if (!t.done) updateTask(t.id, {}, { recompute: true }); });
    }
    save();
  }
  if (e.target.id === 'importFile' && e.target.files[0]) {
    e.target.files[0].text().then((txt) => { importData(txt); toast('اطلاعات بازیابی شد ✓'); }).catch((err) => toast('خطا: ' + err.message));
  }
});

function runInsightAction(action) {
  const now = new Date();
  if (action === 'reschedule-overdue') {
    for (const t of state.tasks.filter((x) => isOverdue(x, now))) {
      const d = new Date(t.due);
      const nd = startOfDay(now);
      let hasTime = false;
      if (t.hasTime) { nd.setHours(d.getHours(), d.getMinutes()); hasTime = nd > now; if (!hasTime) nd.setHours(0, 0); }
      postponeTask(t.id, nd, hasTime);
    }
    toast('کارهای عقب‌افتاده به امروز منتقل شدند');
  } else if (action === 'defer-low') {
    const low = tasksOnDay(state.tasks, now).filter((t) => !t.done && t.priority <= 1);
    for (const t of low) { const d = new Date(t.due); d.setDate(d.getDate() + 1); postponeTask(t.id, d); }
    toast(`${fa(low.length)} کار کم‌اهمیت به فردا منتقل شد`);
  }
}

function runSettingsAction(action) {
  if (action === 'perm') enableNotifications();
  else if (action === 'export') shareOrDownload(exportData(), `monshi-backup-${toDateInput(new Date())}.json`, 'application/json');
  else if (action === 'import') $('#importFile').click();
  else if (action === 'ics-all') {
    const list = state.tasks.filter((t) => !t.done && t.due);
    if (!list.length) return toast('کار زمان‌داری برای افزودن نیست');
    shareOrDownload(toICS(list), 'monshi-tasks.ics', 'text/calendar');
  } else if (action === 'clear') {
    if (confirm('همهٔ کارها و تحلیل‌ها پاک شوند؟ این کار برگشت‌پذیر نیست.')) { clearAll(); toast('همه‌چیز پاک شد'); }
  }
}

async function enableNotifications() {
  const r = await requestPermission();
  if (r === 'granted') { toast('اعلان‌ها فعال شد ✓'); notify('منشی من', { body: 'از این به بعد سر وقت خبرتان می‌کنم 🔔', dir: 'rtl', lang: 'fa', icon: 'icons/icon-192.png' }); scheduleAhead(); }
  else if (r === 'denied') toast('اجازهٔ اعلان داده نشد. از تنظیمات مرورگر آن را فعال کنید.');
  else if (r === 'unsupported') toast('این مرورگر اعلان را پشتیبانی نمی‌کند. برنامه را به صفحهٔ اصلی اضافه کنید.');
  $('#view').dataset.view = '';
  render();
}
$('#bellBtn').addEventListener('click', enableNotifications);

$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (b) setView(b.dataset.view);
});

// پیام‌های سرویس‌ورکر (دکمه‌های داخل اعلان)
function handleNotificationAction(action, id) {
  if (!id) return;
  if (action === 'done') { completeTask(id); toast('از روی اعلان انجام شد ✓'); }
  else if (action === 'snooze') { snooze(id, 10); toast('۱۰ دقیقهٔ دیگر دوباره یادآوری می‌کنم'); }
  else openSheet(id);
}
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'notification') handleNotificationAction(e.data.action, e.data.id);
});
const params = new URLSearchParams(location.search);
if (params.get('task')) {
  setTimeout(() => handleNotificationAction(params.get('action'), params.get('task')), 300);
  history.replaceState(null, '', location.pathname);
}

// ---------------- راه‌اندازی ----------------
subscribe(() => {
  if (currentView === 'settings') return; // جلوگیری از پرش فرم تنظیمات هنگام تایپ
  render();
});
render();
startScheduler((task) => {
  if (task) {
    toast(`🔔 ${task.title}`, 'انجام شد', () => completeTask(task.id), 10000);
  } else {
    const text = briefText(state.tasks, state.settings);
    notify(`${greeting()}! گزارش امروز`, { body: text, tag: 'brief', dir: 'rtl', lang: 'fa', icon: 'icons/icon-192.png' });
  }
  render();
});
setInterval(render, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
