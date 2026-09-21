// Студія мовлення: підготовка → запис → «червоний олівець» → модельна відповідь.
import { h, icon, rich, fmtTime, toast, clear, onCleanup, copyText } from './util.js';
import * as store from './store.js';
import { loadWeek } from './content.js';
import { Recorder, recSupported, asrSupported, speak, stopSpeaking, ttsSupported, hasPolishVoice } from './speech.js';
import { analyzeSpeech, gradeFromScore, buildTeacherPrompt } from './analyze.js';
import { stamp, backTo, circledGrade, speakBtn, phraseRows, readAloud, sceneEl, tipBox } from './ui.js';

import { tx } from './i18n.js';
export const TYPE_LABEL = { describe: 'Opis ilustracji', monologue: 'Monolog', dialogue: 'Rozmowa' };
const SELF = [['Realizacja zadania', tx('усе, про що просили, сказано')], ['Płynność', tx('без довгих пауз')], ['Słownictwo', tx('слова й фрази по темі')], ['Poprawność', tx('граматика, відмінки')], ['Wymowa', tx('вимова та інтонація')]];

// ------------------------------------------------------------------ панель запису
function recordPanel({ target = [60, 120], onDone, label = tx('Почати запис') }) {
  let rec = null, tick = null, t0 = 0, running = false;
  const levels = [];
  const wave = h('canvas', { class: 'wave', width: 640, height: 84, 'aria-hidden': 'true' });
  const g = wave.getContext('2d');
  const time = h('div', { class: 'rec-time' }, '00:00');
  const scale = Math.max(target[1] * 1.5, 30);
  const zoneOk = h('i', { class: 'zone-ok', style: { left: `${(target[0] / scale) * 100}%`, width: `${((target[1] - target[0]) / scale) * 100}%` } });
  const zoneNow = h('i', { class: 'zone-now' });
  const zone = h('div', { class: 'zone', title: tx('Ціль: {0}–{1}', fmtTime(target[0]), fmtTime(target[1])) }, zoneOk, zoneNow);
  const live = h('div', { class: 'live', 'aria-live': 'polite' });
  const msg = h('div', { class: 'hint' });
  const btn = h('button', { class: 'rec-btn', type: 'button', 'aria-label': label }, icon('mic', 32));
  const cap = h('div', { class: 'rec-cap' }, label);
  const root = h('div', { class: 'rec' },
    h('div', { class: 'rec-main' }, btn, h('div', { class: 'rec-info' }, cap, time)),
    wave, h('div', { class: 'zone-wrap' }, zone, h('div', { class: 'zone-legend' }, tx('ціль {0}–{1}', fmtTime(target[0]), fmtTime(target[1])))), live, msg);

  const draw = () => {
    const css = getComputedStyle(root);
    g.clearRect(0, 0, wave.width, wave.height);
    g.fillStyle = css.getPropertyValue('--red').trim() || '#d6362b';
    const mid = wave.height / 2;
    levels.forEach((l, i) => { const hh = Math.max(2, l * (wave.height - 8)); g.fillRect(i * 4, mid - hh / 2, 2.5, hh); });
  };

  function update() {
    const s = (performance.now() - t0) / 1000;
    time.textContent = fmtTime(s);
    zoneNow.style.left = `${Math.min(100, (s / scale) * 100)}%`;
    zone.classList.toggle('in', s >= target[0] && s <= target[1]);
  }

  let starting = false;
  async function start() {
    if (starting) return;
    starting = true;
    msg.textContent = '';
    live.textContent = '';
    levels.length = 0;
    try {
      rec = new Recorder({
        onText: (t) => { live.textContent = t; },
        onLevel: (l) => { levels.push(l); if (levels.length > 158) levels.shift(); draw(); },
      });
      await rec.start();
      if (!asrSupported) msg.textContent = tx('Цей браузер не розпізнає польську: запис збережеться, а текст можна вписати вручну. Для авто-транскрипту — Chrome, Edge або Safari.');
    } catch (e) {
      rec = null;
      msg.textContent = e?.name === 'NotAllowedError'
        ? tx('Мікрофон заблоковано. Натисни на замок біля адреси сайту → Мікрофон → Дозволити. Поки що працює секундомір — говори вголос.')
        : tx('Мікрофон недоступний. Працює секундомір — говори вголос, а потім за бажанням впиши текст.');
    }
    starting = false;
    running = true;
    t0 = performance.now();
    btn.classList.add('on');
    btn.replaceChildren(icon('stop', 30));
    cap.textContent = tx('Говорю… натисни, щоб завершити');
    tick = setInterval(update, 200);
  }

  async function stop() {
    if (!running) return;
    running = false;
    clearInterval(tick);
    btn.disabled = true;
    cap.textContent = tx('Обробляю…');
    const res = rec ? await rec.stop() : { blob: null, url: null, transcript: '', duration: (performance.now() - t0) / 1000 };
    rec = null;
    btn.disabled = false;
    btn.classList.remove('on');
    btn.replaceChildren(icon('mic', 32));
    cap.textContent = label;
    onDone(res);
  }

  btn.addEventListener('click', () => (running ? stop() : start()));
  onCleanup(() => { clearInterval(tick); if (rec) { running = false; rec.stop(); } });
  root.abort = () => { clearInterval(tick); if (rec) { running = false; rec.stop(); rec = null; } };
  return root;
}

// ------------------------------------------------------------------ звіт про мовлення
function speechReport(a, task, duration) {
  const [tmin, tmax] = task.time || [60, 120];
  const durNote = { short: tx('Замало — ціль {0}–{1}. Додай приклад або причину.', fmtTime(tmin), fmtTime(tmax)), ok: tx('У межах цілі.'), long: tx('Задовго — на іспиті обірвуть. Ціль {0}–{1}.', fmtTime(tmin), fmtTime(tmax)) }[a.durFit];
  const pace = a.wpm < 55 ? tx('повільно') : a.wpm > 150 ? tx('дуже швидко') : a.wpm < 75 ? tx('спокійно') : tx('добрий темп');
  const box = (title, ...kids) => h('div', { class: 'metric' }, h('div', { class: 'eyebrow' }, title), ...kids);
  return h('div', { class: 'report' },
    h('div', { class: 'metrics' },
      box(tx('Час'), h('div', { class: 'big' }, fmtTime(duration)), h('div', { class: `mnote ${a.durFit === 'ok' ? 'ok' : 'warn'}` }, durNote)),
      box(tx('Темп'), duration < 15 ? h('div', { class: 'big' }, '—') : h('div', { class: 'big' }, `${a.wpm}`, h('small', null, tx(' сл/хв'))), h('div', { class: 'mnote' }, duration < 15 ? tx('{0} слів (запис закороткий для темпу)', a.words) : tx('{0} слів · {1}', a.words, pace))),
      box(tx('Слова по темі'), h('div', { class: 'chips' }, [...a.hit.map((k) => h('span', { class: 'chip chip--ok' }, icon('check', 12), k)), ...a.miss.map((k) => h('span', { class: 'chip chip--miss' }, k))]),
        h('div', { class: 'mnote' }, tx('{0} з {1}{2}', a.hit.length, a.hit.length + a.miss.length, a.miss.length ? tx(' — спробуй вплести пропущені') : tx(' — чудово')))),
      box(tx('Зв’язки'), a.connectors.length ? h('div', { class: 'chips' }, a.connectors.map((c) => h('span', { class: 'chip' }, c.word))) : h('div', { class: 'mnote warn' }, tx('Жодної. Додай «po pierwsze», «ponieważ», «jednak»…')),
        h('div', { class: 'mnote' }, tx('{0} різних{1}', a.connectors.length, a.connectors.length < 3 ? tx(' — мало') : ''))),
      box(tx('Паузи-«наповнювачі»'), a.fillerTotal ? h('div', { class: 'chips' }, Object.entries(a.fillers).map(([w, n]) => h('span', { class: 'chip chip--warn' }, `${w} ×${n}`))) : h('div', { class: 'mnote ok' }, tx('У транскрипті не знайдено')),
        h('div', { class: 'mnote' }, tx('Браузер не записує «еее» — послухай свій запис.'))),
    ),
    a.points.some((p) => p.ok !== null) && h('div', { class: 'note' }, h('div', { class: 'eyebrow' }, tx('Пункти плану')), h('ul', { class: 'checklist' }, a.points.filter((p) => p.ok !== null).map((p) => h('li', { class: p.ok ? 'ok' : 'no' }, icon(p.ok ? 'check' : 'x', 15), p.text)))),
    a.findings.length > 0 && h('div', { class: 'note note--red' }, h('div', { class: 'eyebrow' }, tx('Червоним олівцем')), h('ul', { class: 'flist' }, a.findings.map((f) => h('li', null, h('mark', { class: 'mk mk-err' }, '…'), rich(f.msg))))));
}

// ------------------------------------------------------------------ самооцінка
function selfRating(onChange) {
  const vals = SELF.map(() => 0);
  const rows = SELF.map(([name, hint], i) => {
    const pills = [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: 'pill', 'aria-label': `${name}: ${n}`, onclick: () => { vals[i] = n; pills.forEach((p, k) => p.classList.toggle('on', k < n)); onChange(vals.every(Boolean) ? Math.round((vals.reduce((a, b) => a + b, 0) / (vals.length * 5)) * 100) : null); } }, n));
    return h('div', { class: 'srow' }, h('div', { class: 'slabel' }, h('strong', null, name), h('span', null, hint)), h('div', { class: 'pills' }, pills));
  });
  return h('div', { class: 'note' }, h('div', { class: 'eyebrow' }, tx('Оціни себе чесно (1 — слабо, 5 — впевнено)')), rows);
}

// ------------------------------------------------------------------ модель
function modelSection(task) {
  return h('details', { class: 'model' },
    h('summary', null, icon('eye', 18), tx('Модельна відповідь'), h('span', { class: 'hint' }, tx(' — відкривай після власної спроби'))),
    task.model && readAloud(task.model, { title: tx('Приклад відповіді') }),
    h('p', { class: 'hint' }, tx('У зразках минулий час — у жіночій формі; чоловікам: -łam → -łem, -am → -em.')),
    tipBox(task.tips));
}

// ------------------------------------------------------------------ головний екран
export async function speakView(weekId, taskId) {
  const level = store.get().level;
  const week = await loadWeek(weekId, level);
  const task = (week.speaking || []).find((t) => t.id === taskId);
  if (!task) throw new Error(tx('Завдання не знайдено'));
  const key = store.taskKey(weekId, level, 'speaking', taskId);
  const idx = week.speaking.indexOf(task);
  const nextTask = week.speaking[idx + 1];

  onCleanup(() => stopSpeaking());

  // ---- ліва картка завдання
  const notes = h('textarea', { class: 'notes', rows: 5, placeholder: tx('Нотатки (на іспиті дозволені): ключові слова, порядок думок…'), value: store.get().notes[task.id] || '' });
  notes.addEventListener('input', () => { store.get().notes[task.id] = notes.value; store.save(); });
  const uaBox = h('p', { class: 'ua-prompt', hidden: true }, task.promptUa);
  const brief = h('aside', { class: 'brief card' },
    h('div', { class: 'brief-top' }, stamp(TYPE_LABEL[task.type] || 'Zadanie'), h('span', { class: 'meta' }, `${level} · ${week.theme?.pl || ''}`)),
    h('h2', { class: 'brief-title' }, task.title),
    task.scene && sceneEl(task.scene),
    h('p', { class: 'prompt-pl' }, task.prompt, ' ', speakBtn(task.prompt, { cls: 'ico--sm' })),
    h('button', { class: 'linkbtn', type: 'button', onclick: (e) => { uaBox.hidden = !uaBox.hidden; e.currentTarget.textContent = uaBox.hidden ? tx('Показати переклад завдання') : tx('Сховати переклад'); } }, tx('Показати переклад завдання')),
    uaBox,
    task.points?.length > 0 && h('div', null, h('div', { class: 'eyebrow mt' }, tx('План відповіді')), h('ol', { class: 'plan' }, task.points.map((p) => h('li', null, typeof p === 'string' ? p : p.text)))),
    task.keywords?.length > 0 && h('div', null, h('div', { class: 'eyebrow mt' }, tx('Слова-мішені')), h('div', { class: 'chips' }, task.keywords.map((k) => h('span', { class: 'chip' }, k.split('|')[0])))),
    h('div', { class: 'eyebrow mt' }, tx('Нотатки')), notes,
    task.phrases?.length > 0 && h('details', { class: 'fold' }, h('summary', null, tx('Корисні фрази')), phraseRows(task.phrases)));

  // ---- права частина
  const stage = h('section', { class: 'stage' });
  const result = { transcripts: [], duration: 0, urls: [] };

  function finishSection(getTranscript, getDuration, taskForAnalysis) {
    const box = h('div', { class: 'finish' });
    let auto = null, selfScore = null, analysed = false;
    const analysisSlot = h('div', { class: 'slot' });
    const transcript = h('textarea', { class: 'transcript', rows: 5, placeholder: asrSupported ? tx('Тут з’явиться те, що почув браузер. Виправ помилки розпізнавання, якщо треба.') : tx('Впиши, що ти сказав(ла) — так аналіз буде точнішим (необов’язково).') });
    transcript.value = getTranscript();
    const saveBtn = h('button', { class: 'btn btn--red', type: 'button', onclick: save }, icon('check', 18), tx('Зарахувати спробу'));
    function run() {
      const dur = getDuration();
      const a = analyzeSpeech(transcript.value, dur, taskForAnalysis, level);
      auto = a.score;
      analysed = true;
      clear(analysisSlot).append(
        h('div', { class: 'report-head' }, a.score != null ? circledGrade(a.grade) : null, h('div', null, h('h3', null, a.score != null ? tx('Що побачив «олівець»') : tx('Транскрипту замало для аналізу')), h('p', { class: 'hint' }, a.score != null ? tx('Це формальні ознаки: час, слова по темі, зв’язки, кальки. Вимову й граматику оціни сам нижче.') : tx('Запиши довшу відповідь або впиши текст вручну — тоді покажу деталі.')))),
        a.score != null && speechReport(a, taskForAnalysis, dur));
    }
    function save() {
      if (!analysed && transcript.value.trim().length > 20) run();
      const score = auto != null && selfScore != null ? Math.round((auto + selfScore) / 2) : (selfScore ?? auto);
      store.markDone(key, score, { dur: Math.round(getDuration()) });
      toast(score != null ? tx('Зараховано: {0} · {1}%', gradeFromScore(score), score) : tx('Зараховано!'));
      saveBtn.replaceChildren(icon('check', 18), tx('Зараховано'));
      saveBtn.disabled = true;
    }
    const aiBtn = h('button', { class: 'btn btn--ghost', type: 'button', onclick: async () => {
      const t = transcript.value.trim();
      if (!t) return toast(tx('Спершу впиши або дочекайся транскрипту.'));
      await copyText(buildTeacherPrompt({ kind: 'speaking', level, task: taskForAnalysis, text: t }));
      toast(tx('Запит скопійовано — встав у ChatGPT або Claude для докладного розбору.'), 4000);
    } }, icon('copy', 16), tx('Розбір від ШІ-вчителя'));
    box.append(
      h('label', { class: 'field-label' }, tx('Транскрипт відповіді')), transcript,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: run }, icon('spark', 18), tx('Проаналізувати')), aiBtn),
      analysisSlot,
      selfRating((v) => { selfScore = v; }),
      h('div', { class: 'row' }, saveBtn, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { stopSpeaking(); go('prep'); } }, icon('redo', 16), tx('Ще раз')),
        nextTask ? h('a', { class: 'btn btn--ghost', href: `#/speak/${weekId}/${nextTask.id}` }, tx('Наступне завдання'), icon('arrow', 16)) : h('a', { class: 'btn btn--ghost', href: `#/week/${weekId}` }, tx('До тижня'), icon('arrow', 16))),
      modelSection(task));
    if (transcript.value.trim().length > 20) run();
    return box;
  }

  // ---- монолог / опис ілюстрації
  function go(phase) {
    stopSpeaking();
    clear(stage);
    if (task.type === 'dialogue') return dialogue(phase);
    if (phase === 'prep') return prep();
    if (phase === 'rec') return recording();
  }

  function prep() {
    const total = task.prep ?? (level === 'B2' ? 90 : 60);
    let left = total, t = null;
    const big = h('div', { class: 'bigtimer' }, fmtTime(left));
    const startBtn = h('button', { class: 'btn', type: 'button', onclick: () => {
      startBtn.disabled = true;
      t = setInterval(() => { left--; big.textContent = fmtTime(left); if (left <= 0) { clearInterval(t); big.classList.add('done'); toast(tx('Час на підготовку минув — говори!')); } }, 1000);
    } }, icon('play', 16), tx('Запустити підготовку'));
    onCleanup(() => clearInterval(t));
    stage.append(h('div', { class: 'stage-card' },
      h('div', { class: 'eyebrow' }, tx('Крок 1 · Підготовка')), big,
      h('p', { class: 'hint' }, tx('На іспиті є час на нотатки. Прочитай план ліворуч, запиши 5–6 ключових слів — і говори. Повними реченнями, не списком слів.')),
      h('div', { class: 'row' }, startBtn, h('button', { class: 'btn btn--red', type: 'button', onclick: () => { clearInterval(t); go('rec'); } }, icon('mic', 18), tx('Говорити зараз')))));
  }

  function recording() {
    const panel = recordPanel({ target: task.time || [60, 120], label: tx('Почати запис'), onDone: (res) => {
      clear(stage);
      const dur = res.duration;
      stage.append(h('div', { class: 'stage-card' },
        h('div', { class: 'eyebrow' }, tx('Крок 3 · Розбір')),
        res.url ? h('div', { class: 'player' }, h('div', { class: 'eyebrow' }, tx('Твій запис')), h('audio', { controls: true, src: res.url })) : h('p', { class: 'hint' }, tx('Запису немає (мікрофон недоступний) — але секундомір показав ') + fmtTime(dur) + '.'),
        finishSection(() => res.transcript, () => dur, task)));
      stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } });
    stage.append(h('div', { class: 'stage-card' }, h('div', { class: 'eyebrow' }, tx('Крок 2 · Відповідь')), panel,
      h('p', { class: 'hint' }, tx('Говори до кінця, навіть якщо помилився: на іспиті не можна зупинятися й починати спочатку. Виправляйся на ходу («przepraszam, chciałem powiedzieć…»).'))));
  }

  // ---- діалог з екзаменатором
  function dialogue() {
    const turns = task.turns || [];
    let i = 0;
    const hide = { on: level === 'B2' };
    const rec = [];
    const wrap = h('div', { class: 'stage-card' });
    stage.append(wrap);

    function turnView() {
      clear(wrap);
      if (i >= turns.length) return summary();
      const t = turns[i];
      const line = h('div', { class: `bubble ${hide.on ? 'blur' : ''}` }, h('span', { class: 'who' }, 'Egzaminator'), h('span', { class: 'said' }, t.ex));
      const say = () => {
        if (!ttsSupported) return toast(tx('Озвучення недоступне — прочитай репліку.'));
        if (!hasPolishVoice()) toast(tx('Польського голосу в системі немає — додай його в налаштуваннях ОС.'), 4000);
        speak([{ text: t.ex, pitch: 0.85, role: 'm' }], { rate: store.get().rate });
      };
      const model = h('div', { class: 'note note--green', hidden: true }, h('div', { class: 'eyebrow' }, tx('Так можна відповісти')), h('p', { class: 'modelline' }, t.model, ' ', speakBtn(t.model, { cls: 'ico--sm' })));
      const panelSlot = h('div');
      const panel = recordPanel({ target: t.time || (level === 'B2' ? [15, 40] : [8, 25]), label: tx('Відповісти'), onDone: (res) => {
        rec[i] = res;
        clear(panelSlot).append(h('div', { class: 'note' }, h('div', { class: 'eyebrow' }, tx('Твоя відповідь')), res.url && h('audio', { controls: true, src: res.url }), h('p', { class: 'said-you' }, res.transcript || tx('(текст не розпізнано)'))),
          h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => { model.hidden = false; } }, icon('eye', 16), tx('Показати зразок')), h('button', { class: 'btn btn--red', type: 'button', onclick: () => { i++; turnView(); } }, i + 1 < turns.length ? tx('Далі') : tx('Завершити розмову'), icon('arrow', 16))), model);
      } });
      panelSlot.append(panel);
      wrap.append(
        h('div', { class: 'eyebrow' }, tx('Розмова · репліка {0}/{1}', i + 1, turns.length)),
        line,
        h('div', { class: 'row' }, h('button', { class: 'btn btn--sm', type: 'button', onclick: say }, icon('play', 14), tx('Послухати')),
          h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: (e) => { hide.on = !hide.on; line.classList.toggle('blur', hide.on); e.currentTarget.textContent = hide.on ? tx('Показати текст') : tx('Сховати текст'); } }, hide.on ? tx('Показати текст') : tx('Сховати текст'))),
        t.hint && h('p', { class: 'hint' }, icon('bulb', 14), ' ', t.hint),
        panelSlot);
      setTimeout(say, 350);
    }

    function summary() {
      const transcript = rec.map((r) => r?.transcript || '').join(' ').trim();
      const dur = rec.reduce((s, r) => s + (r?.duration || 0), 0);
      const forAnalysis = { ...task, time: [0, 9999] };
      wrap.append(h('div', { class: 'eyebrow' }, tx('Крок 3 · Розбір розмови')),
        h('div', { class: 'note' }, h('div', { class: 'eyebrow' }, tx('Повна модель діалогу')),
          h('div', { class: 'dlg' }, turns.flatMap((t) => [h('p', { class: 'dlg-ex' }, h('b', null, 'Egzaminator: '), t.ex), h('p', { class: 'dlg-you' }, h('b', null, 'Ty: '), t.model)])),
          h('button', { class: 'btn btn--sm', type: 'button', onclick: () => speak(turns.flatMap((t) => [{ text: t.ex, pitch: 0.85, pause: 350, role: 'm' }, { text: t.model, pitch: 1.12, pause: 500, role: 'f' }]), { rate: store.get().rate }) }, icon('play', 14), tx('Послухати весь діалог'))),
        finishSection(() => transcript, () => dur, forAnalysis));
    }
    turnView();
  }

  const root = h('div', { class: 'view' },
    backTo(`#/week/${weekId}`, tx('Тиждень · {0}', week.theme?.pl || '')),
    h('div', { class: 'studio' }, brief, stage));
  go('prep');
  return root;
}
