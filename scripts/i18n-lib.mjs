// Спільні функції для перекладів контенту: витяг українських рядків і «накладка» англійських.
export const hasCyr = (s) => typeof s === 'string' && /[Ѐ-ӿ]/.test(s);

// Повертає Map: шлях («speaking.0.tips.1») -> український рядок
export function extractCyr(node, path = '', out = new Map()) {
  if (typeof node === 'string') { if (hasCyr(node)) out.set(path, node); return out; }
  if (Array.isArray(node)) node.forEach((v, i) => extractCyr(v, path ? `${path}.${i}` : `${i}`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) extractCyr(v, path ? `${path}.${k}` : k, out);
  return out;
}
