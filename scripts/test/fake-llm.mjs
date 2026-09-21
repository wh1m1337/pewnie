// Підміна Claude API для тесту конвеєра (PEWNIE_FAKE_LLM=scripts/test/fake-llm.mjs). Ніяких мережевих викликів.
import { readFileSync } from 'node:fs';

const mode = process.env.FAKE_MODE || 'ok';
let themeN = 0;

export async function respond({ system, messages }) {
  const user = messages[0].content;
  if (system.includes('topic queue')) return JSON.stringify({ pl: `Test theme ${++themeN}`, ua: `Тестова тема ${themeN}`, blurb: 'Тестовий опис ситуацій.' });
  if (system.includes('You translate')) {
    const src = JSON.parse(user);
    return JSON.stringify(Object.fromEntries(Object.entries(src).map(([k, v]) => [k, `EN ${v}`])));
  }
  // генерація тижня
  if (mode === 'broken') return '{"intro": "обірваний json';
  if (mode === 'invalid') return JSON.stringify({ intro: 'x', speaking: [], writing: [], listening: [], reading: [], grammar: [], vocab: [] });
  const level = /Рівень: (B[12])/.exec(user)[1].toLowerCase();
  return readFileSync(`content/weeks/2026-w41.${level}.json`, 'utf8'); // валідний зразок
}
