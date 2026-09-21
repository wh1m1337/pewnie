// Доповнює англійські «накладки» (*.en.json) для контенту, якому їх бракує, через Claude API.
//   ANTHROPIC_API_KEY=… node scripts/translate-content.mjs [--dry]
// Накладка — плоска карта {"шлях": "англійський рядок"}; використовується js/i18n.js (applyOverlay).
// Без ANTHROPIC_API_KEY скрипт лише показує, чого бракує, і завершується з кодом 0.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { extractCyr } from './i18n-lib.mjs';

const root = new URL('../', import.meta.url);
const dry = process.argv.includes('--dry');
const MODEL = process.env.PEWNIE_MODEL || 'claude-opus-5';
const readJSON = async (p, d) => { try { return JSON.parse(await readFile(new URL(p, root), 'utf8')); } catch { return d; } };

const targets = [
  ...(await readdir(new URL('content/weeks/', root))).filter((f) => /\.b[12]\.json$/.test(f)).map((f) => `content/weeks/${f}`),
  'content/toolkit.json', 'content/index.json',
];

const SYSTEM = `You translate short teaching texts from Ukrainian into natural, concise English for an app that prepares learners for the Polish state certificate exam (B1/B2, speaking and writing).
Rules:
- Keep all Polish words, phrases and quotations exactly as they are (they are the language being taught).
- Keep the markup: **bold**, «guillemets», {0}-style placeholders, arrows, ellipses (…), leading/trailing spaces.
- Ukrainian words quoted as examples of interference (e.g. «склеп», «уряд») must stay in Cyrillic.
- Instructions to a candidate ("Опишіть…") become imperative English ("Describe…").
- Return ONLY a JSON object: the same keys, values translated. No commentary, no markdown fence.`;

let client;
let todo = 0;
for (const f of targets) {
  const src = extractCyr(await readJSON(f));
  const en = await readJSON(f.replace(/\.json$/, '.en.json'), {});
  const missing = Object.fromEntries([...src].filter(([p]) => !(p in en)));
  const n = Object.keys(missing).length;
  if (!n) continue;
  todo += n;
  console.log(`${f}: бракує ${n} рядків`);
  if (dry || !process.env.ANTHROPIC_API_KEY) continue;

  client ??= new (await import('@anthropic-ai/sdk')).default();
  const stream = client.messages.stream({
    model: MODEL, max_tokens: 32000, thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(missing) }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason !== 'end_turn') throw new Error(`${f}: незавершена відповідь (${msg.stop_reason})`);
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const got = JSON.parse(text);
  const bad = Object.keys(missing).filter((k) => typeof got[k] !== 'string' || !got[k].trim());
  if (bad.length) throw new Error(`${f}: немає перекладу для ${bad.slice(0, 5).join(', ')}…`);
  await writeFile(new URL(f.replace(/\.json$/, '.en.json'), root), JSON.stringify({ ...en, ...Object.fromEntries(Object.keys(missing).map((k) => [k, got[k]])) }, null, 1) + '\n');
  console.log(`  ✓ додано ${n}`);
}
if (!todo) console.log('Усі англійські переклади на місці.');
else if (dry || !process.env.ANTHROPIC_API_KEY) console.log('Перекладів бракує (ключ не задано або --dry) — нічого не змінено.');
