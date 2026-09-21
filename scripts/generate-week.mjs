// Поповнює чергу тижнів: генерує нові (B1 + B2) через Claude API й публікує лише те, що пройшло validate.mjs.
// Коли теми у scripts/themes.json закінчуються — просить Claude запропонувати нову тему.
//
//   node scripts/generate-week.mjs [--min-buffer 4] [--max-new 2] [--force] [--dry]
//
// --min-buffer N  скільки ще не відкритих тижнів має бути «в запасі» (за замовч. 4)
// --max-new N     скільки тижнів створювати за один запуск (за замовч. 2 — щоб контролювати витрати)
// --force         створити ще один тиждень попри запас
// --dry           нічого не викликати: показати план
//
// Без облікових даних Claude API (ANTHROPIC_API_KEY) скрипт завершується з кодом 0 і нічого не робить.
import { readFile, writeFile, rm, appendFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { complete, parseJSON, hasCredentials, costLine, MODEL } from './llm.mjs';

const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const readJSON = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const writeJSON = (p, v) => writeFile(new URL(p, root), JSON.stringify(v, null, 2) + '\n');

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function isoWeekId(s) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const wk = Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-w${String(wk).padStart(2, '0')}`;
}

const SYSTEM = `Ти — методист і носій польської, який пише навчальні матеріали для україномовних, що готуються до державного іспиту з польської мови як іноземної (certyfikat, рівні B1 і B2). Особлива увага — мовлення (mówienie) і письмо (pisanie).

Правила якості:
- Польський текст має бути ідеально правильним, природним і відповідати рівню. Пояснення, переклади, поради, intro — українською.
- Зразки (model) не повинні містити помилок; речення — різноманітні; для B2 — умовний спосіб, imiesłowy, складні речення, аргументація.
- Слова-мішені (keywords) у форматі «показ|основа»; основа — підрядок, що справді входить у зразок відповіді у потрібній формі.
- Письмові завдання: model уміщується в діапазон min–max слів (ЛІЧИ слова уважно: моделі зазвичай виходять КОРОТШИМИ, ніж здається — цілься у верхню половину діапазону); кожен пункт завдання (points[].keys) має бути покритий зразком; листи мають звертання й прощання відповідного регістру (formal: «Szanowni Państwo» + «Z poważaniem»; informal: «Cześć…» + «Ściskam/Pozdrawiam», займенники Ty/Ci/Cię/Twój з великої); довгий текст — щонайменше 3 абзаци, розділені порожнім рядком (\\n\\n).
- Обсяги: B1 — short 25–50 слів, long 150–175; B2 — short 60–90, long 200–250. Усно: B1 зразок ≈ 85–140 слів, B2 ≈ 120–200.
- Зразки говоримо від першої особи у жіночому роді (для чоловіків це пояснено в інтерфейсі).
- Не вигадуй юридичних цифр і сум; якщо тема стосується правил — формулюй загально.
- Тести: рівно 4 варіанти відповіді, answer — індекс правильного (порядок у інтерфейсі перемішується), why — коротке пояснення українською.
- Не повторюй лексику попередніх тижнів; vocab — 8 нових слів/виразів. Не використовуй у зразках типові кальки з української (рефлексивні помилки, «w Ukrainie», «mnie podoba się» тощо).
- Сцени для «describe»: scene.items — емодзі-«наклейки» [емодзі, x%, y%, розмір], не менше 5, розташовані осмислено.

Структура JSON (ТОЧНО така, як у прикладі): intro; speaking[3: describe(з scene), monologue, dialogue(turns: 4 репліки ex/hint/model)]; writing[2: коротке, довге]; listening[1]; reading[1]; grammar[1 з 5 питань]; vocab[8]. Верни ЛИШЕ валідний JSON, без пояснень і без markdown-огорожі.`;

const THEME_SYSTEM = `You maintain the topic queue of a Polish exam-prep app (state certificate B1/B2, speaking and writing focus, learners are Ukrainians living in Poland). Propose ONE new weekly topic that is typical for the exam and useful in daily life in Poland, and does NOT overlap with the topics already used. Return ONLY a JSON object: {"pl": "<short Polish title>", "ua": "<Ukrainian title>", "blurb": "<one Ukrainian sentence listing the situations covered>"}.`;

// ------------------------------------------------ планування
const manifest = await readJSON('content/index.json');
const themes = await readJSON('scripts/themes.json');
const today = iso(new Date());
const buffer = Number(opt('--min-buffer', 4));
const maxNew = Number(opt('--max-new', 2));
const dry = flag('--dry');

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const usedTheme = (pl) => manifest.weeks.some((w) => norm(w.theme.pl) === norm(pl));
const unreleased = () => manifest.weeks.filter((w) => w.release > today).length;

async function pickTheme() {
  const t = themes.find((x) => !usedTheme(x.pl));
  if (t) return t;
  console.log('Теми в scripts/themes.json закінчились — прошу Claude запропонувати нову…');
  const { text } = await complete({
    system: THEME_SYSTEM, effort: 'low', maxTokens: 2000,
    messages: [{ role: 'user', content: JSON.stringify({ alreadyUsed: [...manifest.weeks.map((w) => w.theme.pl), ...themes.map((x) => x.pl)] }) }],
  });
  const n = parseJSON(text);
  if (![n.pl, n.ua, n.blurb].every((v) => typeof v === 'string' && v.trim())) throw new Error('Некоректна тема від моделі');
  if (usedTheme(n.pl) || themes.some((x) => norm(x.pl) === norm(n.pl))) throw new Error(`Модель запропонувала тему, що вже була: ${n.pl}`);
  themes.push(n);
  await writeJSON('scripts/themes.json', themes);
  return n;
}

async function generateLevel(level, theme, last, previous, notes) {
  const example = await readFile(new URL(`content/weeks/${last.id}.${level.toLowerCase()}.json`, root), 'utf8');
  const usedVocab = [];
  for (const w of manifest.weeks) {
    try { usedVocab.push(...(await readJSON(`content/weeks/${w.id}.${level.toLowerCase()}.json`)).vocab.map((v) => v.pl)); } catch { /* немає файлу */ }
  }
  const user = `Рівень: ${level}. Тема тижня: «${theme.pl}» (${theme.ua}). Опис: ${theme.blurb}
Теми, що вже були (сценарії не повторюй): ${manifest.weeks.map((w) => w.theme.pl).join('; ')}
Слова зі vocab, що вже були (не повторюй): ${usedVocab.join('; ')}

Ось ПОПЕРЕДНІЙ тиждень цього рівня — як зразок формату, глибини та якості (тему й зміст зроби НОВИМИ):
${example}

Створи повний JSON тижня «${theme.pl}» для рівня ${level}.`;
  const messages = [{ role: 'user', content: user }];
  if (previous) messages.push({ role: 'assistant', content: previous }, { role: 'user', content: `Валідатор знайшов проблеми. Виправ їх і поверни повний виправлений JSON:\n${notes}` });
  const { text } = await complete({ system: SYSTEM, messages, effort: 'high' });
  parseJSON(text); // впаде, якщо не JSON
  return text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
}

function validate() {
  const r = spawnSync('node', ['scripts/validate.mjs'], { cwd: root.pathname, encoding: 'utf8' });
  return { ok: r.status === 0, log: (r.stderr || '') + (r.stdout || '') };
}

async function createWeek(theme) {
  const last = manifest.weeks[manifest.weeks.length - 1];
  const release = addDays(last.release, 7), id = isoWeekId(release), n = last.n + 1;
  console.log(`\nНовий тиждень: ${id} (Tydzień ${n}), реліз ${release}, тема «${theme.pl}»`);
  const original = await readFile(new URL('content/index.json', root), 'utf8'); // побайтово, щоб відкат нічого не змінив
  const files = {};
  const writeAll = async () => { for (const [lvl, text] of Object.entries(files)) await writeJSON(`content/weeks/${id}.${lvl.toLowerCase()}.json`, JSON.parse(text)); };
  try {
    for (const level of ['B1', 'B2']) files[level] = await generateLevel(level, theme, last);
    manifest.weeks.push({ id, n, release, theme: { pl: theme.pl, ua: theme.ua }, blurb: theme.blurb });
    await writeJSON('content/index.json', manifest);
    await writeAll();
    let v = validate();
    for (let round = 1; !v.ok && round <= 2; round++) {
      console.warn(`Валідація не пройшла, спроба виправлення ${round}/2…\n${v.log.split('\n').filter((l) => l.includes('✗')).join('\n')}`);
      for (const level of ['B1', 'B2']) {
        const notes = v.log.split('\n').filter((l) => l.includes('✗') && (l.includes(level) || !/B[12]/.test(l))).join('\n');
        if (notes) files[level] = await generateLevel(level, theme, last, files[level], notes);
      }
      await writeAll();
      v = validate();
    }
    if (!v.ok) throw new Error('Контент не пройшов валідацію:\n' + v.log);
    console.log(`✓ Тиждень ${id} додано й перевірено.`);
    return { id, n, release, theme };
  } catch (e) {
    console.error(`✗ Тиждень ${id} скасовано: ${e.message}`);
    for (const level of ['b1', 'b2']) await rm(new URL(`content/weeks/${id}.${level}.json`, root), { force: true });
    await writeFile(new URL('content/index.json', root), original);
    manifest.weeks = JSON.parse(original).weeks;
    throw e;
  }
}

// ------------------------------------------------ запуск
if (dry) console.log(`Модель: ${MODEL}`);
else if (!hasCredentials()) { console.log('Немає облікових даних Claude API (ANTHROPIC_API_KEY) — генерацію пропущено.'); process.exit(0); }

const made = [];
let planned = 0;
while (planned < maxNew) {
  if (!(flag('--force') && planned === 0) && unreleased() >= buffer) break;
  if (dry) {
    const t = themes.find((x) => !usedTheme(x.pl));
    const last = manifest.weeks[manifest.weeks.length - 1];
    const release = addDays(last.release, 7);
    console.log(`[dry] ${isoWeekId(release)} · реліз ${release} · тема «${t ? t.pl : '(нову запропонує Claude)'}»`);
    manifest.weeks.push({ id: isoWeekId(release), n: last.n + 1, release, theme: { pl: t?.pl ?? `«нова ${planned}»`, ua: '' }, blurb: '' });
    planned++; continue;
  }
  try { made.push(await createWeek(await pickTheme())); planned++; } catch (e) { process.exitCode = 1; break; }
}
if (!planned) console.log(`У запасі ${unreleased()} не відкритих тижнів (≥ ${buffer}) — нічого створювати.`);
if (costLine()) console.log('\n' + costLine());

if (process.env.GITHUB_STEP_SUMMARY && made.length) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Нові тижні\n${made.map((m) => `- **${m.id}** (Tydzień ${m.n}, реліз ${m.release}) — ${m.theme.pl} / ${m.theme.ua}`).join('\n')}\n\n${costLine()}\n`);
}
