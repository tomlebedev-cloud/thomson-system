// THOMSON SYSTEM – habit system built on the Four Laws of Behavior Change.
// All data lives in localStorage under STORAGE_KEY.

const STORAGE_KEY = 'thomson-system-v1';
const THEME_KEY = 'thomson-theme';
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TRACK_DAYS = 35;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- State ----------

function defaultState() {
  return {
    habits: [{
      id: uid(), type: 'build', name: 'Read', identity: 'reads every day',
      time: '9:00 PM', place: 'in bed', stack: 'brush my teeth',
      bundle: 'a cup of herbal tea', twoMin: 'read one page', reward: 'tick it off in the tracker',
      days: [0, 1, 2, 3, 4, 5, 6], created: todayKey(),
    }],
    log: {},
    scorecard: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { habits: [], log: {}, scorecard: [], ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  return defaultState();
}

let state = load();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

// ---------- Dates ----------

function uid() { return Math.random().toString(36).slice(2, 10); }
function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayKey() { return keyOf(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
// Monday = 0 … Sunday = 6
function weekday(d) { return (d.getDay() + 6) % 7; }

// ---------- Habit logic ----------

const isScheduled = (h, d) => h.days.includes(weekday(d));
const isDone = (h, key) => !!state.log[h.id]?.[key];

function toggle(h, key) {
  state.log[h.id] ??= {};
  if (state.log[h.id][key]) delete state.log[h.id][key];
  else state.log[h.id][key] = true;
  save();
}

// Consecutive scheduled days completed. Today not being done yet doesn't break the streak.
function streak(h) {
  let n = 0;
  let d = new Date();
  if (isScheduled(h, d) && !isDone(h, keyOf(d))) d = addDays(d, -1);
  for (let i = 0; i < 730; i++, d = addDays(d, -1)) {
    if (keyOf(d) < h.created) break;
    if (!isScheduled(h, d)) continue;
    if (isDone(h, keyOf(d))) n++; else break;
  }
  return n;
}

// "Never miss twice": was the last scheduled day before today missed?
function missedLast(h) {
  let d = addDays(new Date(), -1);
  for (let i = 0; i < 14; i++, d = addDays(d, -1)) {
    if (keyOf(d) < h.created) return false;
    if (isScheduled(h, d)) return !isDone(h, keyOf(d));
  }
  return false;
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

// ---------- Rendering ----------

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render() {
  renderToday();
  renderHabits();
  renderTracker();
  renderIdentity();
  renderScorecard();
}

function emptyState(msg) {
  return `<div class="card empty"><p>${msg}</p><button class="btn primary" data-new>+ New habit</button></div>`;
}

function renderToday() {
  const now = new Date();
  $('#todayDate').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const key = todayKey();
  const list = state.habits.filter(h => isScheduled(h, now));
  const done = list.filter(h => isDone(h, key)).length;
  const pct = list.length ? Math.round(done / list.length * 100) : 0;
  $('#ringPct').textContent = `${pct}%`;
  $('#ringCount').textContent = `${done} / ${list.length}`;
  $('#ringFg').style.strokeDashoffset = 326.7 * (1 - pct / 100);

  if (!state.habits.length) { $('#todayList').innerHTML = emptyState('No habits yet. Start with one tiny habit.'); return; }
  if (!list.length) { $('#todayList').innerHTML = '<div class="card empty"><p>Nothing scheduled today. Rest well.</p></div>'; return; }

  $('#todayList').innerHTML = list.map(h => {
    const d = isDone(h, key);
    const s = streak(h);
    const warn = !d && missedLast(h);
    return `<div class="card habit-row">
      <button class="check ${h.type} ${d ? 'done' : ''}" data-toggle="${h.id}" title="${h.type === 'break' ? 'Avoided today' : 'Done'}">✓</button>
      <div class="habit-body">
        <div class="habit-title">${esc(h.name)}</div>
        <p class="intention">${esc(intentionText(h))}</p>
        <div class="chips">
          ${s ? `<span class="chip streak">🔥 ${s} streak</span>` : ''}
          ${warn ? '<span class="chip warn">Missed last time – never miss twice</span>' : ''}
          ${h.identity ? `<span class="chip">I am someone who ${esc(h.identity)}</span>` : ''}
          ${h.type === 'build' && h.reward ? `<span class="chip">Reward: ${esc(h.reward)}</span>` : ''}
          ${h.type === 'break' ? '<span class="chip tag-break">Break</span>' : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderHabits() {
  if (!state.habits.length) { $('#habitList').innerHTML = emptyState('Design your first habit using the four laws.'); return; }
  $('#habitList').innerHTML = state.habits.map(h => {
    const fields = h.type === 'break'
      ? [['1 · Invisible', h.cue], ['2 · Unattractive', h.cost], ['3 · Difficult', h.friction], ['4 · Unsatisfying', h.partner]]
      : [['1 · Obvious', h.stack ? `After I ${h.stack}` : [h.time, h.place].filter(Boolean).join(', ')],
         ['2 · Attractive', h.bundle], ['3 · Easy (2 min)', h.twoMin], ['4 · Satisfying', h.reward]];
    return `<div class="card">
      <div class="habit-title">${esc(h.name)}
        <span class="chip ${h.type === 'break' ? 'tag-break' : 'tag-build'}">${h.type === 'break' ? 'Break' : 'Build'}</span>
        <span class="chip">${h.days.length === 7 ? 'Every day' : h.days.map(i => DAY_NAMES[i]).join(' ')}</span>
      </div>
      <p class="intention">${esc(intentionText(h))}</p>
      <div class="law-details">
        ${fields.map(([k, v]) => `<div><b>${k}</b>${v ? esc(v) : '<span class="muted">—</span>'}</div>`).join('')}
      </div>
      <div class="card-actions"><button class="btn sm" data-edit="${h.id}">Edit</button></div>
    </div>`;
  }).join('');
}

function renderTracker() {
  if (!state.habits.length) { $('#trackerGrid').innerHTML = emptyState('Add a habit to start tracking.'); return; }
  const today = new Date();
  const dates = Array.from({ length: TRACK_DAYS }, (_, i) => addDays(today, i - TRACK_DAYS + 1));
  const rows = state.habits.map(h => {
    let sched = 0, done = 0;
    const cells = dates.map(d => {
      const k = keyOf(d);
      const on = isScheduled(h, d);
      const dn = isDone(h, k);
      if (on && k >= h.created) { sched++; if (dn) done++; }
      return `<button class="cell ${h.type} ${dn ? 'done' : ''} ${on ? '' : 'off'} ${k === todayKey() ? 'today' : ''}"
        data-cell="${h.id}" data-key="${k}" title="${d.toLocaleDateString('en-GB')}"></button>`;
    }).join('');
    const rate = sched ? Math.round(done / sched * 100) : 0;
    return `<div class="tracker-row"><div class="tracker-name" title="${esc(h.name)}">${esc(h.name)}</div>
      <div class="tracker-cells">${cells}</div><div class="tracker-rate">${rate}%</div></div>`;
  }).join('');
  $('#trackerGrid').innerHTML = `<div class="tracker">${rows}</div>`;
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
      <div class="chips">${hs.map(h => `<span class="chip">${esc(h.name)} · ${totalVotes(h)}</span>`).join('')}</div>
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
    state.habits.push({ id: uid(), created: todayKey(), ...data });
    toast(data.type === 'break' ? 'Make it invisible, unattractive, difficult.' : 'Start small. Show up. Never miss twice.');
  }
  save(); render();
});

$('#cancelBtn').onclick = () => dialog.close();
$('#deleteHabitBtn').onclick = () => {
  if (!confirm('Delete this habit and its history?')) return;
  state.habits = state.habits.filter(h => h.id !== editingId);
  delete state.log[editingId];
  save(); render(); dialog.close();
};

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
  if (t.dataset.edit) return openDialog(state.habits.find(h => h.id === t.dataset.edit));
  if (t.dataset.toggle) {
    const h = state.habits.find(x => x.id === t.dataset.toggle);
    toggle(h, todayKey());
    if (isDone(h, todayKey())) toast(h.identity ? `+1 vote: someone who ${h.identity}` : '+1 vote for who you are becoming');
    return render();
  }
  if (t.dataset.cell) {
    toggle(state.habits.find(x => x.id === t.dataset.cell), t.dataset.key);
    return render();
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

$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `thomson-system-${todayKey()}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
};
$('#importInput').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.habits)) throw new Error();
    state = { habits: [], log: {}, scorecard: [], ...data };
    save(); render(); toast('Data imported');
  } catch { toast('Invalid file'); }
  e.target.value = '';
};
$('#resetBtn').onclick = () => {
  if (!confirm('Delete all habits, history and scorecard? This cannot be undone.')) return;
  state = { habits: [], log: {}, scorecard: [] };
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
