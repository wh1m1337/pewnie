// Аудіювання, читання, граматика: тести з поясненнями + картки слів.
import { h, icon, rich, toast, clear, onCleanup, todayISO, plural, shuffle } from './util.js';
import * as store from './store.js';
import { loadWeek, loadAllUnlocked } from './content.js';
import { speak, stopSpeaking, ttsSupported, hasPolishVoice } from './speech.js';
import { backTo, circledGrade, pageHead, speakBtn, stamp } from './ui.js';
import { gradeFromScore } from './analyze.js';
import { levelSwitch } from './pages.js';

import { tx } from './i18n.js';
const SK = { listening: ['Słuchanie', tx('Аудіювання'), 'ear'], reading: ['Czytanie', tx('Читання'), 'book'], grammar: ['Gramatyka', tx('Граматика'), 'cards'] };

function questions(source) {
  // варіанти перемішуємо, щоб правильна відповідь не стояла завжди на одній позиції
  const list = source.map((q) => { const order = shuffle(q.options.map((_, i) => i)); return { ...q, options: order.map((j) => q.options[j]), answer: order.indexOf(q.answer) }; });
  const chosen = list.map(() => -1);
  const blocks = list.map((q, i) => {
    const opts = q.options.map((o, j) => h('button', { class: 'opt', type: 'button', onclick: () => { if (locked) return; chosen[i] = j; opts.forEach((b, k) => b.classList.toggle('sel', k === j)); } }, h('span', { class: 'opt-l' }, 'ABCD'[j]), h('span', null, o)));
    const why = h('div', { class: 'why', hidden: true });
    return { el: h('div', { class: 'q' }, h('div', { class: 'q-n' }, i + 1), h('div', { class: 'q-body' }, h('p', { class: 'q-text' }, q.q), h('div', { class: 'opts' }, opts), why)), opts, why, q };
  });
  let locked = false;
  return {
    el: h('div', { class: 'qs' }, blocks.map((b) => b.el)),
    check() {
      if (chosen.some((c) => c < 0)) { toast(tx('Відповісти треба на всі питання.')); return null; }
      locked = true;
      let ok = 0;
      blocks.forEach((b, i) => {
        const good = chosen[i] === b.q.answer;
        if (good) ok++;
        b.opts.forEach((o, k) => { o.classList.toggle('right', k === b.q.answer); o.classList.toggle('wrong', k === chosen[i] && !good); });
        b.why.hidden = false;
        b.why.replaceChildren(icon(good ? 'check' : 'x', 15), h('span', null, rich(b.q.why || '')));
        b.why.className = `why ${good ? 'ok' : 'no'}`;
      });
      return Math.round((ok / blocks.length) * 100);
    },
    reset() { locked = false; chosen.fill(-1); blocks.forEach((b) => { b.opts.forEach((o) => o.classList.remove('sel', 'right', 'wrong')); b.why.hidden = true; }); },
  };
}

export async function quizView(skill, weekId, taskId) {
  const level = store.get().level;
  const week = await loadWeek(weekId, level);
  const task = (week[skill] || []).find((t) => t.id === taskId);
  if (!task) throw new Error(tx('Завдання не знайдено'));
  const key = store.taskKey(weekId, level, skill, taskId);
  const [pl, ua, ico] = SK[skill];
  onCleanup(() => stopSpeaking());

  const qs = questions(task.questions);
  const out = h('div', { class: 'quiz-out' });
  let plays = 0;
  let head = null;

  if (skill === 'listening') {
    const counter = h('span', { class: 'meta' }, tx('Прослухано: 0 з 2 (на іспиті — двічі)'));
    const btn = h('button', { class: 'btn btn--red btn--lg', type: 'button' }, icon('play', 18), tx('Слухати запис'));
    const vm = { A: 'f', B: 'm', ...(task.voices || {}) };
    const items = (task.lines || [{ t: task.script }]).map((l) => ({ text: l.t, role: vm[l.who] || 'f', pitch: vm[l.who] === 'm' ? 0.88 : 1.12, pause: 450 }));
    let playing = null;
    btn.addEventListener('click', () => {
      if (!ttsSupported) return toast(tx('Озвучення недоступне в цьому браузері. Спробуй Chrome або Safari.'));
      if (!hasPolishVoice()) toast(tx('Польського голосу в системі немає — додай його в налаштуваннях ОС (Мова → Голоси).'), 4500);
      if (playing) { playing.stop(); playing = null; btn.replaceChildren(icon('play', 18), tx('Слухати запис')); return; }
      plays++;
      counter.textContent = tx('Прослухано: {0} {1}', plays, plays > 2 ? tx('(більше, ніж на іспиті)') : tx('з 2 (на іспиті — двічі)'));
      btn.replaceChildren(icon('stop', 18), tx('Зупинити'));
      playing = speak(items, { rate: task.rate ?? (level === 'B2' ? 1 : 0.92) * store.get().rate / 0.9, onDone: () => { playing = null; btn.replaceChildren(icon('play', 18), tx('Слухати ще раз')); } });
    });
    const script = h('details', { class: 'model' }, h('summary', null, icon('eye', 18), tx('Транскрипт'), h('span', { class: 'hint' }, tx(' — відкрий після відповідей'))),
      h('div', { class: 'transcript-view' }, (task.lines || [{ t: task.script }]).map((l) => h('p', null, l.who && h('b', null, `${l.who}: `), l.t))));
    head = h('div', { class: 'card listen' }, h('div', { class: 'eyebrow' }, task.intro || tx('Прослухай запис і відповідай на питання')), h('div', { class: 'row' }, btn, counter), script);
  } else if (skill === 'reading') {
    head = h('article', { class: 'card reading' }, h('h2', { class: 'read-title' }, task.textTitle || task.title), task.text.split('\n\n').map((p) => h('p', null, p)));
  } else {
    head = h('div', { class: 'note note--yellow' }, h('div', { class: 'eyebrow' }, tx('Постав правильну форму')), h('p', null, task.intro || tx('Вибери варіант, який пасує граматично.')));
  }

  const checkBtn = h('button', { class: 'btn btn--red', type: 'button', onclick: () => {
    const score = qs.check();
    if (score == null) return;
    store.markDone(key, score);
    clear(out).append(h('div', { class: 'report-head' }, circledGrade(gradeFromScore(score)), h('div', null, h('h3', null, tx('{0}% правильно', score)), h('p', { class: 'hint' }, score >= 75 ? tx('Добре! Перечитай пояснення до помилок — вони найцінніші.') : tx('Не біда: розбери пояснення й спробуй ще раз через день-два.')))),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { qs.reset(); clear(out); } }, icon('redo', 16), tx('Ще раз')), h('a', { class: 'btn btn--ghost', href: `#/week/${weekId}` }, tx('До тижня'), icon('arrow', 16))));
    out.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } }, icon('check', 18), tx('Перевірити'));

  return h('div', { class: 'view narrow' }, backTo(`#/week/${weekId}`, tx('Тиждень · {0}', week.theme.pl)),
    pageHead({ eyebrow: `${pl} · ${ua} · ${level}`, title: task.title }), head, qs.el, h('div', { class: 'row' }, checkBtn), out);
}

// ------------------------------------------------------------------ картки слів (інтервальне повторення)
export async function vocabView() {
  const level = store.get().level;
  const packs = (await loadAllUnlocked(level)).reverse();
  const all = [];
  const seen = new Set();
  packs.forEach((p) => (p.vocab || []).forEach((v) => { if (!seen.has(v.pl)) { seen.add(v.pl); all.push({ ...v, theme: p.theme.pl }); } }));
  const today = todayISO();
  const due = all.filter((v) => store.vocabState(v.pl) && store.vocabState(v.pl).due <= today);
  const fresh = all.filter((v) => !store.vocabState(v.pl));
  const queue = [...shuffle(due), ...fresh.slice(0, Math.max(0, 10 - due.length))].slice(0, 14);
  const learned = all.filter((v) => (store.vocabState(v.pl)?.box || 0) >= 4).length;

  const stage = h('div', { class: 'vstage' });
  let i = 0, right = 0;

  function card() {
    clear(stage);
    if (!queue.length) return stage.append(h('div', { class: 'note' }, h('h3', null, tx('На сьогодні все!')), h('p', null, tx('Вивчено {0} з {1}. Нові слова — у понеділок, а повторення з’являться за розкладом.', learned, all.length))));
    if (i >= queue.length) {
      return stage.append(h('div', { class: 'note note--green' }, h('h3', null, tx('Сесію завершено')), h('p', null, tx('Знав(ла) {0} з {1}. Слова, які «не пішли», повернуться завтра.', right, queue.length)), h('a', { class: 'btn', href: '#/' }, tx('На головну'))));
    }
    const v = queue[i];
    let flipped = false;
    const back = h('div', { class: 'vback', hidden: true }, h('div', { class: 'vua' }, v.ua), v.ex && h('p', { class: 'vex' }, v.ex, ' ', speakBtn(v.ex, { cls: 'ico--sm' })), v.note && h('p', { class: 'hint' }, v.note));
    const actions = h('div', { class: 'row', hidden: true }, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => next(false) }, icon('x', 16), tx('Ще не знаю')), h('button', { class: 'btn', type: 'button', onclick: () => next(true) }, icon('check', 16), tx('Знаю')));
    const face = h('button', { class: 'vcard', type: 'button', onclick: () => { if (flipped) return; flipped = true; back.hidden = false; actions.hidden = false; face.classList.add('flipped'); } },
      h('span', { class: 'eyebrow' }, `${i + 1} / ${queue.length} · ${v.theme}`), h('span', { class: 'vpl' }, v.pl), h('span', { class: 'hint' }, flipped ? '' : tx('натисни, щоб побачити переклад')));
    stage.append(h('div', { class: 'vwrap' }, face, h('div', { class: 'vspeak' }, speakBtn(v.pl, { label: tx('Вимова') })), back, actions));
    setTimeout(() => { if (ttsSupported && hasPolishVoice()) speak([v.pl], { rate: store.get().rate }); }, 200);
  }
  function next(ok) { store.vocabAnswer(queue[i].pl, ok); if (ok) right++; i++; card(); }
  card();

  return h('div', { class: 'view narrow' }, backTo('#/', tx('Головна')),
    pageHead({ eyebrow: tx('Słownictwo · картки'), title: tx('Слова'), sub: tx('{0} слів відкрито · {1} вивчено · {2} на повторення', all.length, learned, due.length), actions: levelSwitch() }), stage);
}
