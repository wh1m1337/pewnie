// Генерує нейронне озвучення для ВСІХ польських фраз сайту → content/audio/*.mp3 + index.json
//
//   node scripts/build-audio.mjs [--provider edge|azure] [--force] [--prune] [--check]
//
// edge  (за замовч.) — голоси Microsoft Neural через `pip install edge-tts` (безкоштовно, неофіційний ендпоїнт: для прототипу)
// azure — офіційний Azure AI Speech (ті самі голоси): AZURE_SPEECH_KEY + AZURE_SPEECH_REGION
// --check — лише показати, скільки кліпів бракує (код 1, якщо є прогалини)
//
// Кліпи ідентифікуються хешем тексту (js/textutil.js), тому лишаються актуальними, поки текст не змінився.
import { readFile, writeFile, readdir, stat, unlink, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clipId, cleanForSpeech, splitSentences } from '../js/textutil.js';

const root = new URL('../', import.meta.url);
const AUDIO_DIR = new URL('content/audio/', root);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PROVIDER = opt('--provider', 'edge');
const VOICES = { f: 'pl-PL-ZofiaNeural', m: 'pl-PL-MarekNeural' };
const readJSON = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));

// ------------------------------------------------ що озвучуємо (дзеркало того, що викликає інтерфейс)
const clips = new Map(); // id -> {text, role}
const add = (text, role = 'f') => {
  if (!text || !/\p{L}/u.test(text)) return;
  const id = clipId(text, role);
  if (!clips.has(id)) clips.set(id, { text, role });
};
const addSentences = (text, role = 'f') => splitSentences(text).forEach((s) => add(s, role));

const manifest = await readJSON('content/index.json');
for (const w of manifest.weeks) {
  for (const level of ['b1', 'b2']) {
    let d;
    try { d = await readJSON(`content/weeks/${w.id}.${level}.json`); } catch { continue; }
    for (const t of d.speaking || []) {
      add(t.prompt);
      (t.phrases || []).forEach((p) => add(p.pl));
      if (t.type === 'dialogue') (t.turns || []).forEach((u) => { add(u.ex, 'm'); add(u.model, 'f'); });
      else addSentences(t.model);
    }
    for (const t of d.writing || []) {
      (t.phrases || []).forEach((p) => add(p.pl));
      addSentences(t.model.replace(/\n+/g, ' '));
    }
    for (const t of d.listening || []) {
      const vm = { A: 'f', B: 'm', ...(t.voices || {}) };
      (t.lines || [{ t: t.script }]).forEach((l) => add(l.t, vm[l.who] || 'f'));
    }
    for (const v of d.vocab || []) { add(v.pl); add(v.ex); }
  }
}
const tk = await readJSON('content/toolkit.json');
tk.connectors.forEach((g) => g.items.forEach((p) => add(p.pl)));
tk.letters.forEach((l) => l.parts.forEach((p) => add(p.pl)));
tk.phrases.forEach((g) => g.items.forEach((p) => add(p.pl)));
tk.friends.forEach((f) => add(f.pl));
add('Dzień dobry! Nazywam się Ania i uczę się polskiego.'); // тест голосу в «Прогрес»

// ------------------------------------------------ що вже є
await mkdir(AUDIO_DIR, { recursive: true });
const onDisk = new Set((await readdir(AUDIO_DIR)).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)));
const missing = [...clips.entries()].filter(([id]) => flag('--force') || !onDisk.has(id));
const chars = missing.reduce((s, [, c]) => s + cleanForSpeech(c.text).length, 0);
console.log(`Кліпів потрібно: ${clips.size}, є: ${[...clips.keys()].filter((id) => onDisk.has(id)).length}, бракує: ${missing.length} (${chars} символів)`);
if (flag('--check')) process.exit(missing.length ? 1 : 0);

// ------------------------------------------------ синтез
let failed = 0;
if (missing.length) {
  if (PROVIDER === 'edge') {
    const jobsFile = join(tmpdir(), `pewnie-tts-${Date.now()}.json`);
    await writeFile(jobsFile, JSON.stringify(missing.map(([id, c]) => ({ id, text: cleanForSpeech(c.text), voice: VOICES[c.role] }))));
    const r = spawnSync('python3', [new URL('scripts/tts_edge.py', root).pathname, jobsFile, AUDIO_DIR.pathname], { stdio: 'inherit' });
    failed = r.status === 0 ? 0 : 1;
  } else if (PROVIDER === 'azure') {
    const key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
    if (!key || !region) { console.error('Потрібні AZURE_SPEECH_KEY і AZURE_SPEECH_REGION'); process.exit(1); }
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let done = 0;
    const queue = [...missing];
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const [id, c] = queue.shift();
        const ssml = `<speak version="1.0" xml:lang="pl-PL"><voice name="${VOICES[c.role]}"><prosody rate="-6%">${esc(cleanForSpeech(c.text))}</prosody></voice></speak>`;
        const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          method: 'POST', body: ssml,
          headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'pewnie' },
        });
        if (!res.ok) { failed++; console.error(`✗ ${id}: HTTP ${res.status}`); continue; }
        await writeFile(new URL(`${id}.mp3`, AUDIO_DIR), Buffer.from(await res.arrayBuffer()));
        if (++done % 50 === 0) console.log(`  ${done}/${missing.length}`);
      }
    }));
  } else { console.error(`Невідомий провайдер: ${PROVIDER}`); process.exit(1); }
}

// ------------------------------------------------ індекс і чистка
const after = new Set((await readdir(AUDIO_DIR)).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)));
let bytes = 0;
for (const id of after) {
  if (flag('--prune') && !clips.has(id)) { await unlink(new URL(`${id}.mp3`, AUDIO_DIR)); after.delete(id); continue; }
  bytes += (await stat(new URL(`${id}.mp3`, AUDIO_DIR))).size;
}
const index = { provider: PROVIDER, voices: VOICES, clips: [...clips.keys()].filter((id) => after.has(id)).sort() };
await writeFile(new URL('index.json', AUDIO_DIR), JSON.stringify(index));
console.log(`Індекс: ${index.clips.length}/${clips.size} кліпів, ${(bytes / 1048576).toFixed(1)} МБ`);
process.exit(failed ? 1 : 0);
