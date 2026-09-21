// Озвучення: заздалегідь згенеровані нейронні кліпи (content/audio) → запасний варіант: голос системи.
// Запис голосу (MediaRecorder) і розпізнавання (SpeechRecognition) — нижче.
import { splitSentences, clipId, cleanForSpeech } from './textutil.js';

export { splitSentences };

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voices = [];
const refresh = () => { voices = synth ? synth.getVoices() : []; };
if (synth) { refresh(); synth.addEventListener?.('voiceschanged', refresh); }

export const ttsSupported = !!synth;

// ---------------------------------------------------------------- нейронні кліпи
let clipSet = null;          // Set ідентифікаторів, що є на сервері
let neuralOn = true;         // користувач може вимкнути в «Прогрес»
export const setNeural = (on) => { neuralOn = on !== false; };
export const neuralAvailable = () => !!clipSet && clipSet.size > 0;
export async function loadClips() {
  try {
    const r = await fetch('content/audio/index.json', { cache: 'no-cache' });
    if (r.ok) clipSet = new Set((await r.json()).clips || []);
  } catch { /* без кліпів — працює голос системи */ }
}
const clipUrl = (item) => {
  if (!neuralOn || !clipSet) return null;
  const id = clipId(item.text, item.role || 'f');
  return clipSet.has(id) ? `content/audio/${id}.mp3` : null;
};

// ---------------------------------------------------------------- голос системи (запасний)
export function plVoices() { return voices.filter((v) => /^pl([-_]|$)/i.test(v.lang)); }
export function plVoice(pref) {
  const pl = plVoices();
  if (pref) { const v = pl.find((x) => x.name === pref); if (v) return v; }
  const notGoogle = pl.filter((v) => !/google/i.test(v.name)); // «Google polski» звучить як Google Translate
  const pool = notGoogle.length ? notGoogle : pl;
  return pool.find((v) => /premium|enhanced|natural|neural|zosia/i.test(v.name)) || pool.find((v) => v.localService) || pool[0] || null;
}
// «Чи можна озвучити польською»: є нейронні кліпи або хоч якийсь польський голос
export const hasPolishVoice = () => neuralAvailable() || plVoices().length > 0;
let prefVoice = null;
export const setVoicePref = (name) => { prefVoice = name || null; };

let current = null;
export function stopSpeaking() {
  if (current) { current.cancelled = true; current.audio?.pause(); }
  current = null;
  if (synth) synth.cancel();
}

// items: [{text, role?:'f'|'m', pitch?, rate?, pause?}] | string[]
// rate: 0.9 — «нормально» (для кліпів це швидкість 1×); для голосу системи — множник rate
export function speak(items, { rate = 0.9, onItem, onDone } = {}) {
  stopSpeaking();
  const ctl = { cancelled: false, audio: null };
  current = ctl;
  const list = items.map((x) => (typeof x === 'string' ? { text: x } : x));
  const finish = () => { if (current === ctl) current = null; onDone?.(); };
  if (!list.length || (!synth && !neuralAvailable())) { finish(); return { stop() {} }; }

  let i = 0;
  const prefetch = (k) => { const u = list[k] && clipUrl(list[k]); if (u) { const a = new Audio(); a.preload = 'auto'; a.src = u; } };

  const viaSystem = (it, idx, done) => {
    if (!synth) return done();
    const u = new SpeechSynthesisUtterance(cleanForSpeech(it.text));
    u.lang = 'pl-PL';
    const v = plVoice(prefVoice);
    if (v) u.voice = v;
    u.rate = (it.rate ?? 1) * rate;
    u.pitch = it.pitch ?? 1;
    u.onstart = () => onItem?.(idx);
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  };

  const next = () => {
    if (ctl.cancelled) return;
    if (i >= list.length) return finish();
    const idx = i++;
    const it = list[idx];
    const gap = () => { if (!ctl.cancelled) setTimeout(next, it.pause ?? 140); };
    const url = clipUrl(it);
    prefetch(idx + 1);
    if (!url) return viaSystem(it, idx, gap);

    const a = new Audio(url);
    ctl.audio = a;
    a.playbackRate = Math.min(1.4, Math.max(0.6, (rate / 0.9) * (it.rate ?? 1)));
    a.preservesPitch = true;
    a.onplay = () => onItem?.(idx);
    a.onended = gap;
    a.onerror = () => { if (!ctl.cancelled) viaSystem(it, idx, gap); }; // кліп не завантажився — голос системи
    a.play().catch(() => { if (!ctl.cancelled) viaSystem(it, idx, gap); });
  };
  setTimeout(next, 60);
  return { stop() { if (current === ctl) stopSpeaking(); else ctl.cancelled = true; } };
}

// --------------------------------------------------------------- запис + розпізнавання

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const asrSupported = !!SR;
export const recSupported = !!(navigator.mediaDevices?.getUserMedia);

export class Recorder {
  constructor({ onText, onLevel } = {}) {
    this.onText = onText; this.onLevel = onLevel;
    this.final = ''; this.interim = ''; this.chunks = []; this.recording = false;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.t0 = performance.now();
    this.recording = true;

    if (window.MediaRecorder) {
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m));
      try {
        this.mr = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
        this.mr.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
        this.mr.start(250);
      } catch { this.mr = null; }
    }

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 512;
      src.connect(this.an);
      const buf = new Uint8Array(this.an.fftSize);
      const tick = () => {
        if (!this.recording) return;
        this.an.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        this.onLevel?.(Math.min(1, peak / 90));
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* без індикатора рівня */ }

    this.startASR();
  }

  startASR() {
    if (!SR) return;
    const r = new SR();
    r.lang = 'pl-PL';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) this.final += res[0].transcript.trim() + ' ';
        else interim += res[0].transcript;
      }
      this.interim = interim;
      this.onText?.((this.final + this.interim).trim());
    };
    r.onerror = (e) => {
      this.asrError = e.error;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'language-not-supported') this.asrDead = true;
    };
    r.onend = () => { if (this.recording && !this.asrDead) { try { r.start(); } catch { /* вже запущено */ } } };
    try { r.start(); this.asr = r; } catch { /* ignore */ }
  }

  stop() {
    return new Promise((resolve) => {
      this.recording = false;
      cancelAnimationFrame(this.raf);
      try { this.asr?.stop(); } catch { /* ignore */ }
      const duration = (performance.now() - this.t0) / 1000;
      const finish = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        try { this.ctx?.close(); } catch { /* ignore */ }
        const blob = this.chunks.length ? new Blob(this.chunks, { type: this.mr?.mimeType || 'audio/webm' }) : null;
        // дати ASR хвилину дописати фінальну частину
        setTimeout(() => resolve({
          blob, url: blob ? URL.createObjectURL(blob) : null,
          transcript: (this.final + this.interim).trim(), duration, asrError: this.asrError || null,
        }), 450);
      };
      if (this.mr && this.mr.state !== 'inactive') { this.mr.onstop = finish; try { this.mr.stop(); } catch { finish(); } }
      else finish();
    });
  }
}
