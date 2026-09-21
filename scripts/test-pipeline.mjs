// Тест конвеєра без API:  node scripts/test-pipeline.mjs
// Копіює проєкт у тимчасову теку й проганяє weekly.mjs з підміною Claude (scripts/test/fake-llm.mjs):
//   1) успіх: теми запропоновано, 2 тижні створено, переклади й озвучення на місці, валідація пройшла;
//   2) обірваний JSON від моделі → відкат, код 1;  3) невалідний контент → відкат, код 1.
import { cpSync, mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const src = new URL('../', import.meta.url).pathname;
let failed = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failed++; };

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'pewnie-test-'));
  cpSync(src, dir, { recursive: true, filter: (p) => !/node_modules|\.git(\/|$)/.test(p) });
  writeFileSync(join(dir, 'scripts/themes.json'), '[]'); // теми «закінчились» → потрібні пропозиції моделі
  return dir;
}
function run(dir, mode) {
  return spawnSync('node', ['scripts/weekly.mjs'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PEWNIE_FAKE_LLM: 'scripts/test/fake-llm.mjs', FAKE_MODE: mode, ANTHROPIC_API_KEY: '' } });
}
const read = (dir, p) => JSON.parse(readFileSync(join(dir, p), 'utf8'));

console.log('\n1) успішне поповнення');
let d = fresh();
let r = run(d, 'ok');
check(r.status === 0, `код виходу 0 (був ${r.status})`);
const m = read(d, 'content/index.json');
check(m.weeks.length === 7, `у календарі 7 тижнів (є ${m.weeks.length})`);
check(m.weeks[5]?.id === '2026-w42' && m.weeks[6]?.id === '2026-w43', 'нові тижні: 2026-w42 і 2026-w43');
check(m.weeks[5]?.theme.pl === 'Test theme 1', 'тему запропонувала модель');
check(read(d, 'scripts/themes.json').length === 2, 'нові теми збережено в themes.json');
for (const id of ['2026-w42', '2026-w43']) for (const l of ['b1', 'b2']) {
  check(existsSync(join(d, `content/weeks/${id}.${l}.json`)), `${id}.${l}.json створено`);
  check(existsSync(join(d, `content/weeks/${id}.${l}.en.json`)), `${id}.${l}.en.json (переклад) створено`);
}
check(Object.values(read(d, 'content/index.en.json')).some((v) => v.startsWith('EN Тестова тема')), 'англійська накладка календаря містить нову тему');
check(/✓ Перевірка контенту/.test(r.stdout), 'валідатор у кінці пройшов');
if (r.status !== 0) console.log(r.stdout.slice(-1500), r.stderr.slice(-800));
rmSync(d, { recursive: true, force: true });

for (const mode of ['broken', 'invalid']) {
  console.log(`\n2) відкат при збої моделі (${mode})`);
  d = fresh();
  const before = readFileSync(join(d, 'content/index.json'), 'utf8');
  r = run(d, mode);
  check(r.status === 1, `код виходу 1 (був ${r.status})`);
  check(readFileSync(join(d, 'content/index.json'), 'utf8') === before, 'календар не змінився');
  check(!existsSync(join(d, 'content/weeks/2026-w42.b1.json')) && !existsSync(join(d, 'content/weeks/2026-w42.b2.json')), 'файлів нового тижня немає');
  rmSync(d, { recursive: true, force: true });
}

console.log(failed ? `\n✗ провалено перевірок: ${failed}` : '\n✓ конвеєр працює');
process.exit(failed ? 1 : 0);
