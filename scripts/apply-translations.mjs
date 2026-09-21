// Складає англійські «накладки» content/**/*.en.json з ckeys (унікальні укр. рядки) + перекладів.
//   node scripts/apply-translations.mjs <ckeys.json> <translations.txt>   (рядки «індекс|переклад»)
// Накладка — плоска карта {"шлях": "рядок"}; клієнт підмінює нею українські значення (js/i18n.js: applyOverlay).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { extractCyr } from './i18n-lib.mjs';

const [, , keysFile, trFile] = process.argv;
const keys = JSON.parse(readFileSync(keysFile, 'utf8'));
const en = new Map();
for (const line of readFileSync(trFile, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const i = line.indexOf('|');
  en.set(Number(line.slice(0, i)), line.slice(i + 1));
}
const missing = keys.map((_, i) => i).filter((i) => !en.has(i));
if (missing.length) { console.error('Немає перекладу для індексів:', missing.slice(0, 20)); process.exit(1); }
const dict = new Map(keys.map((k, i) => [k, en.get(i)]));

const targets = [
  ...readdirSync('content/weeks').filter((f) => /\.b[12]\.json$/.test(f)).map((f) => `content/weeks/${f}`),
  'content/toolkit.json', 'content/index.json',
];
for (const f of targets) {
  const flat = {};
  for (const [path, uk] of extractCyr(JSON.parse(readFileSync(f, 'utf8')))) flat[path] = dict.get(uk) ?? uk;
  const out = f.replace(/\.json$/, '.en.json');
  writeFileSync(out, JSON.stringify(flat, null, 1) + '\n');
  console.log(out, Object.keys(flat).length);
}
