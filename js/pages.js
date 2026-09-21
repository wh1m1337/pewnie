// Головна, тижні, розділи «Мовлення» і «Письмо».
import { h, icon, plural, fmtDate, todayISO, daysBetween, rich, SKILLS } from './util.js';
import * as store from './store.js';
import { getWeeks, loadWeek, loadAllUnlocked, nextRelease } from './content.js';
import { stamp, pageHead, backTo, circledGrade, pencilBar, skillsDots } from './ui.js';
import { gradeFromScore } from './analyze.js';
import { TYPE_LABEL } from './speak.js';
import { KIND_LABEL } from './write.js';

const rerender = () => window.dispatchEvent(new Event('pewnie:rerender'));
const routeOf = (skill, weekId, id) => ({ speaking: 'speak', writing: 'write', listening: 'listen', reading: 'read', grammar: 'grammar' }[skill] ? `#/${{ speaking: 'speak', writing: 'write', listening: 'listen', reading: 'read', grammar: 'grammar' }[skill]}/${weekId}/${id}` : '#/');

export function levelSwitch() {
  const cur = store.get().level;
  return h('div', { class: 'lvl', role: 'group', 'aria-label': 'Рівень' }, ['B1', 'B2'].map((l) => h('button', { type: 'button', class: `lvl-btn ${cur === l ? 'on' : ''}`, 'aria-pressed': cur === l, onclick: () => { store.patch({ level: l }); rerender(); } }, l)));
}

function taskRow({ href, ico, title, sub, tag, key }) {
  const d = key ? store.get().done[key] : null;
  return h('a', { class: `trow ${d ? 'done' : ''}`, href },
    h('span', { class: 'trow-ico' }, icon(ico, 20)),
    h('span', { class: 'trow-main' }, h('span', { class: 'trow-title' }, title), h('span', { class: 'trow-sub' }, sub)),
    tag && h('span', { class: 'tag' }, tag),
    d ? (d.score != null ? circledGrade(gradeFromScore(d.score), true) : h('span', { class: 'tick' }, icon('check', 18))) : h('span', { class: 'go' }, icon('arrow', 18)));
}

const est = (t) => (t.type === 'dialogue' ? '≈ 6 хв' : t.type === 'describe' ? '≈ 4 хв' : '≈ 5 хв');

// ------------------------------------------------------------------ головна
export async function homeView() {
  const st = store.get();
  const level = st.level;
  const weeks = await getWeeks();
  const unlocked = weeks.filter((w) => w.unlocked);
  const packs = await Promise.all(unlocked.map((w) => loadWeek(w.id, level)));
  const latest = packs[packs.length - 1];
  const next = await nextRelease();

  // місія дня: найновіше невиконане
  const mission = [];
  const firstUndone = (skill) => {
    for (const p of [...packs].reverse()) {
      const t = (p[skill] || []).find((x) => !store.isDone(store.taskKey(p.id, level, skill, x.id)));
      if (t) return { p, t };
    }
    return null;
  };
  const sp = firstUndone('speaking'), wr = firstUndone('writing');
  if (sp) mission.push({ href: `#/speak/${sp.p.id}/${sp.t.id}`, ico: 'mic', title: sp.t.title, sub: `Мовлення · ${TYPE_LABEL[sp.t.type]} · ${est(sp.t)}` });
  if (wr) mission.push({ href: `#/write/${wr.p.id}/${wr.t.id}`, ico: 'pen', title: wr.t.title, sub: `Письмо · ${KIND_LABEL[wr.t.kind] || ''} · ≈ ${wr.t.time || 20} хв` });
  const allVocab = packs.flatMap((p) => p.vocab || []);
  const due = allVocab.filter((v) => { const s = store.vocabState(v.pl); return !s || s.due <= todayISO(); }).length;
  if (due) mission.push({ href: '#/vocab', ico: 'cards', title: `${Math.min(due, 10)} слів на сьогодні`, sub: 'Картки · ≈ 3 хв' });
  if (mission.length < 3) { const q = firstUndone('listening') || firstUndone('grammar'); if (q) { const sk = q.p.listening?.includes(q.t) ? 'listening' : 'grammar'; mission.push({ href: routeOf(sk, q.p.id, q.t.id), ico: SKILLS[sk].icon, title: q.t.title, sub: `${SKILLS[sk].ua} · ≈ 5 хв` }); } }

  const streak = store.streak();
  const doneCount = Object.keys(st.done).filter((k) => k.includes(`:${level}:`)).length;
  const learned = Object.values(st.vocab).filter((v) => v.box >= 4).length;
  const exam = st.examDate && st.examDate >= todayISO() ? daysBetween(todayISO(), st.examDate) : null;

  const cells = store.activityWeeks(14);
  const heat = h('div', { class: 'heat', role: 'img', 'aria-label': 'Активність за 14 тижнів' }, cells.map((c) => h('i', { class: `h${c.future ? 'f' : Math.min(4, c.n)}`, title: `${fmtDate(c.d)}: ${c.n}` })));

  const skillBars = ['speaking', 'writing', 'listening', 'reading', 'grammar'].map((k) => {
    const sc = store.skillScore(level, k), n = store.skillCount(level, k);
    return h('a', { class: `skill ${k === 'speaking' || k === 'writing' ? 'skill--main' : ''}`, href: `#/${{ speaking: 'speak', writing: 'write', listening: 'listen', reading: 'read', grammar: 'grammar' }[k]}` }, h('div', { class: 'skill-h' }, icon(SKILLS[k].icon, 18), h('span', null, SKILLS[k].ua), h('em', null, SKILLS[k].pl)), pencilBar(sc, { sub: n ? `${n} ${plural(n, ['завдання', 'завдання', 'завдань'])}` : 'ще не починали', tone: 'ink' }));
  });

  return h('div', { class: 'view home' },
    h('section', { class: 'hero' },
      h('div', { class: 'hero-copy' },
        h('div', { class: 'eyebrow' }, 'Certyfikat państwowy · B1 / B2'),
        h('h1', { class: 'hero-title' }, h('span', null, 'Mów.'), h('span', null, 'Pisz.'), h('span', { class: 'pen' }, 'Pewnie.')),
        h('p', { class: 'lead' }, 'Тренажер усної й письмової частин державного іспиту з польської. Говориш у мікрофон — отримуєш розбір. Пишеш — вчителька перевіряє червоним олівцем. Щопонеділка — нові завдання.'),
        h('div', { class: 'hero-row' }, levelSwitch(), exam != null && h('span', { class: 'chip chip--date' }, icon('cal', 14), `До іспиту ${exam} ${plural(exam, ['день', 'дні', 'днів'])}`))),
      h('div', { class: 'hero-note note note--yellow' },
        h('div', { class: 'eyebrow' }, `Tydzień ${latest.n} · відкрито`),
        h('h2', { class: 'hn-title' }, latest.theme.pl), h('p', null, latest.theme.ua),
        h('div', { class: 'dots' }, skillsDots(latest, level).map((d) => h('span', { class: `dot ${d.done === d.total ? 'full' : ''}`, title: `${SKILLS[d.k].ua}: ${d.done}/${d.total}` }, icon(SKILLS[d.k].icon, 14), `${d.done}/${d.total}`))),
        h('a', { class: 'btn btn--red', href: `#/week/${latest.id}` }, 'Відкрити тиждень', icon('arrow', 16)),
        next && h('p', { class: 'next' }, icon('lock', 13), ` Наступний тиждень — ${fmtDate(next.release)} (за ${next.inDays} ${plural(next.inDays, ['день', 'дні', 'днів'])}): «${next.theme.pl}»`))),

    h('section', { class: 'grid2' },
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('h2', null, 'Місія на сьогодні'), h('span', { class: 'meta' }, '≈ 15 хвилин')),
        mission.length ? h('div', { class: 'trows' }, mission.map((m) => taskRow(m))) : h('p', { class: 'hint' }, 'Усе, що відкрито, вже виконано. Чудова робота — новий тиждень з’явиться в понеділок.')),
      h('div', { class: 'card stats' },
        h('div', { class: 'stat' }, h('div', { class: 'stat-n' }, icon('flame', 22), streak), h('div', { class: 'stat-l' }, `${plural(streak, ['день', 'дні', 'днів'])} поспіль`)),
        h('div', { class: 'stat' }, h('div', { class: 'stat-n' }, doneCount), h('div', { class: 'stat-l' }, `завдань на ${level}`)),
        h('div', { class: 'stat' }, h('div', { class: 'stat-n' }, learned), h('div', { class: 'stat-l' }, 'слів вивчено')),
        heat)),

    h('section', { class: 'card' },
      h('div', { class: 'card-h' }, h('h2', null, `Навички · ${level}`), h('span', { class: 'meta' }, 'середній бал за спробами')),
      h('div', { class: 'skills' }, skillBars)),

    h('section', { class: 'method' },
      h('h2', null, 'Як тут тренуються'),
      h('div', { class: 'steps' },
        [['01', 'Підготовка', 'Прочитай завдання, склади план у нотатках — рівно як на іспиті.'], ['02', 'Відповідь', 'Говори в мікрофон або пиши в зошит. Таймер і ліміт слів — за правилами іспиту.'], ['03', 'Червоний олівець', 'Розбір: пункти завдання, зв’язки, кальки з української, діакритика.'], ['04', 'Зразок', 'Модельна відповідь з озвученням — повторюй речення вголос (shadowing).']]
          .map(([n, t, d]) => h('div', { class: 'step' }, h('span', { class: 'step-n' }, n), h('h3', null, t), h('p', null, d))))));
}

// ------------------------------------------------------------------ усі тижні
export async function weeksView() {
  const weeks = await getWeeks();
  const level = store.get().level;
  const cards = await Promise.all(weeks.map(async (w) => {
    if (!w.unlocked) {
      return h('div', { class: 'wcard locked' }, h('div', { class: 'wnum' }, `Tydzień ${w.n}`), h('h3', null, w.theme.pl), h('p', null, w.blurb),
        h('div', { class: 'wfoot' }, icon('lock', 14), `відкриється ${fmtDate(w.release)}`));
    }
    const p = await loadWeek(w.id, level);
    const dots = skillsDots(p, level);
    const total = dots.reduce((s, d) => s + d.total, 0), done = dots.reduce((s, d) => s + d.done, 0);
    return h('a', { class: 'wcard', href: `#/week/${w.id}` }, h('div', { class: 'wnum' }, `Tydzień ${w.n}`), h('h3', null, w.theme.pl), h('p', null, w.blurb),
      pencilBar(total ? (done / total) * 100 : 0, {}), h('div', { class: 'wfoot' }, `${done} з ${total} завдань · від ${fmtDate(w.release)}`));
  }));
  return h('div', { class: 'view' }, pageHead({ eyebrow: 'Календар', title: 'Тижні', sub: 'Кожного понеділка відкривається нова тема з повним набором: мовлення, письмо, аудіювання, читання, граматика й слова.', actions: levelSwitch() }), h('div', { class: 'wgrid' }, cards));
}

// ------------------------------------------------------------------ один тиждень
export async function weekView(id) {
  const level = store.get().level;
  const w = await loadWeek(id, level);
  const sections = [];
  const add = (skill, arr, mapper) => { if (arr?.length) sections.push(h('section', { class: 'wsec' }, h('h2', null, icon(SKILLS[skill].icon, 22), SKILLS[skill].ua, h('em', null, SKILLS[skill].pl)), h('div', { class: 'trows' }, arr.map((t) => taskRow({ ...mapper(t), key: store.taskKey(id, level, skill, t.id) }))))); };
  add('speaking', w.speaking, (t) => ({ href: `#/speak/${id}/${t.id}`, ico: 'mic', title: t.title, sub: est(t), tag: TYPE_LABEL[t.type] }));
  add('writing', w.writing, (t) => ({ href: `#/write/${id}/${t.id}`, ico: 'pen', title: t.title, sub: `${t.min}–${t.max} слів · ≈ ${t.time} хв`, tag: KIND_LABEL[t.kind] }));
  add('listening', w.listening, (t) => ({ href: `#/listen/${id}/${t.id}`, ico: 'ear', title: t.title, sub: `${t.questions.length} питання`, tag: 'Słuchanie' }));
  add('reading', w.reading, (t) => ({ href: `#/read/${id}/${t.id}`, ico: 'book', title: t.title, sub: `${t.questions.length} питання`, tag: 'Czytanie' }));
  add('grammar', w.grammar, (t) => ({ href: `#/grammar/${id}/${t.id}`, ico: 'cards', title: t.title, sub: `${t.questions.length} речень`, tag: 'Gramatyka' }));
  return h('div', { class: 'view' }, backTo('#/weeks', 'Усі тижні'),
    pageHead({ eyebrow: `Tydzień ${w.n} · від ${fmtDate(w.release)} · ${level}`, title: w.theme.pl, sub: w.intro || w.theme.ua }),
    h('div', { class: 'wsecs' }, sections,
      w.vocab?.length ? h('section', { class: 'wsec' }, h('h2', null, icon('cards', 22), 'Слова', h('em', null, 'Słownictwo')), h('div', { class: 'trows' }, h('a', { class: 'trow', href: '#/vocab' }, h('span', { class: 'trow-ico' }, icon('cards', 20)), h('span', { class: 'trow-main' }, h('span', { class: 'trow-title' }, `${w.vocab.length} слів тижня`), h('span', { class: 'trow-sub' }, w.vocab.slice(0, 4).map((v) => v.pl).join(' · ') + ' …')), h('span', { class: 'go' }, icon('arrow', 18))))) : null));
}

// ------------------------------------------------------------------ хаби: усе мовлення / письмо / аудіювання / читання / граматика
const HUB = {
  speaking: { route: 'speak', title: 'Мовлення', sub: 'Записуй відповідь, чуй себе з боку, порівнюй із зразком. Діалоги — з «екзаменатором», який говорить польською.',
    intro: [['Opis ilustracji', 'Опиши, що на картинці: хто, де, що робить, який настрій — і що, на твою думку, було до і буде після.'], ['Monolog', 'Висловлення на задану тему за планом: позиція, аргументи, приклад, висновок. 1,5–2,5 хв без зупинок.'], ['Rozmowa', 'Життєва ситуація з екзаменатором: скарга, домовленість, прохання. Треба реагувати на живі репліки.']] },
  writing: { route: 'write', title: 'Письмо', sub: 'Редактор-зошит із польськими літерами, таймером і перевіркою червоним олівцем: пункти, зв’язки, кальки, діакритика.',
    intro: [['Короткий текст', 'SMS, повідомлення, оголошення — 25–60 слів. Головне — чітко й ввічливо, усі пункти.'], ['Лист', 'Неформальний (до друга) або офіційний (до установи). Звертання, завершення, регістр — половина балів.'], ['Розгорнутий текст', 'Опис, розповідь, аргументація на 150–250 слів: вступ, 2–3 думки, висновок і зв’язки між ними.']] },
  listening: { route: 'listen', title: 'Аудіювання', sub: 'Діалоги, оголошення й інтерв’ю з нейронним озвученням. Слухай двічі, як на іспиті, і відповідай на питання.',
    intro: [['Спершу питання', 'Перед прослуховуванням прочитай питання й варіанти: так знаєш, на що звертати увагу.'], ['Двічі, не більше', 'На іспиті запис звучить двічі. Тут теж: перший раз — загальний зміст, другий — деталі.'], ['Транскрипт — наприкінці', 'Після відповідей відкрий текст і послухай запис ще раз, читаючи його: так вухо вчиться розпізнавати слова.']] },
  reading: { route: 'read', title: 'Читання', sub: 'Тексти рівня іспиту: статті, поради, оголошення. Питання перевіряють розуміння головного й деталей.',
    intro: [['Питання — до тексту', 'Прочитай питання, потім текст: шукаєш відповідь, а не перечитуєш усе підряд.'], ['Перефразування', 'Правильна відповідь рідко повторює слова тексту — шукай синоніми й узагальнення.'], ['Розбір відповідей', 'Після перевірки читай пояснення: чому правильна саме ця й чому інші не підходять.']] },
  grammar: { route: 'grammar', title: 'Граматика', sub: 'Відмінки, часи, керування й складні речення в живих контекстах. До кожної відповіді — пояснення українською.',
    intro: [['Форма в контексті', 'Обираєш форму, яка пасує в реченні: відмінок, час, вид, прийменник.'], ['Пояснення', 'Кожне питання має коротке правило — воно й запам’ятовується, а не сама відповідь.'], ['Регулярність', 'Краще 5 питань щодня, ніж 50 раз на тиждень.']] },
};
const hubSub = (skill, t) => ({
  speaking: () => est(t), writing: () => `${t.min}–${t.max} слів · ≈ ${t.time} хв`,
  listening: () => `${t.questions.length} питання · ≈ 6 хв`, reading: () => `${t.questions.length} питання · ≈ 8 хв`, grammar: () => `${t.questions.length} речень · ≈ 4 хв`,
}[skill]());

export async function hubView(skill) {
  const level = store.get().level;
  const cfg = HUB[skill];
  const packs = (await loadAllUnlocked(level)).reverse();
  const filterable = skill === 'speaking' || skill === 'writing';
  const isSp = skill === 'speaking';
  const kinds = isSp ? TYPE_LABEL : skill === 'writing' ? KIND_LABEL : {};
  const usedKinds = filterable ? [...new Set(packs.flatMap((p) => (p[skill] || []).map((t) => (isSp ? t.type : t.kind))))] : [];
  let filter = 'all';
  const list = h('div', { class: 'hub-list' });
  const chips = h('div', { class: 'filters' });
  function draw() {
    if (filterable) chips.replaceChildren(...['all', ...usedKinds].map((k) => h('button', { type: 'button', class: `fchip ${filter === k ? 'on' : ''}`, onclick: () => { filter = k; draw(); } }, k === 'all' ? 'Усі' : kinds[k])));
    list.replaceChildren(...packs.map((p) => {
      const items = (p[skill] || []).filter((t) => filter === 'all' || (isSp ? t.type : t.kind) === filter);
      if (!items.length) return null;
      return h('section', { class: 'wsec' }, h('h3', { class: 'hub-week' }, h('span', null, `Tydzień ${p.n}`), p.theme.pl),
        h('div', { class: 'trows' }, items.map((t) => taskRow({ href: `#/${cfg.route}/${p.id}/${t.id}`, ico: SKILLS[skill].icon, title: t.title, sub: hubSub(skill, t), tag: filterable ? kinds[isSp ? t.type : t.kind] : SKILLS[skill].pl, key: store.taskKey(p.id, level, skill, t.id) }))));
    }));
  }
  draw();
  const sc = store.skillScore(level, skill), n = store.skillCount(level, skill);
  const total = packs.reduce((a, p) => a + (p[skill] || []).length, 0);
  return h('div', { class: 'view' },
    pageHead({ eyebrow: SKILLS[skill].pl, title: cfg.title, sub: cfg.sub, actions: levelSwitch() }),
    h('div', { class: 'hub-stat' }, pencilBar(sc, { label: `Твій середній бал · ${level}`, sub: `${n} з ${total} завдань виконано` })),
    h('div', { class: 'explain' }, cfg.intro.map(([t, d]) => h('div', { class: 'ex' }, h('h3', null, t), h('p', null, d)))),
    chips, list);
}
