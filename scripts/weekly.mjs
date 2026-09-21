// Щотижневий конвеєр: нові теми/тижні → переклади → озвучення → перевірка.
//   node scripts/weekly.mjs [--force] [--dry] [--min-buffer N] [--max-new N]
//
// Генерація — критичний крок (падає → код 1, нічого не публікується).
// Переклади й озвучення — «м'які»: якщо не вдались, контент усе одно валідний
// (інтерфейс покаже українську, озвучення піде голосом системи), а в підсумку буде попередження.
import { spawnSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname;
const passthrough = process.argv.slice(2);
const dry = passthrough.includes('--dry');
const summary = [];

function step(title, script, args = [], { critical = false } = {}) {
  console.log(`\n━━ ${title} ━━`);
  const r = spawnSync('node', [`scripts/${script}`, ...args], { cwd: root, stdio: 'inherit', env: process.env });
  const ok = r.status === 0;
  summary.push(`${ok ? '✓' : critical ? '✗' : '⚠'} ${title}`);
  if (!ok && critical) finish(1);
  return ok;
}

async function finish(code) {
  console.log('\n' + summary.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n#### Конвеєр\n${summary.map((s) => `- ${s}`).join('\n')}\n`).catch(() => {});
  process.exit(code);
}

step('Нові тижні й теми', 'generate-week.mjs', passthrough, { critical: true });
if (!dry) {
  step('Англійські переклади', 'translate-content.mjs');
  step('Нейронне озвучення', 'build-audio.mjs');
  step('Перевірка контенту', 'validate.mjs', [], { critical: true });
}
await finish(0);
