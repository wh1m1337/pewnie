// Чисті функції (без DOM) — ті самі в браузері й у Node (scripts/build-audio.mjs),
// щоб ідентифікатор аудіокліпу збігався в обох місцях.

export const normalize = (t) => String(t).replace(/\s+/g, ' ').trim();

export function splitSentences(text) {
  const parts = normalize(text).match(/[^.!?…]+[.!?…]+["”»)]*|[^.!?…]+$/g);
  return (parts || [text]).map((s) => s.trim()).filter(Boolean);
}

// cyrb53 — швидкий 53-бітний хеш; однаковий результат у браузері й Node
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// role: 'f' (жіночий голос) | 'm' (чоловічий)
export const clipId = (text, role = 'f') => cyrb53(`${role}|${normalize(text)}`).toString(36);

// Що саме озвучуємо: без «…», «/», дужок і символів, які синтезатор читає погано
export function cleanForSpeech(text) {
  return normalize(text)
    .replace(/…/g, '')
    .replace(/\s\/\s/g, ', ')
    .replace(/\s*\(([^)]*)\)\s*/g, ', $1, ')
    .replace(/m²/g, ' metrów kwadratowych')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/[,\s]+$/g, '')
    .trim();
}
