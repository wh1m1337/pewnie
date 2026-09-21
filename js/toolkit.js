// Довідник: формат іспиту, стратегії, зв'язки, шаблони листів, фрази, хибні друзі, типові помилки.
import { h, icon, rich } from './util.js';
import * as store from './store.js';
import { getToolkit } from './content.js';
import { pageHead, phraseRows, speakBtn, stamp } from './ui.js';
import { levelSwitch } from './pages.js';

const TABS = [['exam', 'Формат іспиту'], ['strategy', 'Стратегії'], ['connectors', 'Зв’язки'], ['letters', 'Шаблони листів'], ['phrases', 'Фрази для усної'], ['friends', 'Хибні друзі'], ['errors', 'Типові помилки']];

export async function toolkitView(tab = 'exam') {
  const tk = await getToolkit();
  const level = store.get().level;
  const t = TABS.some(([k]) => k === tab) ? tab : 'exam';
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Розділи довідника' }, TABS.map(([k, l]) => h('a', { class: `tab ${k === t ? 'on' : ''}`, href: `#/toolkit/${k}` }, l)));
  let body;
  setTimeout(() => { const on = nav.querySelector('.on'); if (on) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2; }, 0);

  if (t === 'exam') {
    const L = tk.exam.levels[level];
    body = h('div', { class: 'tk' },
      h('div', { class: 'note note--yellow' }, rich(tk.exam.disclaimer)),
      h('h2', null, `Структура іспиту ${level}`),
      h('div', { class: 'tbl' }, [...L.parts].map((p) => h('div', { class: 'tr' }, h('div', { class: 'td-a' }, p.name), h('div', { class: 'td-b' }, p.time), h('div', { class: 'td-c' }, rich(p.what))))),
      h('h2', null, 'Усна частина: три завдання'),
      h('div', { class: 'grid3' }, L.speaking.map((s) => h('div', { class: 'card' }, h('h3', null, s.name), h('p', null, rich(s.what)), h('p', { class: 'hint' }, s.tip)))),
      h('h2', null, 'Письмо: два тексти'),
      h('div', { class: 'grid3' }, L.writing.map((s) => h('div', { class: 'card' }, h('h3', null, s.name), h('p', null, rich(s.what)), h('p', { class: 'hint' }, s.tip)))),
      h('h2', null, 'За чим оцінюють'),
      h('div', { class: 'grid2' }, ['speaking', 'writing'].map((k) => h('div', { class: 'card' }, h('h3', null, k === 'speaking' ? 'Усна відповідь' : 'Письмо'), h('ul', { class: 'flist' }, tk.exam.criteria[k].map((c) => h('li', null, h('span', null, h('strong', null, c.name), ' — ', c.ua))))))));
  } else if (t === 'strategy') {
    body = h('div', { class: 'tk grid2' }, tk.strategies.map((s) => h('article', { class: 'card' }, h('div', { class: 'eyebrow' }, s.skill === 'speaking' ? 'Мовлення' : s.skill === 'writing' ? 'Письмо' : 'Загальне'), h('h3', null, s.title), h('p', null, rich(s.body)), s.steps && h('ol', { class: 'plan' }, s.steps.map((x) => h('li', null, rich(x)))))));
  } else if (t === 'connectors') {
    body = h('div', { class: 'tk grid2' }, tk.connectors.map((g) => h('div', { class: 'card' }, h('h3', null, g.fn), phraseRows(g.items))));
  } else if (t === 'letters') {
    body = h('div', { class: 'tk' }, tk.letters.map((l) => h('article', { class: 'card letter' }, h('div', { class: 'brief-top' }, stamp(l.register === 'formal' ? 'Formalny' : l.register === 'informal' ? 'Nieformalny' : 'Neutralny'), h('span', { class: 'meta' }, l.when)), h('h3', null, l.title),
      h('div', { class: 'skeleton' }, l.parts.map((p) => h('div', { class: 'sk-row' }, h('div', { class: 'sk-label' }, p.label), h('div', { class: 'sk-pl' }, p.pl, ' ', speakBtn(p.pl, { cls: 'ico--sm' })), h('div', { class: 'sk-ua' }, p.ua)))))));
  } else if (t === 'phrases') {
    body = h('div', { class: 'tk grid2' }, tk.phrases.map((g) => h('div', { class: 'card' }, h('h3', null, g.group), g.note && h('p', { class: 'hint' }, g.note), phraseRows(g.items))));
  } else if (t === 'friends') {
    body = h('div', { class: 'tk' }, h('p', { class: 'lead sm' }, 'Слова, схожі з українськими, але з іншим значенням. Найчастіші пастки на іспиті.'),
      h('div', { class: 'grid3' }, tk.friends.map((f) => h('div', { class: 'card ff' }, h('div', { class: 'ff-pl' }, f.pl, ' ', speakBtn(f.pl, { cls: 'ico--sm' })), h('div', { class: 'ff-ua' }, f.ua), h('p', { class: 'hint' }, rich(f.trap))))));
  } else {
    body = h('div', { class: 'tk' }, h('p', { class: 'lead sm' }, 'Помилки, які роблять саме україномовні. Перевіряй свої тексти на них перед здачею.'),
      h('div', { class: 'errs' }, tk.errors.map((e) => h('div', { class: 'err' }, h('div', { class: 'err-w' }, icon('x', 16), h('s', null, e.wrong)), h('div', { class: 'err-r' }, icon('check', 16), e.right), h('p', { class: 'hint' }, rich(e.why))))));
  }
  return h('div', { class: 'view' }, pageHead({ eyebrow: 'Довідник', title: 'Шпаргалка без води', sub: 'Усе, що треба тримати під рукою під час підготовки.', actions: t === 'exam' ? levelSwitch() : null }), nav, body);
}
