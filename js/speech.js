// Озвучення (Web Speech Synthesis), запис голосу (MediaRecorder) і розпізнавання (SpeechRecognition).
// Усе працює в браузері, без сервера.

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voices = [];
const refresh = () => { voices = synth ? synth.getVoices() : []; };
if (synth) { refresh(); synth.addEventListener?.('voiceschanged', refresh); }

export const ttsSupported = !!synth;

export function plVoices() { return voices.filter((v) => /^pl([-_]|$)/i.test(v.lang)); }
export function plVoice(pref) {
  const pl = plVoices();
  if (pref) { const v = pl.find((x) => x.name === pref); if (v) return v; }
  return pl.find((v) => /premium|enhanced|natural|neural/i.test(v.name)) || pl.find((v) => v.localService) || pl[0] || null;
}
export const hasPolishVoice = () => plVoices().length > 0;
let prefVoice = null;
export const setVoicePref = (name) => { prefVoice = name || null; };

export function splitSentences(text) {
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+["”»)]*|[^.!?…]+$/g);
  return (parts || [text]).map((s) => s.trim()).filter(Boolean);
}

let current = null;
export function stopSpeaking() {
  if (current) current.cancelled = true;
  current = null;
  if (synth) synth.cancel();
}

// items: [{text, pitch?, rate?}] | string[]
export function speak(items, { rate = 0.9, onItem, onDone } = {}) {
  if (!synth) { onDone?.(); return { stop() {} }; }
  stopSpeaking();
  const ctl = { cancelled: false };
  current = ctl;
  const list = items.map((x) => (typeof x === 'string' ? { text: x } : x));
  let i = 0;
  const next = () => {
    if (ctl.cancelled) return;
    if (i >= list.length) { if (current === ctl) current = null; onDone?.(); return; }
    const idx = i++;
    const it = list[idx];
    const u = new SpeechSynthesisUtterance(it.text);
    u.lang = 'pl-PL';
    const v = plVoice(it.voice || prefVoice);
    if (v) u.voice = v;
    u.rate = (it.rate ?? 1) * rate;
    u.pitch = it.pitch ?? 1;
    u.onstart = () => onItem?.(idx);
    u.onend = () => setTimeout(next, it.pause ?? 120);
    u.onerror = () => { if (!ctl.cancelled) setTimeout(next, 50); };
    synth.speak(u);
  };
  setTimeout(next, 80);
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
