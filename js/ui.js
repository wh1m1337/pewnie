// Спільні компоненти інтерфейсу.
import { h, icon, rich, toast } from './util.js';
import * as store from './store.js';
import { speak, stopSpeaking, splitSentences, ttsSupported, hasPolishVoice } from './speech.js';

export const stamp = (text, cls = '') => h('span', { class: `stamp ${cls}` }, text);

export function pageHead({ eyebrow, title, sub, actions }) {
  return h('header', { class: 'phead' },
    h('div', { class: 'phead-main' },
      eyebrow && h('div', { class: 'eyebrow' }, eyebrow),
      h('h1', { class: 'ptitle' }, title),
      sub && h('p', { class: 'psub' }, sub)),
    actions && h('div', { class: 'phead-actions' }, actions));
}

export const backTo = (href, label) => h('a', { class: 'back', href }, icon('back', 18), label);

export function circledGrade(grade, small = false) {
  return h('div', { class: `grade ${small ? 'grade--sm' : ''}`, title: 'Оцінка за шкалою польської школи (1–6)' }, h('span', null, grade));
}

export function pencilBar(value, { label, sub, tone = 'ink' } = {}) {
  const pct = value == null ? 0 : Math.round(value);
  return h('div', { class: `pbar pbar--${tone}` },
    (label || sub) && h('div', { class: 'pbar-top' }, h('span', { class: 'pbar-label' }, label), h('span', { class: 'pbar-val' }, value == null ? '—' : `${pct}%`)),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${pct}%` } })),
    sub && h('div', { class: 'pbar-sub' }, sub));
}

export function errorBox(err) {
  if (err?.locked) return h('div', { class: 'note note--yellow lockbox' }, icon('lock', 22), h('strong', null, ' Ще закрито. '), err.message, h('div', { class: 'mt' }, h('a', { class: 'btn', href: '#/weeks' }, 'До всіх тижнів')));
  return h('div', { class: 'note note--red' }, h('strong', null, 'Щось пішло не так. '), String(err?.message || err),
    h('div', { class: 'mt' }, h('a', { class: 'btn btn--ghost', href: '#/' }, 'На головну')));
}

// кнопка «озвучити»
export function speakBtn(text, { label, cls = '' } = {}) {
  let playing = false;
  const b = h('button', { class: `ico ${cls}`, type: 'button', title: 'Прослухати', 'aria-label': 'Прослухати польською' }, icon('play', 16), label && h('span', null, label));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!ttsSupported) return toast('Твій браузер не вміє озвучувати. Спробуй Chrome або Safari.');
    if (playing) { stopSpeaking(); playing = false; b.classList.remove('on'); return; }
    if (!hasPolishVoice()) toast('Польського голосу в системі не знайдено — додай його в налаштуваннях ОС (Мова → Голоси).', 4200);
    playing = true; b.classList.add('on');
    speak([text], { rate: store.get().rate, onDone: () => { playing = false; b.classList.remove('on'); } });
  });
  return b;
}

// фрази: польською + переклад; клік = вставити (якщо onPick), значок = озвучити
export function phraseRows(list, { onPick } = {}) {
  return h('ul', { class: 'phrases' }, list.map((p) =>
    h('li', null,
      h('button', { class: 'phrase', type: 'button', onclick: () => onPick?.(p.pl), title: onPick ? 'Вставити в текст' : '' },
        h('span', { class: 'pl' }, p.pl), h('span', { class: 'ua' }, p.ua)),
      speakBtn(p.pl, { cls: 'ico--sm' }))));
}

// текст, який можна слухати цілком або по реченнях (shadowing)
export function readAloud(text, { title = 'Слухати й повторювати' } = {}) {
  const sents = splitSentences(text);
  let ctl = null;
  const lines = sents.map((s, i) => h('button', { class: 'sent', type: 'button', onclick: () => play(i, true) }, s + ' '));
  const mark = (i) => lines.forEach((l, j) => l.classList.toggle('now', j === i));
  function play(from = 0, single = false) {
    if (!ttsSupported) return toast('Озвучення недоступне в цьому браузері.');
    if (!hasPolishVoice()) toast('Польського голосу в системі не знайдено — додай його в налаштуваннях ОС.', 4200);
    ctl?.stop();
    const items = single ? [sents[from]] : sents.slice(from);
    ctl = speak(items, { rate: store.get().rate, onItem: (k) => mark(from + k), onDone: () => mark(-1) });
  }
  const box = h('div', { class: 'read-aloud' },
    h('div', { class: 'ra-bar' },
      h('span', { class: 'eyebrow' }, title),
      h('button', { class: 'btn btn--sm', type: 'button', onclick: () => play(0) }, icon('play', 14), 'Слухати все'),
      h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => { ctl?.stop(); stopSpeaking(); mark(-1); } }, icon('stop', 14), 'Стоп')),
    h('p', { class: 'ra-text' }, lines),
    h('p', { class: 'hint' }, 'Клікни на речення — прослухай і повтори вголос, копіюючи інтонацію. Це і є shadowing.'));
  return box;
}

// «фото» з наклейок-емодзі для завдання «Opis ilustracji»
const SKY = {
  office: ['#e3eaf7', '#c6d3ec'], street: ['#f6e6c8', '#ebd0a0'], home: ['#f7e4dc', '#efcabd'], park: ['#e0eed8', '#bfdcb6'],
  clinic: ['#e2f1f0', '#bfe0de'], station: ['#e9e4f4', '#cfc7ea'], night: ['#39446b', '#1e2646'], shop: ['#fbe9d0', '#f2cf9b'], sea: ['#d9ecf7', '#b7dbee'],
};
export function sceneEl(scene) {
  const [a, b] = SKY[scene.bg] || SKY.street;
  const el = h('figure', { class: 'scene', style: { background: `linear-gradient(180deg, ${a}, ${b})` }, role: 'img', 'aria-label': 'Ілюстрація до завдання' },
    h('div', { class: 'scene-floor' }),
    scene.desk && h('div', { class: 'scene-desk', style: { left: `${scene.desk[0]}%`, top: `${scene.desk[1]}%`, width: `${scene.desk[2]}%` } }),
    (scene.items || []).map(([e, x, y, s, r]) => h('span', { class: 'sticker', style: { left: `${x}%`, top: `${y}%`, fontSize: `${s}cqw`, transform: `translate(-50%,-50%) rotate(${r || 0}deg)` } }, e)),
    h('i', { class: 'tape tape--l' }), h('i', { class: 'tape tape--r' }));
  return h('div', { class: 'polaroid' }, el, scene.caption && h('figcaption', null, scene.caption));
}

// підказка-пояснення (клікабельне «?» відкриває пояснення)
export function tipBox(tips, title = 'Порада від «вчительки»') {
  if (!tips?.length) return null;
  return h('div', { class: 'note note--yellow tips' }, h('div', { class: 'eyebrow' }, icon('bulb', 16), title), h('ul', null, tips.map((t) => h('li', null, rich(t)))));
}

export function skillsDots(week, level) {
  const out = [];
  for (const k of ['speaking', 'writing', 'listening', 'reading', 'grammar']) {
    const arr = week[k] || [];
    if (!arr.length) continue;
    const done = arr.filter((t) => store.isDone(store.taskKey(week.id, level, k, t.id))).length;
    out.push({ k, done, total: arr.length });
  }
  return out;
}

export function loading(text = 'Відкриваю зошит…') {
  return h('div', { class: 'loading' }, h('span', { class: 'blot' }), text);
}
