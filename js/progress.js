// Прогрес, налаштування, дані, про сайт.
import { h, icon, toast, todayISO, plural, download, fmtDate, isoDate } from './util.js';
import * as store from './store.js';
import { pageHead, pencilBar, circledGrade } from './ui.js';
import { gradeFromScore } from './analyze.js';
import { levelSwitch } from './pages.js';
import { SKILLS } from './util.js';
import { plVoices, hasPolishVoice, speak, setVoicePref, setNeural, neuralAvailable, ttsSupported, asrSupported } from './speech.js';

const rerender = () => window.dispatchEvent(new Event('pewnie:rerender'));

export async function progressView() {
  const st = store.get();
  const level = st.level;

  const skills = ['speaking', 'writing', 'listening', 'reading', 'grammar'].map((k) => {
    const sc = store.skillScore(level, k), n = store.skillCount(level, k);
    return h('div', { class: 'skill' }, h('div', { class: 'skill-h' }, icon(SKILLS[k].icon, 18), h('span', null, SKILLS[k].ua)), pencilBar(sc, { sub: n ? `${n} ${plural(n, ['завдання', 'завдання', 'завдань'])}` : 'ще не починали' }));
  });

  const recent = Object.entries(st.done).sort((a, b) => b[1].ts - a[1].ts).slice(0, 12).map(([k, v]) => {
    const [week, lvl, skill, id] = k.split(':');
    return h('li', null, h('span', { class: 'mono' }, fmtDate(isoDate(new Date(v.ts)))), h('span', null, `${SKILLS[skill]?.ua || skill} · ${lvl} · ${week.replace('2026-', '').toUpperCase()} · ${id}`), v.score != null ? circledGrade(gradeFromScore(v.score), true) : h('span', null, '✓'));
  });

  const cells = store.activityWeeks(20);
  const heat = h('div', { class: 'heat heat--wide' }, cells.map((c) => h('i', { class: `h${c.future ? 'f' : Math.min(4, c.n)}`, title: `${fmtDate(c.d)}: ${c.n}` })));

  // --- налаштування
  const date = h('input', { type: 'date', class: 'input', value: st.examDate || '', min: todayISO() });
  date.addEventListener('change', () => { store.patch({ examDate: date.value || null }); toast(date.value ? 'Дату іспиту збережено' : 'Дату прибрано'); });
  const theme = h('div', { class: 'seg' }, [['auto', 'Авто'], ['light', 'Зошит'], ['dark', 'Дошка']].map(([v, l]) => h('button', { type: 'button', class: `seg-b ${st.theme === v ? 'on' : ''}`, onclick: () => { store.patch({ theme: v }); store.applyTheme(); rerender(); } }, l)));
  const rate = h('input', { type: 'range', min: 0.6, max: 1.15, step: 0.05, value: st.rate, class: 'range' });
  const rateOut = h('span', { class: 'mono' }, `${st.rate.toFixed(2)}×`);
  rate.addEventListener('input', () => { store.patch({ rate: +rate.value }); rateOut.textContent = `${(+rate.value).toFixed(2)}×`; });
  const neural = h('div', { class: 'seg' }, [[true, 'Нейронний'], [false, 'Системний']].map(([v, l]) => h('button', { type: 'button', class: `seg-b ${(st.neural !== false) === v ? 'on' : ''}`, onclick: () => { store.patch({ neural: v }); setNeural(v); rerender(); } }, l)));
  const voices = plVoices();
  const voiceSel = h('select', { class: 'input' }, h('option', { value: '' }, voices.length ? 'Автоматично' : 'Польських голосів не знайдено'), voices.map((v) => h('option', { value: v.name, selected: st.voice === v.name }, `${v.name} (${v.lang})`)));
  voiceSel.addEventListener('change', () => { store.patch({ voice: voiceSel.value || null }); setVoicePref(voiceSel.value); });

  const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async () => {
    try { store.importJSON(await file.files[0].text()); toast('Прогрес імпортовано'); rerender(); } catch (e) { toast(`Не вдалося: ${e.message}`, 4000); }
  } });

  return h('div', { class: 'view' },
    pageHead({ eyebrow: 'Ти', title: 'Прогрес і налаштування', sub: 'Усе зберігається в цьому браузері. Щоб перенести на інший пристрій — експортуй файл.', actions: levelSwitch() }),
    h('section', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', null, `Навички · ${level}`)), h('div', { class: 'skills' }, skills)),
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', null, 'Активність'), h('span', { class: 'meta' }, `серія: ${store.streak()} ${plural(store.streak(), ['день', 'дні', 'днів'])}`)), heat,
        h('div', { class: 'eyebrow mt' }, 'Останні завдання'), recent.length ? h('ul', { class: 'attempts' }, recent) : h('p', { class: 'hint' }, 'Поки порожньо — почни з мовлення на головній.'))),
    h('section', { class: 'card settings' },
      h('h2', null, 'Налаштування'),
      h('div', { class: 'setrow' }, h('label', null, 'Рівень іспиту'), levelSwitch()),
      h('div', { class: 'setrow' }, h('label', null, 'Дата іспиту'), date),
      h('div', { class: 'setrow' }, h('label', null, 'Вигляд'), theme),
      h('div', { class: 'setrow' }, h('label', null, 'Швидкість озвучення'), h('div', { class: 'rangewrap' }, rate, rateOut)),
      h('div', { class: 'setrow' }, h('label', null, 'Озвучення'), neural),
      h('div', { class: 'setrow' }, h('label', null, 'Системний голос (запасний)'), h('div', { class: 'rangewrap' }, voiceSel, h('button', { class: 'btn btn--sm', type: 'button', onclick: () => speak(['Dzień dobry! Nazywam się Ania i uczę się polskiego.'], { rate: st.rate }) }, icon('play', 14), 'Тест'))),
      !hasPolishVoice() && ttsSupported && h('p', { class: 'note note--red' }, 'У цьому пристрої не знайдено польського голосу. На Mac/iPhone: Системні налаштування → Універсальний доступ → Промовлений вміст → Голоси → додай Polski (Zosia / Krzysztof). На Windows: Параметри → Час і мова → Мова → Польська. Без нього озвучення не працюватиме.'),
      h('div', { class: 'facts' }, h('span', { class: `chip ${neuralAvailable() ? 'chip--ok' : 'chip--warn'}` }, `Нейронні голоси: ${neuralAvailable() ? 'є' : 'не завантажено'}`), h('span', { class: `chip ${ttsSupported ? 'chip--ok' : 'chip--warn'}` }, `Голос системи: ${ttsSupported ? 'є' : 'немає'}`), h('span', { class: `chip ${asrSupported ? 'chip--ok' : 'chip--warn'}` }, `Розпізнавання польської: ${asrSupported ? 'є' : 'немає — лише запис'}`))),
    h('section', { class: 'card' },
      h('h2', null, 'Мої дані'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { download(`pewnie-${todayISO()}.json`, store.exportJSON()); } }, icon('down', 16), 'Експорт'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => file.click() }, icon('up', 16), 'Імпорт'), file,
        h('button', { class: 'btn btn--ghost btn--danger', type: 'button', onclick: () => { if (confirm('Стерти весь прогрес на цьому пристрої? Дію не скасувати.')) { store.reset(); rerender(); location.hash = '#/'; } } }, 'Стерти все'))),
    h('section', { class: 'card about' },
      h('h2', null, 'Про сайт і приватність'),
      h('p', null, 'Pewnie — незалежний навчальний проєкт. Він не пов’язаний із Державною комісією з посвідчення знання польської мови як іноземної й не публікує завдань справжніх іспитів. Формат наближений до відкритих зразків на certyfikatpolski.pl — актуальні вимоги завжди перевіряй там.'),
      h('p', null, 'Твої записи й тексти не залишають пристрою: сайт статичний і не має сервера. Виняток — розпізнавання мови: його виконує сам браузер (Chrome і Edge надсилають звук на розпізнавання в хмару своїх розробників, Safari — в Apple). Хочеш цього уникнути — вимкни розпізнавання, записом користуйся як диктофоном, а транскрипт вписуй вручну.'),
      h('p', null, 'Оцінка «червоним олівцем» — автоматична й орієнтовна: вона бачить обсяг, структуру, зв’язки і типові помилки, але не розуміє змісту. Для точної оцінки скористайся кнопкою «Розбір від ШІ-вчителя» або живим репетитором.')));
}
