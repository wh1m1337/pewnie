// Оболонка: навігація, роутер, онбординг.
import { h, icon, runCleanups, todayISO, toast } from './util.js';
import * as store from './store.js';
import { stopSpeaking, setVoicePref, setNeural, loadClips } from './speech.js';
import { errorBox, loading } from './ui.js';
import { homeView, weeksView, weekView, hubView } from './pages.js';
import { speakView } from './speak.js';
import { writeView } from './write.js';
import { quizView, vocabView } from './quiz.js';
import { toolkitView } from './toolkit.js';
import { progressView } from './progress.js';

import { tx, lang, setLang } from './i18n.js';
store.applyTheme();
if (lang === 'en') document.querySelector('meta[name=description]')?.setAttribute('content', 'Trainer for the Polish state certificate exam B1/B2: speaking and writing, voice recording, text feedback, new tasks every week.');
setVoicePref(store.get().voice);
setNeural(store.get().neural);
loadClips();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => store.applyTheme());

const NAV = [
  ['#/', tx('Головна'), 'home', /^\/?$/],
  ['#/speak', tx('Мовлення'), 'mic', /^\/speak/],
  ['#/write', tx('Письмо'), 'pen', /^\/write/],
  ['#/listen', tx('Аудіювання'), 'ear', /^\/listen/],
  ['#/read', tx('Читання'), 'book', /^\/read/],
  ['#/grammar', tx('Граматика'), 'cards', /^\/grammar/],
  ['#/vocab', tx('Слова'), 'abc', /^\/vocab/],
  ['#/weeks', tx('Тижні'), 'cal', /^\/(weeks|week)/],
  ['#/toolkit', tx('Довідник'), 'tool', /^\/toolkit/],
  ['#/progress', tx('Прогрес'), 'chart', /^\/progress/],
];

const ROUTES = [
  [/^\/?$/, () => homeView(), tx('Головна')],
  [/^\/weeks$/, () => weeksView(), tx('Тижні')],
  [/^\/week\/([\w-]+)$/, (m) => weekView(m[1]), tx('Тиждень')],
  [/^\/speak$/, () => hubView('speaking'), tx('Мовлення')],
  [/^\/speak\/([\w-]+)\/([\w-]+)$/, (m) => speakView(m[1], m[2]), tx('Мовлення')],
  [/^\/write$/, () => hubView('writing'), tx('Письмо')],
  [/^\/write\/([\w-]+)\/([\w-]+)$/, (m) => writeView(m[1], m[2]), tx('Письмо')],
  [/^\/(listen|read|grammar)$/, (m) => hubView({ listen: 'listening', read: 'reading', grammar: 'grammar' }[m[1]]), tx('Завдання')],
  [/^\/(listen|read|grammar)\/([\w-]+)\/([\w-]+)$/, (m) => quizView({ listen: 'listening', read: 'reading', grammar: 'grammar' }[m[1]], m[2], m[3]), tx('Завдання')],
  [/^\/vocab$/, () => vocabView(), tx('Слова')],
  [/^\/toolkit(?:\/(\w+))?$/, (m) => toolkitView(m[1]), tx('Довідник')],
  [/^\/progress$/, () => progressView(), tx('Прогрес')],
];

const main = h('main', { id: 'main', class: 'page', tabindex: '-1' });
const spine = h('nav', { class: 'spine', 'aria-label': tx('Розділи') });

function themeBtn() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return h('button', { class: 'themebtn', type: 'button', title: dark ? tx('Світлий зошит') : tx('Темна дошка'), 'aria-label': tx('Змінити тему'), onclick: () => { store.patch({ theme: dark ? 'light' : 'dark' }); store.applyTheme(); drawSpine(); } }, icon(dark ? 'sun' : 'moon', 20));
}

function centerActive(bar, sel) {
  const on = bar?.querySelector(sel);
  if (on) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;
}

function langBtn() {
  return h('button', { class: 'themebtn langbtn', type: 'button', title: lang === 'en' ? 'Українська' : 'English', 'aria-label': 'Language', onclick: () => setLang(lang === 'en' ? 'uk' : 'en') }, lang === 'en' ? 'UA' : 'EN');
}

function drawSpine() {
  const path = location.hash.slice(1) || '/';
  spine.replaceChildren(
    h('a', { class: 'brand', href: '#/', 'aria-label': tx('Pewnie — головна') }, h('span', { class: 'brand-mark' }, 'P'), h('span', { class: 'brand-name' }, 'Pewnie')),
    h('div', { class: 'spine-items' }, NAV.map(([href, label, ic, re]) => h('a', { class: `navitem ${re.test(path) ? 'on' : ''}`, href, 'aria-current': re.test(path) ? 'page' : null }, icon(ic, 22), h('span', null, label)))),
    h('div', { class: 'spine-foot' }, langBtn(), themeBtn()));
  // на телефоні панель прокручується: активний розділ має бути видно
  setTimeout(() => centerActive(spine.querySelector('.spine-items'), '.navitem.on'), 0);
}

let token = 0;
async function render() {
  const my = ++token;
  runCleanups();
  stopSpeaking();
  drawSpine();
  const path = location.hash.slice(1).split('?')[0] || '/';
  main.replaceChildren(loading());
  for (const [re, fn, title] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    try {
      const el = await fn(m);
      if (my !== token) return;
      main.replaceChildren(el);
      document.title = tx('{0} · Pewnie — польська B1/B2', title);
    } catch (e) {
      if (my !== token) return;
      console.error(e);
      main.replaceChildren(errorBox(e));
    }
    window.scrollTo(0, 0);
    return;
  }
  main.replaceChildren(errorBox(new Error(tx('Такої сторінки немає.'))));
}

function onboarding() {
  return new Promise((resolve) => {
    let level = 'B1';
    const date = h('input', { type: 'date', class: 'input', min: todayISO() });
    const btns = ['B1', 'B2'].map((l) => h('button', { type: 'button', class: `lvl-big ${l === level ? 'on' : ''}`, onclick: () => { level = l; btns.forEach((b, i) => b.classList.toggle('on', ['B1', 'B2'][i] === l)); } },
      h('span', { class: 'lvl-big-l' }, l), h('span', { class: 'lvl-big-d' }, l === 'B1' ? tx('Поріг: життя, робота, громадянство') : tx('Самостійний рівень: навчання, кар’єра'))));
    const dlg = h('div', { class: 'overlay' }, h('div', { class: 'modal card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ob-t' },
      h('div', { class: 'lang-pick' }, [['uk', 'Українська'], ['en', 'English']].map(([l, name]) => h('button', { type: 'button', class: `chip ${lang === l ? 'chip--date' : ''}`, 'aria-pressed': lang === l, onclick: () => { if (lang !== l) setLang(l); } }, name))),
      h('div', { class: 'eyebrow' }, tx('Ласкаво просимо')),
      h('h2', { id: 'ob-t' }, tx('Який іспит складаєш?')),
      h('div', { class: 'lvl-pick' }, btns),
      h('label', { class: 'field-label' }, tx('Дата іспиту (якщо знаєш)')), date,
      h('p', { class: 'hint' }, tx('Рівень можна змінити будь-коли. Прогрес зберігається на цьому пристрої.')),
      h('button', { class: 'btn btn--red btn--lg', type: 'button', onclick: () => { store.patch({ level, examDate: date.value || null }); dlg.remove(); resolve(); } }, tx('Почати'), icon('arrow', 18))));
    document.body.append(dlg);
  });
}

(async function boot() {
  document.getElementById('app').append(h('div', { class: 'shell' }, spine, main));
  if (!store.get().level) await onboarding();
  window.addEventListener('hashchange', render);
  window.addEventListener('pewnie:rerender', render);
  render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
