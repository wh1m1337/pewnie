// Дрібні хелпери: DOM, дати, іконки, тости.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}

// **жирний** у рядках контенту -> <strong>
export function rich(text) {
  const frag = document.createDocumentFragment();
  String(text ?? '').split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (part.startsWith('**') && part.endsWith('**')) frag.append(h('strong', null, part.slice(2, -2)));
    else if (part) frag.append(part);
  });
  return frag;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => (new URLSearchParams(location.search).get('today')) || isoDate();
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d); };

const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
export const fmtDate = (s) => { const d = parseISO(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export const fmtTime = (sec) => {
  sec = Math.max(0, Math.round(sec));
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
};

// українська множина: plural(3, ['день','дні','днів'])
export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const wordList = (t) => t.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [];
export const wordCount = (t) => wordList(t).length;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3 M9 21h6',
  pen: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  cal: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5',
  cards: 'M4 8h12v12H4z M8 4h12v12',
  book: 'M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z M4 20a2 2 0 0 1 2-2h13',
  chart: 'M4 20V11 M10 20V4 M16 20v-6 M22 20H2',
  abc: 'M3 17l4-11 4 11 M4.5 13h5 M14 6v11h3a2.5 2.5 0 0 0 0-5h-3 M14 12h2.5a2.5 2.5 0 0 0 0-5H14',
  tool: 'M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 3-2-2z',
  ear: 'M4 15v-3a8 8 0 0 1 16 0v3 M4 15h3v5H5a1 1 0 0 1-1-1z M20 15h-3v5h2a1 1 0 0 0 1-1z',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4v16 M17 4v16',
  stop: 'M6 6h12v12H6z',
  check: 'M4 12l5 5L20 6',
  x: 'M5 5l14 14 M19 5L5 19',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  copy: 'M8 8h11v12H8z M5 16V4h11',
  down: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  up: 'M12 16V5 M7 9l5-5 5 5 M5 20h14',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  back: 'M20 12H4 M10 6l-6 6 6 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  spark: 'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z',
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10c1 1 1 3 1 3h6s0-2 1-3a6 6 0 0 0-4-10z',
  redo: 'M4 12a8 8 0 1 0 3-6 M4 4v5h5',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 8.5 4 8l-1 3 2 1v0l-2 1 1 3 2-.5L7.5 17l-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3z',
};

export function icon(name, size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.spark);
  svg.append(p);
  return svg;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove(); return ok;
  }
}

export function download(name, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

export const SKILLS = {
  speaking: { ua: 'Мовлення', pl: 'Mówienie', icon: 'mic' },
  writing: { ua: 'Письмо', pl: 'Pisanie', icon: 'pen' },
  listening: { ua: 'Аудіювання', pl: 'Słuchanie', icon: 'ear' },
  reading: { ua: 'Читання', pl: 'Czytanie', icon: 'book' },
  grammar: { ua: 'Граматика', pl: 'Gramatyka', icon: 'cards' },
};

// Очищення при виході зі сторінки (зупинити мікрофон, озвучення, таймери)
const cleanups = [];
export const onCleanup = (fn) => { cleanups.push(fn); };
export function runCleanups() { while (cleanups.length) { try { cleanups.pop()(); } catch { /* ignore */ } } }
