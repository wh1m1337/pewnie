// Доповнює англійські «накладки» (*.en.json) для контенту, якому їх бракує, через Claude API.
//   node scripts/translate-content.mjs [--dry]
// Накладка — плоска карта {"шлях": "англійський рядок"}; використовується js/i18n.js (applyOverlay).
// Без облікових даних Claude API скрипт лише показує, чого бракує, і завершується з кодом 0.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { extractCyr } from './i18n-lib.mjs';
import { complete, parseJSON, hasCredentials, costLine } from './llm.mjs';

const root = new URL('../', import.meta.url);
const dry = process.argv.includes('--dry');
const readJSON = async (p, d) => { try { return JSON.parse(await readFile(new URL(p, root), 'utf8')); } catch { return d; } };

const SYSTEM = `You translate short teaching texts from Ukrainian into natural, concise English for an app that prepares learners for the Polish state certificate exam (B1/B2, speaking and writing).
Rules:
- Keep all Polish words, phrases and quotations exactly as they are (they are the language being taught).
- Keep the markup: **bold**, «guillemets», {0}-style placeholders, arrows, ellipses (…), leading/trailing spaces.
- Ukrainian words quoted as examples of interference (e.g. «склеп», «уряд») must stay in Cyrillic.
- Instructions to a candidate ("Опишіть…") become imperative English ("Describe…").
- Return ONLY a JSON object: the same keys, values translated. No commentary, no markdown fence.`;

const targets = [
  ...(await readdir(new URL('content/weeks/', root))).filter((f) => /\.b[12]\.json$/.test(f)).map((f) => `content/weeks/${f}`),
  'content/toolkit.json', 'content/index.json',
];
const canCall = !dry && hasCredentials();
let todo = 0, failed = 0;

for (const f of targets) {
  const src = extractCyr(await readJSON(f));
  const enFile = f.replace(/\.json$/, '.en.json');
  const en = await readJSON(enFile, {});
  const missing = Object.fromEntries([...src].filter(([p]) => !(p in en)));
  const n = Object.keys(missing).length;
  if (!n) continue;
  todo += n;
  console.log(`${f}: бракує ${n} рядків`);
  if (!canCall) continue;
  try {
    const { text } = await complete({ system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(missing) }], effort: 'medium' });
    const got = parseJSON(text);
    const bad = Object.keys(missing).filter((k) => typeof got[k] !== 'string' || !got[k].trim());
    if (bad.length) throw new Error(`немає перекладу для ${bad.slice(0, 5).join(', ')}…`);
    await writeFile(new URL(enFile, root), JSON.stringify({ ...en, ...Object.fromEntries(Object.keys(missing).map((k) => [k, got[k]])) }, null, 1) + '\n');
    console.log(`  ✓ додано ${n}`);
  } catch (e) { failed++; console.error(`  ✗ ${f}: ${e.message}`); }
}

if (!todo) console.log('Усі англійські переклади на місці.');
else if (!canCall) console.log('Перекладів бракує, але немає облікових даних Claude API (або --dry) — нічого не змінено.');
if (costLine()) console.log(costLine());
process.exit(failed ? 1 : 0);
