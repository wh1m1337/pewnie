// Мова інтерфейсу: 'uk' (за замовчуванням) або 'en'. Ключ перекладу — український оригінал.
// Зміна мови = збереження в localStorage + перезавантаження (модулі читають мову при запуску).
import EN from './i18n-en.js';

const KEY = 'pewnie.v1';
export const LANGS = { uk: 'Українська', en: 'English' };

function detect() {
  if (typeof document === 'undefined') return 'uk'; // Node (валідатор, скрипти)
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (s.lang in LANGS) return s.lang;
    const q = new URLSearchParams(location.search).get('lang');
    if (q in LANGS) return q;
  } catch { /* ignore */ }
  return 'uk';
}
export const lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = lang === 'en' ? 'en' : 'uk';

// tx('Текст {0}', значення) — підставляє {0}, {1}… після перекладу
export function tx(key, ...vars) {
  const s = lang === 'en' ? (EN[key] ?? key) : key;
  return vars.length ? s.replace(/\{(\d+)\}/g, (m, i) => vars[i] ?? '') : s;
}

export function setLang(l) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    s.lang = l;
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* ignore */ }
  location.reload();
}

// Накладка перекладів: плоска карта «шлях -> рядок» («speaking.0.tips.1») поверх завантаженого JSON
export function applyOverlay(obj, flat) {
  for (const [path, value] of Object.entries(flat || {})) {
    const keys = path.split('.');
    let node = obj;
    for (let i = 0; i < keys.length - 1 && node; i++) node = node[keys[i]];
    const last = keys[keys.length - 1];
    if (node && last in node && typeof node[last] === 'string') node[last] = value;
  }
  return obj;
}
