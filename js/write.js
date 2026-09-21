// Студія письма: редактор-зошит, польські літери, таймер, «червоний олівець».
import { h, icon, rich, fmtTime, toast, clear, onCleanup, copyText, wordCount, fmtDate, isoDate } from './util.js';
import * as store from './store.js';
import { loadWeek } from './content.js';
import { analyzeWriting, buildTeacherPrompt, CRITERIA_UA, gradeFromScore } from './analyze.js';
import { stamp, backTo, circledGrade, pencilBar, phraseRows, readAloud, tipBox, speakBtn } from './ui.js';
import { stopSpeaking } from './speech.js';

import { tx } from './i18n.js';
export const KIND_LABEL = {
  'letter-informal': 'List nieformalny', 'letter-formal': 'List formalny', message: 'Krótka wiadomość',
  opinion: 'Wypowiedź argumentacyjna', story: 'Opowiadanie', description: 'Opis',
};

function insertAtCursor(ta, str) {
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + str + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + str.length;
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

export async function writeView(weekId, taskId) {
  const level = store.get().level;
  const week = await loadWeek(weekId, level);
  const task = (week.writing || []).find((t) => t.id === taskId);
  if (!task) throw new Error(tx('Завдання не знайдено'));
  const key = store.taskKey(weekId, level, 'writing', taskId);
  const idx = week.writing.indexOf(task);
  const nextTask = week.writing[idx + 1];
  onCleanup(() => stopSpeaking());

  const ta = h('textarea', { class: 'sheet-text', spellcheck: 'false', autocapitalize: 'sentences', autocomplete: 'off', placeholder: tx('Пиши тут польською…'), 'aria-label': tx('Твій текст') });
  ta.value = store.get().drafts[task.id]?.text || '';

  // ---- польські літери
  let upper = false;
  const LETTERS = ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'];
  const keys = LETTERS.map((c) => h('button', { class: 'key', type: 'button', onclick: () => insertAtCursor(ta, upper ? c.toUpperCase() : c) }, c));
  const shift = h('button', { class: 'key key--shift', type: 'button', 'aria-pressed': 'false', onclick: () => { upper = !upper; shift.setAttribute('aria-pressed', upper); keys.forEach((k, i) => { k.textContent = upper ? LETTERS[i].toUpperCase() : LETTERS[i]; }); } }, 'Aa');

  // ---- таймер
  let left = (task.time || 30) * 60, timerId = null;
  const clock = h('button', { class: 'clock', type: 'button', title: tx('Запустити / пауза'), onclick: toggleClock }, icon('play', 14), h('span', null, fmtTime(left)));
  function toggleClock() {
    if (timerId) { clearInterval(timerId); timerId = null; clock.classList.remove('run'); clock.firstChild.replaceWith(icon('play', 14)); return; }
    clock.classList.add('run'); clock.firstChild.replaceWith(icon('pause', 14));
    timerId = setInterval(() => { left--; clock.lastChild.textContent = fmtTime(left); if (left === 0) toast(tx('Час вийшов! На іспиті тепер здають роботу.'), 4000); if (left < 0) clock.classList.add('over'); }, 1000);
  }
  onCleanup(() => clearInterval(timerId));

  // ---- лічильник і живі пункти
  const min = task.min, max = task.max;
  const counter = h('div', { class: 'counter' });
  const gauge = h('div', { class: 'gauge' }, h('i', { class: 'gauge-ok', style: { left: `${(min / (max * 1.3)) * 100}%`, width: `${((max - min) / (max * 1.3)) * 100}%` } }), h('i', { class: 'gauge-now' }));
  const pointsBox = h('ul', { class: 'checklist' });
  function live() {
    const n = wordCount(ta.value);
    const cls = n < Math.floor(min * 0.9) ? 'low' : n > Math.ceil(max * 1.1) ? 'high' : 'ok';
    counter.className = `counter ${cls}`;
    counter.replaceChildren(h('b', null, n), tx(' слів · потрібно {0}–{1}', min, max));
    gauge.lastChild.style.left = `${Math.min(100, (n / (max * 1.3)) * 100)}%`;
    const low = ta.value.toLowerCase();
    clear(pointsBox).append(...(task.points || []).map((p) => {
      const ok = p.keys?.length ? p.keys.some((k) => low.includes(k.toLowerCase())) : null;
      return h('li', { class: ok ? 'ok' : '' }, icon(ok ? 'check' : 'x', 15), p.text);
    }));
  }
  let saveT;
  ta.addEventListener('input', () => { live(); clearTimeout(saveT); saveT = setTimeout(() => store.saveDraft(task.id, ta.value), 500); });
  live();

  // ---- результат перевірки
  const resultSlot = h('div', { class: 'result' });
  let lastCheck = null;

  function annotated(text, findings) {
    const p = h('p', { class: 'annot' });
    let pos = 0;
    findings.forEach((f, i) => {
      if (f.s > pos) p.append(text.slice(pos, f.s));
      p.append(h('mark', { class: `mk mk-${f.type}`, title: f.msg.replace(/\*\*/g, '') }, text.slice(f.s, f.e), h('sup', null, i + 1)));
      pos = f.e;
    });
    p.append(text.slice(pos));
    return p;
  }

  function runCheck() {
    const text = ta.value;
    if (wordCount(text) < 5) return toast(tx('Спершу напиши хоча б кілька речень.'));
    const a = analyzeWriting(text, task, level);
    lastCheck = a;
    const crit = Object.entries(CRITERIA_UA).map(([k, [name, sub]]) => pencilBar(a.criteria[k] * 100, { label: name, sub, tone: a.criteria[k] > 0.7 ? 'ok' : a.criteria[k] > 0.45 ? 'ink' : 'red' }));
    clear(resultSlot).append(
      h('div', { class: 'report-head' }, circledGrade(a.grade), h('div', null, h('h3', null, tx('Перевірено червоним олівцем')), h('p', { class: 'hint' }, tx('Орієнтовна оцінка за формальними ознаками: {0}%. Це не заміна екзаменатора — сенс і стиль оцінює людина.', a.score)))),
      h('div', { class: 'crit' }, crit),
      h('div', { class: 'note note--paper' }, h('div', { class: 'eyebrow' }, tx('Твій текст із позначками')), annotated(text, a.findings),
        a.findings.length === 0 && h('p', { class: 'ok-line' }, icon('check', 16), tx(' Типових помилок автоматика не знайшла. Все одно перечитай уголос.'))),
      a.findings.length > 0 && h('ol', { class: 'flist flist--num' }, a.findings.map((f) => h('li', { class: f.type },
        h('span', null, rich(f.msg)),
        f.fix && h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => { ta.value = ta.value.slice(0, f.s) + f.fix + ta.value.slice(f.e); ta.dispatchEvent(new Event('input')); runCheck(); } }, `→ ${f.fix}`)))),
      h('div', { class: 'two' },
        h('div', { class: 'note' }, h('div', { class: 'eyebrow' }, tx('Загалом')), h('ul', { class: 'gen' }, a.general.map((g) => h('li', { class: g.type }, icon(g.type === 'ok' ? 'check' : g.type === 'err' ? 'x' : 'bulb', 15), h('span', null, rich(g.msg)))))),
        h('div', { class: 'note' }, h('div', { class: 'eyebrow' }, tx('Структура і пункти')), h('ul', { class: 'checklist' },
          a.structure.map((s) => h('li', { class: s.ok ? 'ok' : 'no' }, icon(s.ok ? 'check' : 'x', 15), s.text)),
          a.points.map((p) => h('li', { class: p.ok ? 'ok' : p.ok === false ? 'no' : '' }, icon(p.ok ? 'check' : 'x', 15), p.text))))),
      h('div', { class: 'note' }, h('div', { class: 'eyebrow' }, tx('Зв’язки ({0}) і конструкції', a.connectors.length)),
        h('div', { class: 'chips' }, a.connectors.map((c) => h('span', { class: 'chip', title: c.fn }, c.word)), a.complexity.map((c) => h('span', { class: 'chip chip--ok' }, c)),
          !a.connectors.length && !a.complexity.length && h('span', { class: 'hint' }, tx('Поки нічого — додай «ponieważ», «jednak», «moim zdaniem»…')))),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn--red', type: 'button', onclick: submit }, icon('check', 18), tx('Зарахувати спробу')),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: async () => { await copyText(buildTeacherPrompt({ kind: 'writing', level, task, text: ta.value })); toast(tx('Запит скопійовано — встав у ChatGPT або Claude для докладного розбору.'), 4200); } }, icon('copy', 16), tx('Розбір від ШІ-вчителя'))),
      modelBlock());
    resultSlot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function submit() {
    if (!lastCheck) return;
    store.addSubmission(task.id, { text: ta.value, words: lastCheck.words, score: lastCheck.score, grade: lastCheck.grade });
    store.markDone(key, lastCheck.score, { words: lastCheck.words });
    toast(tx('Зараховано: {0} · {1}%', lastCheck.grade, lastCheck.score));
    renderHistory();
  }

  function modelBlock() {
    return h('details', { class: 'model', open: false },
      h('summary', null, icon('eye', 18), tx('Модельна відповідь'), h('span', { class: 'hint' }, tx(' — {0} слів', wordCount(task.model)))),
      h('div', { class: 'model-text' }, task.model.split('\n\n').map((par) => h('p', null, par))),
      readAloud(task.model.replace(/\n+/g, ' '), { title: tx('Прослухати зразок') }),
      h('p', { class: 'hint' }, tx('У зразках минулий час — у жіночій формі; чоловікам: -łam → -łem, -am → -em.')),
      tipBox(task.tips, tx('Чому це працює')));
  }

  // ---- історія спроб
  const historySlot = h('div', { class: 'history' });
  function renderHistory() {
    const list = store.get().submissions[task.id] || [];
    clear(historySlot);
    if (!list.length) return;
    historySlot.append(h('div', { class: 'eyebrow' }, tx('Мої спроби')), h('ul', { class: 'attempts' }, list.map((s) => h('li', null,
      h('span', { class: 'mono' }, fmtDate(isoDate(new Date(s.ts)))), circledGrade(s.grade || '–', true), h('span', null, tx('{0} слів · {1}%', s.words, s.score)),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => { ta.value = s.text; ta.dispatchEvent(new Event('input')); toast(tx('Текст відновлено')); } }, tx('відновити'))))));
  }
  renderHistory();

  // ---- ліва колонка
  const tabs = h('div', { class: 'brief card' },
    h('div', { class: 'brief-top' }, stamp(KIND_LABEL[task.kind] || 'Pisanie'), h('span', { class: 'meta' }, tx('{0} · ~{1} хв', level, task.time || 30))),
    h('h2', { class: 'brief-title' }, task.title),
    h('p', { class: 'prompt-pl' }, task.prompt),
    h('details', { class: 'fold' }, h('summary', null, tx('Переклад завдання')), h('p', { class: 'ua-prompt' }, task.promptUa)),
    h('div', { class: 'eyebrow mt' }, tx('Що обов’язково розкрити')), pointsBox,
    task.phrases?.length > 0 && h('div', null, h('div', { class: 'eyebrow mt' }, tx('Фрази — клік вставляє в текст')), phraseRows(task.phrases, { onPick: (t) => insertAtCursor(ta, t + ' ') })));

  const sheet = h('div', { class: 'sheet-wrap' },
    h('div', { class: 'sheet-bar' }, h('div', { class: 'keys' }, keys, shift), clock),
    h('div', { class: 'sheet' }, ta),
    h('div', { class: 'sheet-foot' }, counter, gauge),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn--red btn--lg', type: 'button', onclick: runCheck }, icon('pen', 18), tx('Перевірити червоним олівцем')),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: async () => { await copyText(ta.value); toast(tx('Текст скопійовано')); } }, icon('copy', 16), tx('Копіювати')),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { if (!ta.value || confirm(tx('Стерти чернетку?'))) { ta.value = ''; ta.dispatchEvent(new Event('input')); resultSlot.replaceChildren(); } } }, tx('Очистити'))),
    resultSlot, historySlot,
    h('div', { class: 'row mt' }, nextTask ? h('a', { class: 'btn btn--ghost', href: `#/write/${weekId}/${nextTask.id}` }, tx('Наступне завдання'), icon('arrow', 16)) : h('a', { class: 'btn btn--ghost', href: `#/week/${weekId}` }, tx('До тижня'), icon('arrow', 16))));

  return h('div', { class: 'view' }, backTo(`#/week/${weekId}`, tx('Тиждень · {0}', week.theme?.pl || '')), h('div', { class: 'studio studio--write' }, tabs, sheet));
}
