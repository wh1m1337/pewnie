// Завантаження контенту. Тижні «відкриваються» за датою релізу — сайт сам додає нове щотижня.
import { todayISO, daysBetween, fmtDate } from './util.js';

import { tx, lang, applyOverlay } from './i18n.js';

// англійська «накладка» (плоска карта шлях -> рядок); якщо файлу немає — лишається українська
async function overlay(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : {}; } catch { return {}; }
}
let manifest;
const cache = new Map();
export const PREVIEW = new URLSearchParams(location.search).has('preview');

export async function getManifest() {
  if (!manifest) {
    const r = await fetch('content/index.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(tx('Не вдалося завантажити контент'));
    manifest = await r.json();
    if (lang === 'en') applyOverlay(manifest, await overlay('content/index.en.json'));
    manifest.weeks.sort((a, b) => a.release.localeCompare(b.release));
  }
  return manifest;
}

export const isUnlocked = (w) => PREVIEW || w.release <= todayISO();

export async function getWeeks() {
  const m = await getManifest();
  return m.weeks.map((w) => ({ ...w, unlocked: isUnlocked(w) }));
}

export async function nextRelease() {
  const weeks = await getWeeks();
  const next = weeks.find((w) => !w.unlocked);
  if (!next) return null;
  return { ...next, inDays: daysBetween(todayISO(), next.release) };
}

export async function loadWeek(id, level) {
  const key = `${id}:${level}`;
  if (!cache.has(key)) {
    const weeks = await getWeeks();
    const w = weeks.find((x) => x.id === id);
    if (!w) throw new Error(tx('Такого тижня немає'));
    if (!isUnlocked(w)) throw Object.assign(new Error(tx('Цей тиждень відкриється {0} — щопонеділка з’являється новий.', fmtDate(w.release))), { locked: true });
    const r = await fetch(`content/weeks/${w.id}.${level.toLowerCase()}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(tx('Не вдалося завантажити тиждень'));
    const data = await r.json();
    if (lang === 'en') applyOverlay(data, await overlay(`content/weeks/${w.id}.${level.toLowerCase()}.en.json`));
    cache.set(key, { ...w, ...data, level });
  }
  return cache.get(key);
}

// Усі відкриті завдання навички для рівня — для розділів «Мовлення» та «Письмо»
export async function loadAllUnlocked(level) {
  const weeks = (await getWeeks()).filter((w) => w.unlocked);
  return Promise.all(weeks.map((w) => loadWeek(w.id, level)));
}

let toolkit;
export async function getToolkit() {
  if (!toolkit) {
    toolkit = await (await fetch('content/toolkit.json')).json();
    if (lang === 'en') applyOverlay(toolkit, await overlay('content/toolkit.en.json'));
  }
  return toolkit;
}
