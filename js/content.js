// Завантаження контенту. Тижні «відкриваються» за датою релізу — сайт сам додає нове щотижня.
import { todayISO, daysBetween, fmtDate } from './util.js';

let manifest;
const cache = new Map();
export const PREVIEW = new URLSearchParams(location.search).has('preview');

export async function getManifest() {
  if (!manifest) {
    const r = await fetch('content/index.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Не вдалося завантажити контент');
    manifest = await r.json();
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
    if (!w) throw new Error('Такого тижня немає');
    if (!isUnlocked(w)) throw Object.assign(new Error(`Цей тиждень відкриється ${fmtDate(w.release)} — щопонеділка з’являється новий.`), { locked: true });
    const r = await fetch(`content/weeks/${w.id}.${level.toLowerCase()}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Не вдалося завантажити тиждень');
    const data = await r.json();
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
  if (!toolkit) toolkit = await (await fetch('content/toolkit.json')).json();
  return toolkit;
}
