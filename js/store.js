// Прогрес живе в localStorage. Ніякого сервера — можна експортувати/імпортувати файлом.
import { isoDate, todayISO, addDays } from './util.js';

const KEY = 'pewnie.v1';

const DEFAULTS = () => ({
  v: 1,
  level: null,           // 'B1' | 'B2' — null => показати онбординг
  examDate: null,
  theme: 'auto',
  rate: 0.9,             // швидкість озвучення
  voice: null,           // ім'я польського голосу
  done: {},              // "weekId:skill:taskId" -> {ts, score, extra}
  drafts: {},            // taskId -> {text, ts}
  submissions: {},       // taskId -> [{ts,text,words,score}]
  notes: {},             // taskId -> текст нотаток до говоріння
  activity: {},          // 'YYYY-MM-DD' -> кількість дій
  vocab: {},             // "pl" -> {box, due}
  created: isoDate(),
});

let state;
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = { ...DEFAULTS(), ...(raw ? JSON.parse(raw) : {}) };
  } catch { state = DEFAULTS(); }
}
load();

export const get = () => state;
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* приватний режим — працюємо в пам'яті */ }
  subs.forEach((f) => f(state));
}

export function patch(obj) { Object.assign(state, obj); save(); }

export function bump() {
  const d = todayISO();
  state.activity[d] = (state.activity[d] || 0) + 1;
}

export function markDone(key, score, extra) {
  const prev = state.done[key];
  state.done[key] = { ts: Date.now(), score: score ?? null, best: Math.max(prev?.best ?? 0, score ?? 0), n: (prev?.n || 0) + 1, ...(extra || {}) };
  bump();
  save();
}

export const isDone = (key) => !!state.done[key];

export function saveDraft(id, text) {
  if (!text.trim()) delete state.drafts[id]; else state.drafts[id] = { text, ts: Date.now() };
  save();
}

export function addSubmission(id, sub) {
  const list = state.submissions[id] || [];
  list.unshift({ ts: Date.now(), ...sub });
  state.submissions[id] = list.slice(0, 6);
  save();
}

// Серія днів поспіль (сьогодні ще не зіпсувало серію, якщо вчора займався)
export function streak() {
  let d = todayISO(), n = 0;
  if (!state.activity[d]) d = addDays(d, -1);
  while (state.activity[d]) { n++; d = addDays(d, -1); }
  return n;
}

export function activityWeeks(weeks = 12) {
  const end = todayISO();
  const endDate = new Date(end + 'T00:00:00');
  const dow = (endDate.getDay() + 6) % 7; // пн=0
  const start = addDays(end, -(dow + 7 * (weeks - 1)));
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    cells.push({ d, n: state.activity[d] || 0, future: d > end });
  }
  return cells;
}

// Середній бал за навичкою для рівня (0–100)
export function skillScore(level, skill) {
  const vals = Object.entries(state.done)
    .filter(([k, v]) => k.includes(`:${level}:${skill}:`) && v.score != null)
    .map(([, v]) => v.score);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
export function skillCount(level, skill) {
  return Object.keys(state.done).filter((k) => k.includes(`:${level}:${skill}:`)).length;
}

export const taskKey = (weekId, level, skill, taskId) => `${weekId}:${level}:${skill}:${taskId}`;

// --- Leitner-картки для слів (інтервали в днях)
const BOX_DAYS = [0, 1, 2, 4, 8, 16];
export function vocabState(pl) { return state.vocab[pl]; }
export function vocabAnswer(pl, ok) {
  const cur = state.vocab[pl] || { box: 0 };
  const box = ok ? Math.min(5, cur.box + 1) : 1;
  state.vocab[pl] = { box, due: addDays(todayISO(), BOX_DAYS[box]) };
  bump();
  save();
}

export function exportJSON() { return JSON.stringify(state, null, 2); }
export function importJSON(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object' || obj.v !== 1) throw new Error('Це не файл Pewnie');
  state = { ...DEFAULTS(), ...obj };
  save();
}
export function reset() { state = DEFAULTS(); save(); }

export function applyTheme() {
  const t = state.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = dark ? '#14231E' : '#F5F0E1';
}
