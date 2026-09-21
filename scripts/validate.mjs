// Перевірка контенту:  node scripts/validate.mjs
// Гарантує структуру + проганяє МОДЕЛЬНІ відповіді через той самий аналізатор, що бачить учень:
// зразок не має містити «помилок», покривати свої пункти й вкладатися в ліміт слів.
import { readFile, access } from 'node:fs/promises';
import { analyzeWriting, analyzeSpeech } from '../js/analyze.js';
import { extractCyr } from './i18n-lib.mjs';

const root = new URL('../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const wc = (t) => (t.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;

let errors = 0, warns = 0;
const err = (m) => { errors++; console.error(`  ✗ ${m}`); };
const warn = (m) => { warns++; console.warn(`  ! ${m}`); };
const need = (cond, m) => { if (!cond) err(m); };

const manifest = await read('content/index.json');
const seenIds = new Set();
const seenVocab = new Map();
let prevRelease = '';

for (const w of manifest.weeks) {
  console.log(`\n${w.id} · ${w.theme.pl}`);
  need(!seenIds.has(w.id), `дубль id ${w.id}`); seenIds.add(w.id);
  need(/^\d{4}-\d{2}-\d{2}$/.test(w.release), 'release має бути YYYY-MM-DD');
  need(new Date(w.release + 'T00:00:00Z').getUTCDay() === 1, `release ${w.release} — не понеділок`);
  need(w.release > prevRelease, 'release не за зростанням'); prevRelease = w.release;
  need(w.theme?.pl && w.theme?.ua && w.blurb, 'немає theme/blurb');

  for (const level of ['B1', 'B2']) {
    const file = `content/weeks/${w.id}.${level.toLowerCase()}.json`;
    try { await access(new URL(file, root)); } catch { err(`${file} відсутній`); continue; }
    const d = await read(file);
    console.log(`  ${level}`);
    const ids = new Set();
    const uniq = (id, kind) => { need(!ids.has(`${kind}:${id}`), `${level}: дубль id ${kind}:${id}`); ids.add(`${kind}:${id}`); };

    need(d.speaking?.length >= 3, `${level}: потрібно ≥3 завдань з мовлення`);
    need(d.writing?.length >= 2, `${level}: потрібно ≥2 завдань з письма`);
    const types = new Set((d.speaking || []).map((t) => t.type));
    for (const t of ['describe', 'monologue', 'dialogue']) need(types.has(t), `${level}: немає speaking типу ${t}`);

    for (const t of d.speaking || []) {
      uniq(t.id, 'speaking');
      const tag = `${level} speaking ${t.id}`;
      need(t.title && t.prompt && t.promptUa, `${tag}: title/prompt/promptUa`);
      need(Array.isArray(t.points) && t.points.length >= 3, `${tag}: points ≥3`);
      need(Array.isArray(t.keywords) && t.keywords.length >= 5, `${tag}: keywords ≥5`);
      need(Array.isArray(t.phrases) && t.phrases.length >= 3, `${tag}: phrases ≥3`);
      need(Array.isArray(t.tips) && t.tips.length >= 2, `${tag}: tips ≥2`);
      if (t.type === 'describe') need(t.scene?.items?.length >= 5, `${tag}: scene.items ≥5`);
      if (t.type === 'dialogue') {
        need(t.turns?.length >= 3, `${tag}: turns ≥3`);
        for (const [i, u] of (t.turns || []).entries()) need(u.ex && u.model && u.hint, `${tag}: turn ${i + 1} без ex/model/hint`);
      } else {
        need(t.model, `${tag}: model`);
        const n = wc(t.model);
        const [lo, hi] = level === 'B1' ? [80, 150] : [120, 220];
        if (n < lo || n > hi) warn(`${tag}: модель ${n} слів (очікую ${lo}–${hi})`);
        const dur = Math.max(t.time[0], n / 1.7);
        const a = analyzeSpeech(t.model, dur, t, level);
        if (a.miss.length > Math.ceil(a.hit.length + a.miss.length) * 0.4) warn(`${tag}: модель не покриває слова-мішені: ${a.miss.join(', ')}`);
        if (a.findings.length) err(`${tag}: у моделі є «помилки» за аналізатором: ${a.findings.map((f) => f.msg).join(' | ')}`);
        console.log(`    · ${t.id} ${t.type}: ${n} слів, слова-мішені ${a.hit.length}/${a.hit.length + a.miss.length}, оцінка ${a.score}`);
      }
      if (t.type === 'dialogue') {
        const joined = t.turns.map((u) => u.model).join(' ');
        const a = analyzeSpeech(joined, 60, { ...t, time: [0, 9999] }, level);
        if (a.findings.length) err(`${tag}: у моделі діалогу є «помилки»: ${a.findings.map((f) => f.msg).join(' | ')}`);
        console.log(`    · ${t.id} dialogue: ${t.turns.length} реплік, слова-мішені ${a.hit.length}/${a.hit.length + a.miss.length}`);
        if (a.miss.length > 2) warn(`${tag}: у діалозі не використано слова-мішені: ${a.miss.join(', ')}`);
      }
    }

    for (const t of d.writing || []) {
      uniq(t.id, 'writing');
      const tag = `${level} writing ${t.id}`;
      need(t.title && t.prompt && t.promptUa && t.model, `${tag}: title/prompt/promptUa/model`);
      need(t.min > 0 && t.max > t.min && t.time > 0, `${tag}: min/max/time`);
      need(['informal', 'formal', 'neutral'].includes(t.register), `${tag}: register`);
      need(t.points?.length >= 3 && t.points.every((p) => p.text && p.keys?.length), `${tag}: points з keys`);
      need(t.phrases?.length >= 3, `${tag}: phrases ≥3`);
      const n = wc(t.model);
      if (n < Math.floor(t.min * 0.9) || n > Math.ceil(t.max * 1.1)) err(`${tag}: модель ${n} слів, ліміт ${t.min}–${t.max}`);
      const a = analyzeWriting(t.model, t, level);
      const bad = a.findings.filter((f) => f.type === 'err');
      if (bad.length) err(`${tag}: у моделі «помилки»: ${bad.map((f) => `«${t.model.slice(f.s, f.e)}» ${f.msg}`).join(' | ')}`);
      const warnFind = a.findings.filter((f) => f.type === 'warn');
      if (warnFind.length) warn(`${tag}: попередження аналізатора: ${warnFind.map((f) => `«${t.model.slice(f.s, f.e)}» ${f.msg}`).join(' | ')}`);
      const missing = a.points.filter((p) => p.ok === false).map((p) => p.text);
      if (missing.length) err(`${tag}: модель не покриває пункти: ${missing.join('; ')}`);
      const badStruct = a.structure.filter((s) => !s.ok).map((s) => s.text);
      if (badStruct.length) err(`${tag}: структура листа: ${badStruct.join('; ')}`);
      if (a.score < 78) warn(`${tag}: модель отримує лише ${a.score}% — перевір зв'язки/конструкції`);
      console.log(`    · ${t.id} ${t.kind}: ${n} слів (${t.min}–${t.max}), оцінка моделі ${a.score}% (${a.grade}), зв'язків ${a.connectors.length}, конструкцій ${a.complexity.length}`);
    }

    for (const skill of ['listening', 'reading', 'grammar']) {
      for (const t of d[skill] || []) {
        uniq(t.id, skill);
        const tag = `${level} ${skill} ${t.id}`;
        need(t.title, `${tag}: title`);
        if (skill === 'listening') need((t.lines || []).map((l) => l.t).join(' ').length > 300 || (t.script || '').length > 300, `${tag}: запис закороткий (lines/script)`);
        if (skill === 'reading') need(t.text?.length > 300, `${tag}: text`);
        need(t.questions?.length >= 3, `${tag}: питань ≥3`);
        for (const [i, q] of (t.questions || []).entries()) {
          need(q.q && q.options?.length === 4, `${tag} q${i + 1}: рівно 4 варіанти`);
          need(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${tag} q${i + 1}: answer`);
          need(q.why, `${tag} q${i + 1}: why`);
          if (new Set(q.options).size !== q.options.length) err(`${tag} q${i + 1}: однакові варіанти`);
        }
        // порядок варіантів у інтерфейсі перемішується (js/quiz.js), тож позиція правильної відповіді в JSON не має значення
      }
    }

    need(d.vocab?.length >= 8, `${level}: vocab ≥8`);
    for (const v of d.vocab || []) {
      need(v.pl && v.ua && v.ex, `${level} vocab: pl/ua/ex (${v.pl})`);
      if (seenVocab.has(v.pl)) warn(`${level} vocab: «${v.pl}» вже було в ${seenVocab.get(v.pl)}`);
      seenVocab.set(v.pl, `${w.id}/${level}`);
    }
  }
}

// англійські переклади: кожен український рядок має мати відповідник у *.en.json
console.log('\ni18n');
{
  const files = [...manifest.weeks.flatMap((w) => ['b1', 'b2'].map((l) => `content/weeks/${w.id}.${l}.json`)), 'content/toolkit.json', 'content/index.json'];
  for (const f of files) {
    let src; try { src = extractCyr(await read(f)); } catch { continue; }
    const en = await read(f.replace(/\.json$/, '.en.json')).catch(() => null);
    if (!en) { warn(`${f}: немає англійської накладки`); continue; }
    const miss = [...src.keys()].filter((p) => !(p in en));
    if (miss.length) warn(`${f}: не перекладено ${miss.length} рядків (напр. ${miss[0]})`);
  }
}

try {
  const tk = await read('content/toolkit.json');
  console.log('\ntoolkit.json');
  for (const k of ['exam', 'strategies', 'connectors', 'letters', 'phrases', 'friends', 'errors']) need(tk[k], `toolkit: немає ${k}`);
} catch (e) { err(`toolkit.json: ${e.message}`); }

console.log(`\n${errors ? '✗' : '✓'} помилок: ${errors}, попереджень: ${warns}`);
process.exit(errors ? 1 : 0);
