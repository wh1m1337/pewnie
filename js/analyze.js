// Локальний «червоний олівець»: перевірка письма та мовлення без сервера.
// Це формальні ознаки (структура, обсяг, зв'язність, типові помилки), а не заміна екзаменатора.

// \b не працює з ą ę ł ż…, тому власні межі слова
const W = (src, flags = 'giu') => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, flags);
const TOKEN = /[\p{L}]+(?:[-'’][\p{L}]+)*/gu;

// -------- слова без діакритики (найчастіше — коли пишуть на клавіатурі без польської розкладки)
const NO_DIACRITICS = {
  dziekuje: 'dziękuję', dziekuja: 'dziękują', dziekujemy: 'dziękujemy', prosze: 'proszę', moge: 'mogę', mozesz: 'możesz', moze: 'może',
  mozna: 'można', mozliwe: 'możliwe', mozliwosc: 'możliwość', juz: 'już', sie: 'się', zeby: 'żeby', tez: 'też', bede: 'będę', beda: 'będą',
  sa: 'są', ktory: 'który', ktora: 'która', ktore: 'które', ktorzy: 'którzy', poniewaz: 'ponieważ', zycie: 'życie', wlasnie: 'właśnie',
  pozniej: 'później', dzis: 'dziś', lubie: 'lubię', musze: 'muszę', mysle: 'myślę', czesc: 'cześć', pieniadze: 'pieniądze', wiecej: 'więcej',
  najwiecej: 'najwięcej', zle: 'źle', cos: 'coś', gdzies: 'gdzieś', slowo: 'słowo', swiat: 'świat', szkola: 'szkoła', chetnie: 'chętnie',
  przyjemnosc: 'przyjemność', wazne: 'ważne', wazny: 'ważny', zycze: 'życzę', zyczenia: 'życzenia', tydzien: 'tydzień', miesiac: 'miesiąc',
  dzien: 'dzień', wieczor: 'wieczór', cwiczenia: 'ćwiczenia', moj: 'mój', twoj: 'twój', sluchac: 'słuchać', prosba: 'prośba',
  zrodlo: 'źródło', zaden: 'żaden', zadna: 'żadna', zadne: 'żadne', zaluje: 'żałuję', zalatwic: 'załatwić', kolezanka: 'koleżanka',
  poludnie: 'południe', polnoc: 'północ', trudnosc: 'trudność', rowniez: 'również', jesli: 'jeśli', czesto: 'często', czesciej: 'częściej',
  pozwolic: 'pozwolić', poczatek: 'początek', koniecznosc: 'konieczność', napisac: 'napisać', zrobic: 'zrobić', byc: 'być', miec: 'mieć',
  isc: 'iść', chciec: 'chcieć', wiedziec: 'wiedzieć', powiedziec: 'powiedzieć', zobaczyc: 'zobaczyć', spotkac: 'spotkać', zapytac: 'zapytać',
  poprosic: 'poprosić', zadzwonic: 'zadzwonić', zaczac: 'zacząć', skonczyc: 'skończyć', wyslac: 'wysłać', wziac: 'wziąć', odpowiedziec: 'odpowiedzieć',
  pracowac: 'pracować', mowic: 'mówić', uczyc: 'uczyć', kupic: 'kupić', sprawdzic: 'sprawdzić', zamowic: 'zamówić',
  wyjsc: 'wyjść', przyjsc: 'przyjść', wiadomosc: 'wiadomość', umowe: 'umowę', sprawe: 'sprawę', cie: 'cię', wlasciwie: 'właściwie', zolty: 'żółty', kolezanke: 'koleżankę', 
};

// -------- типові помилки україномовних (калька / керування / орфографія)
const PATTERNS = [
  [/w Ukrainie/, 'З Україною — **na Ukrainie** (як «на Україні»).', 'na Ukrainie'],
  [/dobry dzień/, 'Привітання: **dzień dobry** (порядок слів інший, ніж в українській).', 'dzień dobry'],
  [/mnie podoba(?: się)?/, 'Конструкція **podoba mi się** — «mi» стоїть перед «się».', 'podoba mi się'],
  [/zależy (?:z|ot)/, 'Zależy **od** + родовий: «zależy od pogody».', 'zależy od'],
  [/w godzinie(?= \d)/, 'Час: **o godzinie 5** або **o piątej** (не «w godzinie»).', 'o godzinie'],
  [/dlatego,? bo/, 'У письмовому тексті краще **dlatego że** або **ponieważ** (не «dlatego bo»).', 'dlatego że'],
  [/zainteresowan(?:y|a|i) w /, '**Zainteresowany + narzędnik** без «w»: «zainteresowany muzyką».', null],
  [/interesuj[ęe] się w /, '**Interesować się + narzędnik** без «w»: «interesuję się sportem».', null],
  [/mam \d+ roku/, 'Вік: **mam 25 lat** (для чисел 5+ — «lat»).', null],
  [/po polski/, 'Мови: **po polsku** (не «po polski»).', 'po polsku'],
  [/w wtorek/, '**We wtorek** — перед «w/z» + збіг приголосних потрібне «we».', 'we wtorek'],
  [/brać udział na /, '**Brać udział w** + місцевий: «brać udział w konferencji».', null],
  [/pracuj[ęe] jako \p{L}+(?:em|iem)/u, 'Після **jako** — називний: «pracuję jako kierowca», а не орудний.', null],
  [/nie(?:mam|jestem|wiem|lubię|chcę|mogę|mieszkam|pracuję|umiem|rozumiem|byłem|byłam|mogłem|mogłam|mam)/, '**«Nie» з дієсловами пишемо окремо**: «nie mam», «nie wiem».', null],
  [/bardzo (?:dużo|wiele) dziękuj/, 'Кажуть **bardzo dziękuję** (не «bardzo dużo dziękuję»).', 'bardzo dziękuję'],
];

// -------- зв'язки за функціями
const CONNECTORS = {
  'додавання': 'ponadto|poza tym|oprócz tego|dodatkowo|również|także|a także|co więcej',
  'протиставлення': 'jednak|natomiast|z drugiej strony|mimo że|chociaż|jednakże|pomimo|lecz|podczas gdy',
  'причина': 'ponieważ|dlatego|z tego powodu|gdyż|dzięki temu|w związku z tym|wobec tego',
  'висновок': 'więc|zatem|w rezultacie|podsumowując|w konsekwencji|reasumując|na zakończenie|na koniec',
  'послідовність': 'po pierwsze|po drugie|na początku|następnie|potem|w końcu|wreszcie|najpierw|na początek',
  'думка': 'moim zdaniem|uważam,? że|sądzę,? że|wydaje mi się|według mnie|z mojego punktu widzenia|jestem zdania|jestem przekonany|jestem przekonana',
  'приклад': 'na przykład|np\\.|przykładowo|między innymi|mianowicie',
};

export function findConnectors(text) {
  const found = new Map();
  for (const [fn, src] of Object.entries(CONNECTORS)) {
    const re = W(src);
    for (const m of text.matchAll(re)) {
      const k = m[0].toLowerCase();
      if (!found.has(k)) found.set(k, fn);
    }
  }
  return [...found.entries()].map(([word, fn]) => ({ word, fn }));
}

const COMPLEXITY = {
  'tryb warunkowy': /(?<![\p{L}])(?:\p{L}*(?:ł|ła|ło|li|ły)(?:by|bym|byś|byśmy|byście)|gdyby|jeśliby|jeżeli by)(?![\p{L}])/iu,
  'żeby / aby': W('żeby|aby|iżby'),
  'zdanie względne (który…)': W('który|która|które|którzy|którego|której|którym|którą|których|którymi'),
  'imiesłów (-ąc, -ący)': /(?<![\p{L}])\p{L}{3,}(?:ąc|ący|ąca|ące|ących)(?![\p{L}])/iu,
  'strona bierna': /(?<![\p{L}])(?:został|została|zostało|zostały|zostali|zostaną|zostanie)\s+\p{L}+(?:ny|na|ne|ni|ty|ta|te|ci|ni)(?![\p{L}])/iu,
  'konstrukcje bezosobowe': W('można|należy|trzeba|warto|nie wolno|wolno|nie można'),
  'wyrażenia B2': W('mimo że|chociaż|podczas gdy|pod warunkiem|w przeciwnym razie|tak czy inaczej|zarówno|nie tylko|w takim przypadku|w związku z|biorąc pod uwagę|w odróżnieniu'),
};

export function findComplexity(text) {
  return Object.entries(COMPLEXITY).filter(([, re]) => re.test(text)).map(([k]) => k);
}

const STOP = new Set('i w z na do to jest się nie że o a jak po za od ale co tak by już ze czy dla przez jego jej ich ten ta te tym tej tego być mam mi mnie ja my ty on ona oni są był była było będzie bardzo też tylko lub albo oraz który która które'.split(' '));

// -------- перевірка письма
export function analyzeWriting(text, task, level) {
  const findings = [];
  const general = [];
  const lower = text.toLowerCase();
  const toks = [...text.matchAll(TOKEN)];
  const words = toks.length;
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/).filter((s) => /\p{L}/u.test(s));
  const avgSentence = sentences.length ? words / sentences.length : 0;

  // 1. кирилиця
  for (const m of text.matchAll(/[Ѐ-ӿ]+/g)) {
    findings.push({ s: m.index, e: m.index + m[0].length, type: 'err', msg: 'Кириличні літери в польському тексті (можливо, українська «і», «а», «е» замість латинських).' });
  }

  // 2. без діакритики
  for (const m of toks) {
    const fix = NO_DIACRITICS[m[0].toLowerCase()];
    if (fix) {
      const cap = m[0][0] !== m[0][0].toLowerCase() ? fix[0].toUpperCase() + fix.slice(1) : fix;
      findings.push({ s: m.index, e: m.index + m[0].length, type: 'err', msg: `Діакритика: **${cap}**.`, fix: cap });
    }
  }

  // 3. кальки і керування
  for (const [re, msg, fix] of PATTERNS) {
    const rx = new RegExp(`(?<![\\p{L}\\p{N}])(?:${re.source})(?![\\p{L}\\p{N}])`, 'giu');
    for (const m of text.matchAll(rx)) findings.push({ s: m.index, e: m.index + m[0].length, type: 'err', msg, fix });
  }

  // 4. коми перед że / żeby / ponieważ / który…
  const PREP = new Set('w we z ze na do od o po przy przez dla bez u za nad pod przed między'.split(' '));
  const COMMA_BEFORE = /(?<![\p{L}\p{N}])(że|żeby|ponieważ|gdyż|chociaż|który|która|które|którzy|którego|której|którym|którą|których)(?![\p{L}\p{N}])/gu;
  for (const m of text.matchAll(COMMA_BEFORE)) {
    const before = text.slice(0, m.index);
    const prevChar = before.trimEnd().slice(-1);
    if (!prevChar || /[,;:.!?(\n"„]/.test(prevChar) || /\n\s*$/.test(before)) continue;
    const prevWord = (before.match(/([\p{L}]+)\s*$/u) || [])[1]?.toLowerCase();
    if (!prevWord) continue;
    if (['dlatego', 'tylko', 'mimo', 'tym', 'tak', 'po', 'zamiast', 'nie', 'pomimo', 'i', 'oraz', 'lub', 'albo', 'ani', 'a', 'ale', 'ponieważ', 'gdyż', 'że', 'tuż', 'dopiero'].includes(prevWord)) continue;
    if (/^który|którego|której|którym|którą|których|która|które|którzy/.test(m[1]) && PREP.has(prevWord)) continue; // «w którym»
    findings.push({ s: m.index, e: m.index + m[1].length, type: 'warn', msg: `Перед **${m[1]}** ставимо кому.`, fix: null });
  }

  // 5. великі літери на початку речення
  const ABBR = /(?:^|[^\p{L}])(?:np|tzn|ul|godz|ok|tzw|itd|itp|pl|al|nr|tel|dr|mgr|prof|inż|ks|św|art|str|zob|por|tj|min|wg|ww|m\.in)\.$/iu;
  for (const m of text.matchAll(/[.!?]\s+([a-ząćęłńóśźż])/g)) {
    if (m[0][0] === '.' && ABBR.test(text.slice(Math.max(0, m.index - 8), m.index + 1))) continue;
    findings.push({ s: m.index + m[0].length - 1, e: m.index + m[0].length, type: 'warn', msg: 'Речення починаємо з великої літери.' });
  }

  // 6. регістр
  const kind = task.register || 'neutral';
  const isLetter = /letter|email|list|mail/.test(task.kind || '');
  const YOU_LOWER = /(?<![\p{L}])(ty|cię|twój|twoja|twoje|twoim|twoją|twoich|tobie|ciebie)(?![\p{L}])/gu;
  if (kind === 'formal') {
    for (const m of text.matchAll(W('cześć|hej|siema|spoko|witaj|pozdrawiam serdecznie|buziaki|ściskam'))) findings.push({ s: m.index, e: m.index + m[0].length, type: 'err', msg: 'Занадто неформально для офіційного листа (Pan/Pani/Państwo).' });
    for (const m of text.matchAll(YOU_LOWER)) findings.push({ s: m.index, e: m.index + m[0].length, type: 'err', msg: 'В офіційному листі — **Pan/Pani/Państwo**, не «ty».' });
  }
  if (kind === 'informal') {
    for (const m of text.matchAll(W('szanowni państwo|szanowny panie|szanowna pani|z poważaniem|z wyrazami szacunku'))) findings.push({ s: m.index, e: m.index + m[0].length, type: 'warn', msg: 'Задто офіційно для листа до друга — **Cześć / Kochana… / Pozdrawiam / Ściskam**.' });
    if (isLetter) for (const m of text.matchAll(/(?<![\p{L}])(ty|cię|twój|twoja|twoje|twoim|twoją|twoich|tobie|ciebie)(?![\p{L}])/gu)) {
      if (m.index === 0 || /[.!?]\s*$/.test(text.slice(0, m.index))) continue; // на початку речення й так велика
      findings.push({ s: m.index, e: m.index + m[0].length, type: 'warn', msg: `У листі звертання з великої: **${m[0][0].toUpperCase() + m[0].slice(1)}** (норма листування).`, fix: m[0][0].toUpperCase() + m[0].slice(1) });
    }
  }

  // 7. початок і кінець листа
  const structure = [];
  if (isLetter) {
    const first = text.trim().slice(0, 140).toLowerCase();
    const last = text.trim().slice(-160).toLowerCase();
    const greetRe = kind === 'formal' ? /szanown|dzień dobry|dobry wieczór/ : /cześć|hej|drog|kochan|witaj|dzień dobry/;
    const closeRe = kind === 'formal' ? /z poważaniem|z wyrazami szacunku|z pozdrowieniami|łączę wyrazy/ : /pozdrawiam|ściskam|buziaki|do zobaczenia|do usłyszenia|trzymaj|całuję|serdeczności/;
    structure.push({ ok: greetRe.test(first), text: kind === 'formal' ? 'Офіційне звертання (Szanowni Państwo / Szanowna Pani…)' : 'Звертання (Cześć… / Droga…)' });
    structure.push({ ok: closeRe.test(last), text: kind === 'formal' ? 'Офіційне завершення (Z poważaniem…)' : 'Прощання (Pozdrawiam / Ściskam…)' });
  }
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  if (task.max >= 120) structure.push({ ok: paragraphs >= 3, text: 'Абзаци: вступ, основна частина, завершення' });

  // 8. обсяг
  const min = task.min || 0, max = task.max || 9999;
  const lo = Math.floor(min * 0.9), hi = Math.ceil(max * 1.1);
  const lengthOk = words >= lo && words <= hi;
  if (words < lo) general.push({ type: 'err', msg: `Замало слів: **${words}** (потрібно ${min}–${max}). Екзаменатор знижує бал за обсяг.` });
  else if (words > hi) general.push({ type: 'warn', msg: `Забагато слів: **${words}** (ліміт ${min}–${max}, допуск ±10%). Зайве не читають.` });
  else if (words >= min * 0.98 && words <= max * 1.02) general.push({ type: 'ok', msg: `Обсяг у нормі: **${words}** слів (${min}–${max}).` });
  else general.push({ type: 'ok', msg: `Обсяг у межах допуску ±10%: **${words}** слів.` });

  // 9. пункти завдання
  const points = (task.points || []).map((p) => {
    const keys = p.keys || [];
    const ok = keys.length ? keys.some((k) => lower.includes(k.toLowerCase())) : null;
    return { text: p.text, ok };
  });

  // 10. повтори
  const freq = new Map();
  for (const m of toks) { const w = m[0].toLowerCase(); if (w.length > 4 && !STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1); }
  const repeats = [...freq.entries()].filter(([, n]) => n >= (words > 120 ? 4 : 3)).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (repeats.length) general.push({ type: 'warn', msg: `Повтори: ${repeats.map(([w, n]) => `**${w}** ×${n}`).join(', ')}. Підберіть синоніми — це «zakres środków» в оцінці.` });

  // 11. довжина речень
  if (sentences.length >= 3) {
    if (avgSentence < (level === 'B2' ? 10 : 7)) general.push({ type: 'warn', msg: `Речення короткі (у середньому ${avgSentence.toFixed(1)} слова). ${level === 'B2' ? 'На B2 очікують складніші: з «który», «chociaż», «żeby».' : 'Спробуйте з’єднати думки через «bo», «ale», «dlatego».'}` });
    else if (avgSentence > 26) general.push({ type: 'warn', msg: `Речення задовгі (${avgSentence.toFixed(1)} слова в середньому) — легко втратити граматику. Розбийте.` });
  }

  // 12. зв'язки й складність
  const connectors = findConnectors(text);
  const cNeed = level === 'B2' ? 6 : 4;
  if (words > 40) {
    if (connectors.length < cNeed) general.push({ type: 'warn', msg: `Мало зв’язок: **${connectors.length}** різних, для ${level} бажано ≥ ${cNeed}. Дивіться «Довідник → Зв’язки».` });
    else general.push({ type: 'ok', msg: `Зв’язки: **${connectors.length}** різних — добре.` });
  }
  const complexity = findComplexity(text);
  if (words > 80) {
    const need = level === 'B2' ? 3 : 1;
    if (complexity.length < need) general.push({ type: 'warn', msg: `Різноманіття конструкцій: знайдено ${complexity.length}. Для ${level} додайте: ${level === 'B2' ? 'tryb warunkowy, zdanie z «który», imiesłów, «można/należy»' : 'zdanie z «żeby», «który» або tryb warunkowy'}.` });
    else general.push({ type: 'ok', msg: `Конструкції: ${complexity.join(', ')}.` });
  }

  // ----- орієнтовна оцінка за 4 критеріями (як в екзамені)
  const errs = findings.filter((f) => f.type === 'err').length;
  const warns = findings.filter((f) => f.type === 'warn').length;
  const per100 = words ? ((errs + warns * 0.4) / words) * 100 : 0;
  const pointsRatio = points.length ? points.filter((p) => p.ok !== false).length / points.length : 1;
  const uniq = new Set(toks.map((m) => m[0].toLowerCase()));
  const ttr = words ? uniq.size / Math.sqrt(words * 2) : 0; // ~ Гіро, не залежить від довжини
  const structOk = structure.length ? structure.filter((s) => s.ok).length / structure.length : 1;
  const sentFit = sentences.length < 3 ? 0.6 : Math.min(1, avgSentence / (level === 'B2' ? 12 : 8));
  const criteria = {
    realizacja: clamp01(0.62 * pointsRatio + 0.28 * (lengthOk ? 1 : 0.3) + 0.1 * (kind === 'formal' ? (errs ? 0.5 : 1) : 1)),
    spojnosc: clamp01(0.45 * Math.min(1, connectors.length / cNeed) + 0.35 * structOk + 0.2 * sentFit),
    zakres: clamp01(0.4 * Math.min(1, ttr / 0.95) + 0.4 * Math.min(1, complexity.length / (level === 'B2' ? 3 : 1.5)) + 0.2 * Math.min(1, uniq.size / (level === 'B2' ? 90 : 55))),
    poprawnosc: clamp01(1 - per100 / 14),
  };
  let score = words < 12 ? 0 : Math.round(100 * (0.3 * criteria.realizacja + 0.2 * criteria.spojnosc + 0.2 * criteria.zakres + 0.3 * criteria.poprawnosc));

  findings.sort((a, b) => a.s - b.s || b.e - a.e);
  // прибираємо накладені знахідки
  const clean = [];
  let lastEnd = -1;
  for (const f of findings) { if (f.s >= lastEnd) { clean.push(f); lastEnd = f.e; } }

  return { words, sentences: sentences.length, avgSentence, findings: clean, general, points, structure, connectors, complexity, criteria, score, grade: gradeFromScore(score), lengthOk, errs };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Шкала польської школи 1–6
export function gradeFromScore(s) {
  if (s == null) return '–';
  const t = [[15, '1'], [30, '2'], [40, '3-'], [50, '3'], [58, '3+'], [65, '4-'], [72, '4'], [80, '4+'], [86, '5-'], [91, '5'], [95, '5+']];
  for (const [lim, g] of t) if (s < lim) return g;
  return '6';
}

export const CRITERIA_UA = {
  realizacja: ['Realizacja zadania', 'чи розкрито всі пункти, обсяг, форма'],
  spojnosc: ['Spójność i logika', 'зв’язки, абзаци, вступ/завершення'],
  zakres: ['Zakres środków', 'багатство слів і конструкцій'],
  poprawnosc: ['Poprawność', 'граматика, орфографія, діакритика'],
};

// -------- перевірка усної відповіді (транскрипт від браузера або вписаний вручну)
const FILLERS = ['no', 'znaczy', 'jakby', 'w sensie', 'tak jakby', 'prawda', 'generalnie', 'yyy', 'eee', 'hmm'];

export function analyzeSpeech(transcript, duration, task, level) {
  const text = transcript.trim();
  const toks = [...text.matchAll(TOKEN)];
  const words = toks.length;
  const [tmin, tmax] = task.time || [60, 120];
  const minutes = Math.max(duration, 1) / 60;
  const wpm = Math.round(words / minutes);

  const findings = [];
  for (const [re, msg, fix] of PATTERNS) {
    const rx = new RegExp(`(?<![\\p{L}\\p{N}])(?:${re.source})(?![\\p{L}\\p{N}])`, 'giu');
    for (const m of text.matchAll(rx)) findings.push({ s: m.index, e: m.index + m[0].length, msg, fix });
  }

  const fillers = {};
  for (const f of FILLERS) {
    const n = [...text.matchAll(W(f))].length;
    if (n) fillers[f] = n;
  }
  const fillerTotal = Object.values(fillers).reduce((a, b) => a + b, 0);

  const lower = text.toLowerCase();
  // ключове слово: «показ|основа» — основа шукається як підрядок (відмінки!)
  const kw = (task.keywords || []).map((k) => { const [d, st] = k.split('|'); return { d, s: (st ?? d).toLowerCase() }; });
  const hit = kw.filter((k) => lower.includes(k.s)).map((k) => k.d);
  const miss = kw.filter((k) => !lower.includes(k.s)).map((k) => k.d);
  const connectors = findConnectors(text);
  const complexity = findComplexity(text);
  const points = (task.points || []).map((p) => (typeof p === 'string' ? { text: p, ok: null } : { text: p.text, ok: p.keys?.length ? p.keys.some((k) => lower.includes(k.toLowerCase())) : null }));

  const durFit = duration < tmin * 0.7 ? 'short' : duration > tmax * 1.25 ? 'long' : 'ok';
  const cNeed = level === 'B2' ? 5 : 3;
  let score = null;
  if (words >= 8) {
    const contentR = kw.length ? hit.length / Math.min(kw.length, 8) : 0.7;
    const ptsR = points.filter((p) => p.ok !== null).length ? points.filter((p) => p.ok).length / points.filter((p) => p.ok !== null).length : contentR;
    const fluency = wpm < 40 ? 0.3 : wpm < 65 ? 0.6 : wpm > 170 ? 0.7 : 1;
    const parts = 0.3 * Math.min(1, contentR * 1.15) + 0.2 * ptsR + 0.15 * (durFit === 'ok' ? 1 : durFit === 'short' ? 0.4 : 0.7) + 0.15 * Math.min(1, connectors.length / cNeed) + 0.1 * fluency + 0.1 * (1 - Math.min(1, findings.length / 4));
    score = Math.round(100 * clamp01(parts));
  }
  return { words, wpm, fillers, fillerTotal, hit, miss, connectors, complexity, points, findings, durFit, score, grade: gradeFromScore(score) };
}

// -------- запит до ШІ-вчителя (копіюється в буфер — без API-ключів)
export function buildTeacherPrompt({ kind, level, task, text }) {
  const criteria = kind === 'writing'
    ? 'Realizacja zadania, Spójność i logika, Zakres środków językowych, Poprawność językowa'
    : 'Realizacja zadania, Płynność i spójność, Zakres środków językowych, Poprawność, Wymowa (jeśli da się ocenić)';
  return `Jesteś egzaminatorem państwowego egzaminu certyfikatowego z języka polskiego jako obcego, poziom ${level}. Kandydat jest Ukraińcem/Ukrainką.

ZADANIE (${kind === 'writing' ? 'pisanie' : 'mówienie'}):
${task.prompt}
${(task.points || []).map((p) => `- ${typeof p === 'string' ? p : p.text}`).join('\n')}
${task.min ? `Limit: ${task.min}–${task.max} słów.` : ''}

TEKST KANDYDATA${kind === 'speaking' ? ' (transkrypcja odpowiedzi ustnej)' : ''}:
"""
${text}
"""

Zrób po kolei:
1. Oceń według kryteriów: ${criteria}. Każde 0–5 punktów + krótkie uzasadnienie.
2. Wypisz WSZYSTKIE błędy: cytat → poprawna forma → krótkie wyjaśnienie po ukraińsku (zwróć uwagę na typowe interferencje z ukraińskiego).
3. Podaj 3 najważniejsze rzeczy do poprawy przed egzaminem.
4. Pokaż poprawioną wersję tekstu na poziomie ${level} (nie za trudną).`;
}
