// THOMSON SYSTEM – habit system built on the Four Laws of Behavior Change.
// All data lives in localStorage under STORAGE_KEY.

const STORAGE_KEY = 'thomson-system-v1';
const THEME_KEY = 'thomson-theme';
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TRACK_DAYS = 35;
const TREND_WEEKS = 12;
const BACKUP_EVERY = 14; // days before the backup nudge shows
const TEXT_FIELDS = ['name', 'identity', 'time', 'place', 'stack', 'bundle', 'twoMin', 'reward', 'cue', 'cost', 'friction', 'partner'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- State ----------

function defaultState() {
  return {
    habits: [{
      id: uid(), type: 'build', name: 'Read', identity: 'reads every day',
      time: '9:00 PM', place: 'in bed', stack: 'brush my teeth',
      bundle: 'a cup of herbal tea', twoMin: 'read one page', reward: 'tick it off in the tracker',
      days: [0, 1, 2, 3, 4, 5, 6], created: todayKey(), archived: null, remind: '21:00',
    }],
    log: {},
    skips: {},
    scorecard: [],
    lastBackup: null,
    backupSnooze: null,
  };
}

// Turns stored or imported data into a well-formed state, dropping anything malformed.
// Throws if there's no habits list at all.
function normalize(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.habits)) throw new Error('No habits list');
  const str = v => (typeof v === 'string' ? v : '');
  const date = v => (DATE_RE.test(v) ? v : null);
  const seen = new Set();
  const habits = data.habits.filter(h => h && typeof h === 'object' && str(h.name).trim()).map(h => {
    let id = str(h.id) || uid();
    while (seen.has(id)) id = uid();
    seen.add(id);
    const days = Array.isArray(h.days) ? [...new Set(h.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    const text = Object.fromEntries(TEXT_FIELDS.map(f => [f, str(h[f])]));
    return {
      ...text, id, type: h.type === 'break' ? 'break' : 'build',
      remind: /^\d{2}:\d{2}$/.test(h.remind) ? h.remind : '',
      days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
      created: date(h.created) || todayKey(), archived: date(h.archived),
    };
  });
  const dateSet = m => (m && typeof m === 'object'
    ? Object.fromEntries(Object.keys(m).filter(k => DATE_RE.test(k) && m[k]).map(k => [k, true])) : {});
  const perHabit = src => Object.fromEntries(habits.map(h => [h.id, dateSet(src?.[h.id])]));
  const log = perHabit(data.log), skips = perHabit(data.skips);
  // A habit can't start after its own history.
  for (const h of habits) {
    for (const k of [...Object.keys(log[h.id]), ...Object.keys(skips[h.id])]) if (k < h.created) h.created = k;
  }
  const scorecard = (Array.isArray(data.scorecard) ? data.scorecard : [])
    .filter(s => s && str(s.text).trim())
    .map(s => ({ id: str(s.id) || uid(), text: s.text, rating: ['+', '=', '-'].includes(s.rating) ? s.rating : null }));
  return {
    habits, log, skips, scorecard,
    lastBackup: date(data.lastBackup), backupSnooze: date(data.backupSnooze),
  };
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return defaultState(); }
  if (!raw) return defaultState();
  try { return normalize(JSON.parse(raw)); } catch (e) {
    // Keep the unreadable copy so the next save doesn't destroy it.
    try { localStorage.setItem(`${STORAGE_KEY}-unreadable-${Date.now()}`, raw); } catch (e2) { /* ignore */ }
    setTimeout(() => toast('Saved data was unreadable – a copy was kept, starting fresh'), 500);
    return defaultState();
  }
}

let state = load();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {
    toast('Could not save – storage is full or blocked. Export a backup now.');
  }
}

// Ask the browser not to evict our storage when space runs low.
navigator.storage?.persist?.().catch(() => { /* not supported */ });

// ---------- Dates ----------

function uid() { return Math.random().toString(36).slice(2, 10); }
function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function todayKey() { return keyOf(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 864e5); }
// Monday = 0 … Sunday = 6
function weekday(d) { return (d.getDay() + 6) % 7; }
function weekStart(d) { return addDays(d, -weekday(d)); }

// ---------- Habit logic ----------

const active = () => state.habits.filter(h => !h.archived);
const isScheduled = (h, d) => h.days.includes(weekday(d));
const isDone = (h, key) => !!state.log[h.id]?.[key];
const isSkipped = (h, key) => !!state.skips[h.id]?.[key];
// A day that counts toward streaks and rates: scheduled, not skipped, not before the habit existed.
function counts(h, d) {
  const k = keyOf(d);
  return k >= h.created && isScheduled(h, d) && !isSkipped(h, k);
}

// Marking a day before the habit's start date (backfilling) moves the start date back.
function backfill(h, key) { if (key < h.created) h.created = key; }

function toggle(h, key) {
  state.log[h.id] ??= {};
  if (state.log[h.id][key]) delete state.log[h.id][key];
  else {
    state.log[h.id][key] = true;
    delete state.skips[h.id]?.[key];
    backfill(h, key);
  }
  save();
}

function toggleSkip(h, key) {
  state.skips[h.id] ??= {};
  if (state.skips[h.id][key]) delete state.skips[h.id][key];
  else {
    state.skips[h.id][key] = true;
    delete state.log[h.id]?.[key];
    backfill(h, key);
  }
  save();
}

// Tracker cells cycle: empty → done → skipped → empty.
function cycleCell(h, key) {
  if (isDone(h, key)) { toggle(h, key); toggleSkip(h, key); }
  else if (isSkipped(h, key)) toggleSkip(h, key);
  else toggle(h, key);
}

// Consecutive counted days completed. Today not being done yet doesn't break the streak;
// skipped and unscheduled days are passed over.
function streak(h) {
  let n = 0;
  let d = new Date();
  if (counts(h, d) && !isDone(h, keyOf(d))) d = addDays(d, -1);
  for (let i = 0; i < 1500; i++, d = addDays(d, -1)) {
    const k = keyOf(d);
    if (k < h.created) break;
    if (!counts(h, d)) continue;
    if (isDone(h, k)) n++; else break;
  }
  return n;
}

function bestStreak(h) {
  const today = todayKey();
  let best = 0, run = 0;
  for (let d = parseKey(h.created); keyOf(d) <= today; d = addDays(d, 1)) {
    if (!counts(h, d)) continue;
    const k = keyOf(d);
    if (isDone(h, k)) best = Math.max(best, ++run);
    else if (k !== today) run = 0;
  }
  return best;
}

// "Never miss twice": was the last counted day before today missed?
function missedLast(h) {
  let d = addDays(new Date(), -1);
  for (let i = 0; i < 30; i++, d = addDays(d, -1)) {
    if (keyOf(d) < h.created) return false;
    if (counts(h, d)) return !isDone(h, keyOf(d));
  }
  return false;
}

// Counted days and completions between two dates, inclusive, never past today. Today only
// counts once it's done, so an unfinished today doesn't drag the rate down.
function tally(h, from, to) {
  let sched = 0, done = 0;
  const today = todayKey(), end = keyOf(to) < today ? keyOf(to) : today;
  for (let d = new Date(from); keyOf(d) <= end; d = addDays(d, 1)) {
    if (!counts(h, d)) continue;
    const k = keyOf(d), dn = isDone(h, k);
    if (k === today && !dn) continue;
    sched++;
    if (dn) done++;
  }
  return { sched, done };
}
const pct = ({ sched, done }) => (sched ? Math.round(done / sched * 100) : null);
function sumTally(hs, from, to) {
  return hs.map(h => tally(h, from, to)).reduce((a, t) => ({ sched: a.sched + t.sched, done: a.done + t.done }), { sched: 0, done: 0 });
}

function totalVotes(h) { return Object.keys(state.log[h.id] || {}).length; }

function intentionText(h) {
  if (h.type === 'break') {
    return `I avoid ${h.name.toLowerCase()}${h.time ? ` ${h.time}` : ''}${h.place ? ` ${h.place}` : ''}.`;
  }
  const action = h.name.toLowerCase();
  const min = h.twoMin ? ` Two-minute version: ${h.twoMin}.` : '';
  if (h.stack) return `After I ${h.stack}, I will ${action}${h.place ? ` ${h.place}` : ''}.${min}`;
  const parts = [h.time && `at ${h.time}`, h.place].filter(Boolean).join(' ');
  return `I will ${action}${parts ? ` ${parts}` : ''}.${min}`;
}

// Reads free-text times like "9:00 PM", "at 7am", "21:30" or "6.45" as "HH:MM"; null if it isn't a time.
function parseTime(s = '') {
  const m = s.trim().match(/^(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*([ap])?\.?\s*(?:m\.?)?$/i);
  if (!m) return null;
  let h = +m[1];
  const min = +(m[2] ?? 0), ap = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'p' ? 12 : 0); }
  else if (h > 23 || m[2] === undefined) return null; // a bare "9" is too ambiguous
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
const reminderTime = h => h.remind || parseTime(h.time);

// ---------- Calendar reminders (.ics) ----------

const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsStamp = d => `${keyOf(d).replace(/-/g, '')}T${[d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join('')}`;

// RFC 5545: lines longer than 75 octets continue on the next line, which starts with a space.
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function buildIcs(habits) {
  const now = new Date();
  const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//THOMSON SYSTEM//Habit reminders//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:THOMSON habits'];
  for (const h of habits) {
    const [hh, mm] = reminderTime(h).split(':').map(Number);
    // Start on the first scheduled day from today, so the first event is a real occurrence.
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
    for (let i = 0; i < 7 && !isScheduled(h, start); i++) start = addDays(start, 1);
    const title = h.type === 'break' ? `Avoid: ${h.name}` : h.name;
    const desc = [intentionText(h), h.identity && `I am someone who ${h.identity}.`, h.type === 'build' && h.reward && `Reward: ${h.reward}.`]
      .filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:thomson-${h.id}@thomson-system`, `DTSTAMP:${icsStamp(utc)}Z`,
      `DTSTART:${icsStamp(start)}`, 'DURATION:PT5M',
      `RRULE:FREQ=WEEKLY;BYDAY=${h.days.map(d => ICS_DAYS[d]).join(',')}`,
      `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(desc)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:PT0S', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

function exportCalendar() {
  const list = active().filter(reminderTime);
  if (!list.length) return toast('Give a habit a reminder time first (Edit → Reminder time)');
  const blob = new Blob([buildIcs(list)], { type: 'text/calendar;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'thomson-reminders.ics' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  const missing = active().length - list.length;
  toast(`${list.length} reminder${list.length > 1 ? 's' : ''} exported – open the file to add ${list.length > 1 ? 'them' : 'it'} to your calendar`
    + (missing ? ` (${missing} without a time skipped)` : ''));
}
$('#calendarBtn').onclick = exportCalendar;

// ---------- Rendering ----------

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

let renderedDay = null;

function render() {
  renderedDay = todayKey();
  renderToday();
  renderHabits();
  renderTracker();
  renderProgress();
  renderIdentity();
  renderScorecard();
  renderDataInfo();
}

// Re-render if the date changed while the app sat open or in the background.
function checkNewDay() {
  if (todayKey() === renderedDay) return false;
  render();
  return true;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewDay(); });
window.addEventListener('focus', checkNewDay);
window.addEventListener('pageshow', checkNewDay);
setInterval(checkNewDay, 60_000);

function emptyState(msg) {
  return `<div class="card empty"><p>${msg}</p><button class="btn primary" data-new>+ New habit</button></div>`;
}

function backupDue() {
  const today = todayKey();
  if (state.backupSnooze && state.backupSnooze > today) return false;
  const hasHistory = Object.values(state.log).some(l => Object.keys(l).length);
  if (!hasHistory) return false;
  if (state.lastBackup) return daysBetween(state.lastBackup, today) >= BACKUP_EVERY;
  const first = state.habits.reduce((m, h) => (h.created < m ? h.created : m), today);
  return daysBetween(first, today) >= 7;
}

function backupCard() {
  const since = state.lastBackup ? `Last backup was ${daysBetween(state.lastBackup, todayKey())} days ago.` : 'You have never backed up.';
  return `<div class="card nudge">
    <div><b>Back up your history</b><p class="muted">${since} Your data lives only in this browser – export a copy so a cleared browser can't erase your streaks.</p></div>
    <div class="row"><button class="btn primary sm" data-export>Export now</button><button class="btn sm" data-snooze>Later</button></div>
  </div>`;
}

function renderToday() {
  const now = new Date();
  $('#todayDate').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const key = todayKey();
  const list = active().filter(h => isScheduled(h, now));
  const counted = list.filter(h => !isSkipped(h, key));
  const done = counted.filter(h => isDone(h, key)).length;
  const p = counted.length ? Math.round(done / counted.length * 100) : 0;
  $('#ringPct').textContent = `${p}%`;
  $('#ringCount').textContent = `${done} / ${counted.length}`;
  $('#ringFg').style.strokeDashoffset = 326.7 * (1 - p / 100);

  const nudge = backupDue() ? backupCard() : '';
  if (!active().length) { $('#todayList').innerHTML = nudge + emptyState('No habits yet. Start with one tiny habit.'); return; }
  if (!list.length) { $('#todayList').innerHTML = `${nudge}<div class="card empty"><p>Nothing scheduled today. Rest well.</p></div>`; return; }

  $('#todayList').innerHTML = nudge + list.map(h => {
    const d = isDone(h, key);
    const sk = isSkipped(h, key);
    const s = streak(h);
    const warn = !d && !sk && missedLast(h);
    return `<div class="card habit-row ${sk ? 'skipped' : ''}">
      <button class="check ${h.type} ${d ? 'done' : ''}" data-toggle="${h.id}" title="${h.type === 'break' ? 'Avoided today' : 'Done'}" aria-label="${esc(h.name)}: ${d ? 'done' : 'not done'}" aria-pressed="${d}">✓</button>
      <div class="habit-body">
        <div class="habit-title">${esc(h.name)}</div>
        <p class="intention">${esc(intentionText(h))}</p>
        <div class="chips">
          ${sk ? '<span class="chip skip">Skipped today – streak is safe</span>' : ''}
          ${s ? `<span class="chip streak">🔥 ${s} streak</span>` : ''}
          ${warn ? '<span class="chip warn">Missed last time – never miss twice</span>' : ''}
          ${h.identity ? `<span class="chip">I am someone who ${esc(h.identity)}</span>` : ''}
          ${h.type === 'build' && h.reward ? `<span class="chip">Reward: ${esc(h.reward)}</span>` : ''}
          ${h.type === 'break' ? '<span class="chip tag-break">Break</span>' : ''}
        </div>
      </div>
      ${d ? '' : `<button class="btn sm ghost" data-skip="${h.id}" title="Rest or sick day – doesn't break the streak">${sk ? 'Unskip' : 'Skip'}</button>`}
    </div>`;
  }).join('');
}

function habitCard(h, i, list) {
  const fields = h.type === 'break'
    ? [['1 · Invisible', h.cue], ['2 · Unattractive', h.cost], ['3 · Difficult', h.friction], ['4 · Unsatisfying', h.partner]]
    : [['1 · Obvious', h.stack ? `After I ${h.stack}` : [h.time, h.place].filter(Boolean).join(', ')],
       ['2 · Attractive', h.bundle], ['3 · Easy (2 min)', h.twoMin], ['4 · Satisfying', h.reward]];
  const actions = h.archived
    ? `<button class="btn sm" data-restore="${h.id}">Restore</button><button class="btn sm" data-edit="${h.id}">Edit</button>`
    : `<button class="btn sm icon" data-move="${h.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
       <button class="btn sm icon" data-move="${h.id}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
       <button class="btn sm" data-edit="${h.id}">Edit</button>
       <button class="btn sm" data-archive="${h.id}" title="Hide it from Today and Tracker but keep its votes">Archive</button>`;
  return `<div class="card ${h.archived ? 'archived' : ''}">
    <div class="habit-title">${esc(h.name)}
      <span class="chip ${h.type === 'break' ? 'tag-break' : 'tag-build'}">${h.type === 'break' ? 'Break' : 'Build'}</span>
      <span class="chip">${h.days.length === 7 ? 'Every day' : h.days.map(d => DAY_NAMES[d]).join(' ')}</span>
      ${!h.archived && reminderTime(h) ? `<span class="chip">⏰ ${reminderTime(h)}</span>` : ''}
      ${h.archived ? `<span class="chip">Archived ${fmtDate(parseKey(h.archived))} · ${totalVotes(h)} votes kept</span>` : ''}
    </div>
    <p class="intention">${esc(intentionText(h))}</p>
    ${h.archived ? '' : `<div class="law-details">
      ${fields.map(([k, v]) => `<div><b>${k}</b>${v ? esc(v) : '<span class="muted">—</span>'}</div>`).join('')}
    </div>`}
    <div class="card-actions">${actions}</div>
  </div>`;
}

function renderHabits() {
  const list = active();
  const archived = state.habits.filter(h => h.archived);
  let html = list.length ? list.map((h, i) => habitCard(h, i, list)).join('') : emptyState('Design your first habit using the four laws.');
  if (archived.length) {
    html += `<details class="archived-list"><summary>Archived (${archived.length})</summary>
      <div class="cards">${archived.map((h, i) => habitCard(h, i, archived)).join('')}</div></details>`;
  }
  $('#habitList').innerHTML = html;
}

function renderTracker() {
  const list = active();
  if (!list.length) { $('#trackerGrid').innerHTML = emptyState('Add a habit to start tracking.'); return; }
  const today = new Date();
  const dates = Array.from({ length: TRACK_DAYS }, (_, i) => addDays(today, i - TRACK_DAYS + 1));
  const rows = list.map(h => {
    const cells = dates.map(d => {
      const k = keyOf(d);
      const on = isScheduled(h, d);
      const dn = isDone(h, k);
      const sk = isSkipped(h, k);
      const status = dn ? (h.type === 'break' ? 'avoided' : 'done') : sk ? 'skipped' : on ? 'not done' : 'not scheduled';
      const label = `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${status}`;
      return `<button class="cell ${h.type} ${dn ? 'done' : ''} ${sk ? 'skip' : ''} ${on ? '' : 'off'} ${k === todayKey() ? 'today' : ''}"
        data-cell="${h.id}" data-key="${k}" title="${label}" aria-label="${esc(h.name)}, ${label}"></button>`;
    }).join('');
    const rate = pct(tally(h, dates[0], today));
    return `<div class="tracker-row"><div class="tracker-name" title="${esc(h.name)}">${esc(h.name)}</div>
      <div class="tracker-cells">${cells}</div><div class="tracker-rate">${rate === null ? '–' : `${rate}%`}</div></div>`;
  }).join('');
  $('#trackerGrid').innerHTML = `<div class="tracker">${rows}</div>
    <div class="legend">
      <span><i class="cell done"></i>Done</span><span><i class="cell break done"></i>Avoided</span>
      <span><i class="cell skip"></i>Skipped</span><span><i class="cell"></i>Missed / open</span><span><i class="cell off"></i>Not scheduled</span>
    </div>`;
}

function trendBars(h) {
  const thisWeek = weekStart(new Date());
  const bars = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const from = addDays(thisWeek, (i - TREND_WEEKS + 1) * 7);
    const t = tally(h, from, addDays(from, 6));
    const p = pct(t);
    const label = `Week of ${fmtDate(from)}: ${p === null ? 'nothing scheduled' : `${t.done}/${t.sched} (${p}%)`}`;
    return `<span class="bar-slot" title="${label}" aria-label="${label}">${p === null ? '' : `<i style="height:${Math.max(p, 3)}%"></i>`}</span>`;
  }).join('');
  return `<div class="trend"><div class="trend-bars">${bars}</div>
    <div class="trend-axis"><span>${TREND_WEEKS} weeks ago</span><span>This week</span></div></div>`;
}

function renderProgress() {
  const list = active();
  if (!list.length) { $('#progressView').innerHTML = emptyState('Add a habit to see your progress.'); return; }
  const today = new Date();
  const mon = weekStart(today);
  const thisW = pct(sumTally(list, mon, today));
  const lastW = pct(sumTally(list, addDays(mon, -7), addDays(mon, -1)));
  const delta = thisW !== null && lastW !== null ? thisW - lastW : null;
  const streaks = list.map(h => ({ h, cur: streak(h), best: bestStreak(h) }));
  const topCur = streaks.reduce((a, b) => (b.cur > a.cur ? b : a));
  const topBest = streaks.reduce((a, b) => (b.best > a.best ? b : a));
  const votes = state.habits.reduce((a, h) => a + totalVotes(h), 0);
  const tile = (label, value, sub) => `<div class="tile"><small>${label}</small><strong>${value}</strong><span class="muted">${sub}</span></div>`;

  const tiles = `<div class="tiles">
    ${tile('This week', thisW === null ? '–' : `${thisW}%`, delta === null ? (lastW === null ? 'No data last week' : `Last week ${lastW}%`)
      : `<span class="${delta >= 0 ? 'good' : 'bad'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} pts</span> vs last week (${lastW}%)`)}
    ${tile('Current best streak', topCur.cur, topCur.cur ? esc(topCur.h.name) : 'Start one today')}
    ${tile('Longest streak ever', topBest.best, topBest.best ? esc(topBest.h.name) : '–')}
    ${tile('Votes cast', votes, 'Every completion, all habits')}
  </div>`;

  const cards = streaks.map(({ h, cur, best }) => {
    const r7 = pct(tally(h, addDays(today, -6), today));
    const r30 = pct(tally(h, addDays(today, -29), today));
    const all = pct(tally(h, parseKey(h.created), today));
    const stat = (label, v) => `<div><small>${label}</small><b>${v === null ? '–' : v}</b></div>`;
    return `<div class="card progress-card">
      <div class="habit-title">${esc(h.name)} ${h.type === 'break' ? '<span class="chip tag-break">Break</span>' : ''}</div>
      <div class="mini-stats">
        ${stat('Streak', cur)}${stat('Best', best)}
        ${stat('7 days', r7 === null ? null : `${r7}%`)}${stat('30 days', r30 === null ? null : `${r30}%`)}${stat('All time', all === null ? null : `${all}%`)}
      </div>
      ${trendBars(h)}
    </div>`;
  }).join('');

  $('#progressView').innerHTML = `${tiles}<h3 class="sub-head">Weekly completion by habit</h3><div class="cards">${cards}</div>`;
}

function renderIdentity() {
  const groups = {};
  for (const h of state.habits) {
    const id = (h.identity || '').trim();
    if (!id) continue;
    (groups[id] ??= []).push(h);
  }
  const entries = Object.entries(groups);
  if (!entries.length) {
    $('#identityList').innerHTML = '<div class="card empty"><p>Give your habits an identity ("I am the type of person who…") to see your votes here.</p></div>';
    return;
  }
  const max = Math.max(1, ...entries.map(([, hs]) => hs.reduce((a, h) => a + totalVotes(h), 0)));
  $('#identityList').innerHTML = entries.map(([id, hs]) => {
    const votes = hs.reduce((a, h) => a + totalVotes(h), 0);
    return `<div class="card identity-card">
      <h3><span>I am the type of person who</span> ${esc(id)}</h3>
      <div class="votes">${votes} <small class="muted" style="font-size:.9rem;font-weight:500">votes</small></div>
      <div class="bar"><i style="width:${votes / max * 100}%"></i></div>
      <div class="chips">${hs.map(h => `<span class="chip">${esc(h.name)} · ${totalVotes(h)}${h.archived ? ' · archived' : ''}</span>`).join('')}</div>
    </div>`;
  }).join('');
}

function renderScorecard() {
  $('#scoreList').innerHTML = state.scorecard.map(s => `<li>
    <span class="txt">${esc(s.text)}</span>
    <span class="rate">${['+', '=', '-'].map(r => `<button data-r="${r}" data-score="${s.id}" class="${s.rating === r ? 'on' : ''}">${r === '-' ? '−' : r}</button>`).join('')}</span>
    <button class="del" data-del-score="${s.id}" title="Remove">×</button>
  </li>`).join('');
  const c = r => state.scorecard.filter(s => s.rating === r).length;
  $('#scoreSummary').innerHTML = state.scorecard.length ? `
    <span style="background:var(--good-soft);color:var(--good)">+ ${c('+')} good</span>
    <span style="background:var(--surface-2);color:var(--neutral)">= ${c('=')} neutral</span>
    <span style="background:var(--bad-soft);color:var(--bad)">− ${c('-')} bad</span>` : '';
}

async function renderDataInfo() {
  const backup = state.lastBackup
    ? `Last backup: ${parseKey(state.lastBackup).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
    : 'Last backup: never.';
  let persisted = null;
  try { persisted = await navigator.storage?.persisted?.(); } catch (e) { /* unsupported */ }
  const storage = persisted === true ? ' Storage is protected from automatic clean-up.'
    : persisted === false ? ' The browser may clear this storage if space runs low – install the app and keep backups.' : '';
  $('#backupInfo').textContent = backup + storage;
}

// ---------- Habit dialog ----------

const dialog = $('#habitDialog');
const form = $('#habitForm');
let editingId = null;
let pickedDays = [];

function syncTypeFields() {
  const isBreak = form.type.value === 'break';
  $$('[data-build]', form).forEach(el => el.hidden = isBreak);
  $$('[data-break]', form).forEach(el => el.hidden = !isBreak);
}

function renderDays() {
  $('#daysPicker').innerHTML = DAY_NAMES.map((n, i) =>
    `<button type="button" data-day="${i}" class="${pickedDays.includes(i) ? 'on' : ''}">${n}</button>`).join('');
}

function openDialog(h) {
  editingId = h?.id ?? null;
  form.reset();
  $('#dialogTitle').textContent = h ? 'Edit habit' : 'New habit';
  $('#deleteHabitBtn').hidden = !h;
  if (h) {
    for (const el of form.elements) {
      if (!el.name || el.type === 'radio') continue;
      el.value = h[el.name] ?? '';
    }
    form.type.value = h.type;
    form.remind.value = reminderTime(h) || '';
  }
  pickedDays = h ? [...h.days] : [0, 1, 2, 3, 4, 5, 6];
  renderDays();
  syncTypeFields();
  dialog.showModal();
}

form.addEventListener('change', e => { if (e.target.name === 'type') syncTypeFields(); });
$('#daysPicker').addEventListener('click', e => {
  const b = e.target.closest('[data-day]');
  if (!b) return;
  const i = +b.dataset.day;
  pickedDays = pickedDays.includes(i) ? pickedDays.filter(x => x !== i) : [...pickedDays, i].sort();
  renderDays();
});

form.addEventListener('submit', e => {
  if (e.submitter?.value !== 'save') return;
  if (!pickedDays.length) { e.preventDefault(); toast('Pick at least one day'); return; }
  const data = Object.fromEntries(new FormData(form));
  for (const k in data) data[k] = data[k].trim();
  data.days = pickedDays;
  if (editingId) {
    Object.assign(state.habits.find(h => h.id === editingId), data);
    toast('Habit updated');
  } else {
    state.habits.push({ id: uid(), created: todayKey(), archived: null, ...data });
    toast(data.type === 'break' ? 'Make it invisible, unattractive, difficult.' : 'Start small. Show up. Never miss twice.');
  }
  save(); render();
});

$('#cancelBtn').onclick = () => dialog.close();
$('#deleteHabitBtn').onclick = () => {
  if (!confirm('Delete this habit and all its history permanently? Archiving it instead keeps its identity votes.')) return;
  state.habits = state.habits.filter(h => h.id !== editingId);
  delete state.log[editingId];
  delete state.skips[editingId];
  save(); render(); dialog.close();
};

// Swap a habit with its nearest active neighbour in the given direction.
function moveHabit(id, dir) {
  const hs = state.habits;
  const i = hs.findIndex(h => h.id === id);
  let j = i + dir;
  while (j >= 0 && j < hs.length && hs[j].archived) j += dir;
  if (j < 0 || j >= hs.length) return;
  [hs[i], hs[j]] = [hs[j], hs[i]];
  save(); render();
}

// ---------- Events ----------

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-new]');
  if (!t) return;
  if (t.matches('.tab')) {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${t.dataset.view}`));
    return;
  }
  if (t.dataset.new !== undefined || t.id === 'newHabitBtn') return openDialog();
  const habit = id => state.habits.find(h => h.id === id);
  if (t.dataset.edit) return openDialog(habit(t.dataset.edit));
  if (t.dataset.toggle || t.dataset.skip) {
    // The screen may still show yesterday; refresh instead of logging against the wrong list.
    if (checkNewDay()) return toast("It's a new day – today's list is refreshed");
    const h = habit(t.dataset.toggle || t.dataset.skip);
    if (t.dataset.skip) { toggleSkip(h, todayKey()); return render(); }
    toggle(h, todayKey());
    if (isDone(h, todayKey())) toast(h.identity ? `+1 vote: someone who ${h.identity}` : '+1 vote for who you are becoming');
    return render();
  }
  if (t.dataset.cell) {
    cycleCell(habit(t.dataset.cell), t.dataset.key);
    return render();
  }
  if (t.dataset.move) return moveHabit(t.dataset.move, +t.dataset.dir);
  if (t.dataset.archive) {
    habit(t.dataset.archive).archived = todayKey();
    save(); render();
    return toast('Archived – its votes still count on Identity');
  }
  if (t.dataset.restore) {
    habit(t.dataset.restore).archived = null;
    save(); render();
    return toast('Habit restored');
  }
  if (t.dataset.export !== undefined) return exportData();
  if (t.dataset.snooze !== undefined) {
    state.backupSnooze = keyOf(addDays(new Date(), 7));
    save(); return renderToday();
  }
  if (t.dataset.score) {
    const s = state.scorecard.find(x => x.id === t.dataset.score);
    s.rating = s.rating === t.dataset.r ? null : t.dataset.r;
    save(); return renderScorecard();
  }
  if (t.dataset.delScore) {
    state.scorecard = state.scorecard.filter(x => x.id !== t.dataset.delScore);
    save(); return renderScorecard();
  }
});

$('#scoreForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#scoreInput').value.trim();
  if (!text) return;
  state.scorecard.push({ id: uid(), text, rating: null });
  $('#scoreInput').value = '';
  save(); renderScorecard();
});

function exportData() {
  state.lastBackup = todayKey();
  state.backupSnooze = null;
  save();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `thomson-system-${todayKey()}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  render();
  toast('Backup exported');
}
$('#exportBtn').onclick = exportData;

$('#importInput').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try { data = normalize(JSON.parse(await file.text())); } catch { return toast('Invalid file – nothing was changed'); }
  const days = Object.values(data.log).reduce((a, l) => a + Object.keys(l).length, 0);
  if (!confirm(`Replace everything in this browser with the backup (${data.habits.length} habits, ${days} completions)?`)) return;
  state = data;
  save(); render(); toast('Data imported');
};
$('#resetBtn').onclick = () => {
  if (!confirm('Delete all habits, history and scorecard? This cannot be undone.')) return;
  state = { habits: [], log: {}, skips: {}, scorecard: [], lastBackup: null, backupSnooze: null };
  save(); render(); toast('Everything deleted');
};

// ---------- Theme & toast ----------

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch (e) { /* ignore */ }
$('#themeBtn').onclick = () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
};

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

render();

// ---------- PWA: offline + install ----------

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
}

const installBtn = $('#installBtn');
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
let installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  installBtn.hidden = false;
});
window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  toast('THOMSON installed');
});
if (isIOS && !isStandalone) installBtn.hidden = false;

installBtn.onclick = async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installBtn.hidden = true;
  } else if (isIOS) {
    $('#iosDialog').showModal();
  }
};
$('#iosClose').onclick = () => $('#iosDialog').close();
