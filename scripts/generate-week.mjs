// Генерує НОВИЙ тиждень (B1 + B2) через Claude API і публікує лише якщо контент пройшов validate.mjs.
//
//   ANTHROPIC_API_KEY=… node scripts/generate-week.mjs [--min-buffer 4] [--force] [--dry]
//
// --min-buffer N  генерувати, лише якщо вперед «в запасі» менше N ще не відкритих тижнів (за замовч. 4)
// --force         ігнорувати буфер і згенерувати ще один тиждень
// --dry           нічого не викликати: показати, який тиждень і з яким промптом було б створено
//
// Без ANTHROPIC_API_KEY скрипт мовчки завершується з кодом 0 (щоб CI не падав, поки ключ не додано).
import { readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const MODEL = process.env.PEWNIE_MODEL || 'claude-opus-5';
const readJSON = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function isoWeekId(s) {
  const d = new Date(s + 'T00:00:00Z');
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-w${String(wk).padStart(2, '0')}`;
}

const manifest = await readJSON('content/index.json');
const themes = await readJSON('scripts/themes.json');
const today = iso(new Date());
const last = manifest.weeks[manifest.weeks.length - 1];
const unreleased = manifest.weeks.filter((w) => w.release > today).length;
const buffer = Number(opt('--min-buffer', 4));

if (!flag('--force') && unreleased >= buffer) {
  console.log(`У запасі ${unreleased} ненаданих тижнів (≥ ${buffer}) — нічого генерувати.`);
  process.exit(0);
}
const theme = themes.find((t) => !manifest.weeks.some((w) => w.theme.pl === t.pl));
if (!theme) { console.error('Закінчились теми в scripts/themes.json — додайте нові.'); process.exit(1); }

const release = addDays(last.release, 7);
const id = isoWeekId(release);
const n = last.n + 1;
console.log(`Новий тиждень: ${id} (Tydzień ${n}), реліз ${release}, тема «${theme.pl}»`);

const SYSTEM = `Ти — методист і носій польської, який пише навчальні матеріали для україномовних, що готуються до державного іспиту з польської мови як іноземної (certyfikat, рівні B1 і B2). Особлива увага — мовлення (mówienie) і письмо (pisanie).

Правила якості:
- Польський текст має бути ідеально правильним, природним і відповідати рівню. Пояснення, переклади, поради, hint, intro — українською.
- Зразки (model) не повинні містити помилок; речення — різноманітні; для B2 — умовний спосіб, imiesłowy, складні речення, аргументація.
- Слова-мішені (keywords) у форматі «показ|основа»; основа — підрядок, що справді входить у зразок відповіді у потрібній формі.
- Письмові завдання: model уміщується в діапазон min–max слів; кожен пункт завдання (points[].keys) має бути покритий зразком; листи мають звертання й прощання відповідного регістру (formal: «Szanowni Państwo» + «Z poważaniem»; informal: «Cześć…» + «Ściskam/Pozdrawiam», займенники Ty/Ci/Cię/Twój з великої); довгий текст — щонайменше 3 абзаци, розділені порожнім рядком (\\n\\n).
- Обсяги: B1 — short 25–50 слів, long 150–175; B2 — short 60–90, long 200–250. Усно: B1 зразок ≈ 85–140 слів, B2 ≈ 120–200.
- Зразки говоримо від першої особи у жіночому роді (для чоловіків це пояснено в інтерфейсі).
- Не вигадуй юридичних цифр і сум; якщо тема стосується правил — формулюй загально.
- Комбіновані тести: рівно 4 варіанти відповіді, поле answer — індекс правильного (порядок у інтерфейсі перемішується), поле why — коротке пояснення українською.
- Повтори лексику попередніх тижнів мінімально; vocab — 8 нових слів/виразів.

Структура JSON (ТОЧНО така, як у прикладі): intro; speaking[3: describe(з scene — емодзі-«наклейки»), monologue, dialogue(turns: 4 репліки ex/hint/model)]; writing[2: коротке, довге]; listening[1]; reading[1]; grammar[1 з 5 питань]; vocab[8]. Верни ЛИШЕ валідний JSON, без пояснень і без markdown-огорожі.`;

if (flag('--dry')) {
  console.log(`\nМодель: ${MODEL}\nСистемний промпт (${SYSTEM.length} символів) готовий.`);
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('ANTHROPIC_API_KEY не задано — генерацію пропущено (це нормально, поки не додано секрет).');
  process.exit(0);
}

const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic();

async function generate(level, previous, repairNotes) {
  const example = await readFile(new URL(`content/weeks/${last.id}.${level.toLowerCase()}.json`, root), 'utf8');
  const usedVocab = [];
  for (const w of manifest.weeks) {
    try { usedVocab.push(...(await readJSON(`content/weeks/${w.id}.${level.toLowerCase()}.json`)).vocab.map((v) => v.pl)); } catch { /* ignore */ }
  }
  const user = `Рівень: ${level}. Тема тижня: «${theme.pl}» (${theme.ua}). Опис: ${theme.blurb}
Не повторюй слова зі vocab, що вже були: ${usedVocab.join('; ')}

Ось ПОПЕРЕДНІЙ тиждень цього рівня — як зразок формату, глибини та якості (тему й зміст зроби НОВИМИ):
${example}

Створи повний JSON тижня «${theme.pl}» для рівня ${level}.`;
  const messages = [{ role: 'user', content: user }];
  if (previous) messages.push({ role: 'assistant', content: previous }, { role: 'user', content: `Валідатор знайшов проблеми. Виправ їх і поверни повний виправлений JSON:\n${repairNotes}` });

  const stream = client.messages.stream({
    model: MODEL, max_tokens: 32000, thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, system: SYSTEM, messages,
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error(`Модель відмовилась (${msg.stop_details?.category ?? 'без категорії'})`);
  if (msg.stop_reason === 'max_tokens') throw new Error('Відповідь обірвана по max_tokens');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  JSON.parse(text); // впаде, якщо не JSON
  return text;
}

const files = {};
const originalManifest = JSON.stringify(manifest, null, 2) + '\n';
async function writeAll() {
  for (const [level, text] of Object.entries(files)) await writeFile(new URL(`content/weeks/${id}.${level.toLowerCase()}.json`, root), JSON.stringify(JSON.parse(text), null, 2) + '\n');
}
function validate() {
  const r = spawnSync('node', ['scripts/validate.mjs'], { cwd: root.pathname, encoding: 'utf8' });
  return { ok: r.status === 0, log: (r.stderr || '') + (r.stdout || '') };
}
async function rollback() {
  for (const level of ['B1', 'B2']) await rm(new URL(`content/weeks/${id}.${level.toLowerCase()}.json`, root), { force: true });
  await writeFile(new URL('content/index.json', root), originalManifest);
}

try {
  for (const level of ['B1', 'B2']) files[level] = await generate(level);
  manifest.weeks.push({ id, n, release, theme: { pl: theme.pl, ua: theme.ua }, blurb: theme.blurb });
  await writeFile(new URL('content/index.json', root), JSON.stringify(manifest, null, 2) + '\n');
  await writeAll();
  let v = validate();
  if (!v.ok) {
    console.warn('Валідація не пройшла, роблю одну спробу виправлення…\n' + v.log);
    for (const level of ['B1', 'B2']) {
      const notes = v.log.split('\n').filter((l) => l.includes('✗') && (l.includes(level) || !/B[12]/.test(l))).join('\n');
      if (notes) files[level] = await generate(level, files[level], notes);
    }
    await writeAll();
    v = validate();
  }
  if (!v.ok) throw new Error('Контент не пройшов валідацію після виправлення:\n' + v.log);
  console.log(`Готово: тиждень ${id} додано і перевірено.`);
} catch (e) {
  console.error(`Генерація не вдалась, зміни скасовано: ${e.message}`);
  await rollback();
  process.exit(1);
}
