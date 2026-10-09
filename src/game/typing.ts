export type TypingResult = 'progress' | 'complete' | 'miss' | 'already-complete';

type RomajiMap = Record<string, string[]>;

const ROMAJI: RomajiMap = {
  あ: ['a'], い: ['i'], う: ['u'], え: ['e'], お: ['o'],
  か: ['ka'], き: ['ki'], く: ['ku'], け: ['ke'], こ: ['ko'],
  さ: ['sa'], し: ['shi', 'si'], す: ['su'], せ: ['se'], そ: ['so'],
  た: ['ta'], ち: ['chi', 'ti'], つ: ['tsu', 'tu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], を: ['wo'], ゐ: ['wi'], ゑ: ['we'], ん: ['n', 'nn', "n'"],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['ji', 'zi'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['di', 'ji'], づ: ['du', 'zu'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ぁ: ['xa', 'la'], ぃ: ['xi', 'li'], ぅ: ['xu', 'lu'], ぇ: ['xe', 'le'], ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'],
  ー: ['-'], '、': [','], '。': ['.'], '！': ['!'], '!': ['!'], '？': ['?'], '?': ['?'],
  '「': ['['], '」': [']'], '・': ['/'], '　': [' '], ' ': [' '],
};

const COMBINATIONS: RomajiMap = {
  きゃ: ['kya'], きゅ: ['kyu'], きょ: ['kyo'],
  しゃ: ['sha', 'sya'], しゅ: ['shu', 'syu'], しょ: ['sho', 'syo'],
  ちゃ: ['cha', 'tya'], ちゅ: ['chu', 'tyu'], ちょ: ['cho', 'tyo'],
  にゃ: ['nya'], にゅ: ['nyu'], にょ: ['nyo'],
  ひゃ: ['hya'], ひゅ: ['hyu'], ひょ: ['hyo'],
  みゃ: ['mya'], みゅ: ['myu'], みょ: ['myo'],
  りゃ: ['rya'], りゅ: ['ryu'], りょ: ['ryo'],
  ぎゃ: ['gya'], ぎゅ: ['gyu'], ぎょ: ['gyo'],
  じゃ: ['ja', 'jya', 'zya'], じゅ: ['ju', 'jyu', 'zyu'], じょ: ['jo', 'jyo', 'zyo'],
  ぢゃ: ['dya'], ぢゅ: ['dyu'], ぢょ: ['dyo'],
  びゃ: ['bya'], びゅ: ['byu'], びょ: ['byo'],
  ぴゃ: ['pya'], ぴゅ: ['pyu'], ぴょ: ['pyo'],
  てぃ: ['thi'], でぃ: ['dhi'], とぅ: ['twu'], どぅ: ['dwu'],
  ふぁ: ['fa'], ふぃ: ['fi'], ふぇ: ['fe'], ふぉ: ['fo'], うぃ: ['wi'], うぇ: ['we'],
};

const MAX_CANDIDATES = 4096;

function multiply(parts: string[][]): string[] {
  let result = [''];
  for (const choices of parts) {
    const next: string[] = [];
    for (const prefix of result) {
      for (const choice of choices) {
        next.push(prefix + choice);
        if (next.length >= MAX_CANDIDATES) return next;
      }
    }
    result = next;
  }
  return result;
}

function tokenize(reading: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < reading.length; index += 1) {
    const pair = reading.slice(index, index + 2);
    if (COMBINATIONS[pair]) {
      tokens.push(pair);
      index += 1;
      continue;
    }
    tokens.push(reading[index]);
  }
  return tokens;
}

function sokuonChoices(next: string): string[] {
  const nextChoices = COMBINATIONS[next] ?? ROMAJI[next] ?? [];
  const doubled = nextChoices
    .map((choice) => choice[0])
    .filter((letter) => /[a-z]/.test(letter))
    .map((letter) => letter);
  return [...new Set([...doubled, 'xtsu', 'ltsu'])];
}

function buildCandidates(reading: string): string[] {
  const tokens = tokenize(reading);
  const parts: string[][] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === 'っ') {
      const next = tokens[index + 1];
      parts.push(next ? sokuonChoices(next) : ['xtsu', 'ltsu']);
      continue;
    }
    parts.push(COMBINATIONS[token] ?? ROMAJI[token] ?? [token]);
  }
  return [...new Set(multiply(parts))];
}

export class TypingEngine {
  readonly reading: string;
  readonly candidates: readonly string[];
  private prefix = '';

  constructor(reading: string) {
    this.reading = reading;
    this.candidates = buildCandidates(reading.toLowerCase());
    if (this.candidates.length === 0) {
      throw new Error(`読み仮名をローマ字に変換できません: ${reading}`);
    }
  }

  get typed(): string {
    return this.prefix;
  }

  get isComplete(): boolean {
    return this.candidates.some((candidate) => candidate === this.prefix);
  }

  get progressRatio(): number {
    const longest = Math.max(...this.candidates.map((candidate) => candidate.length));
    return Math.min(1, this.prefix.length / longest);
  }

  get nextCharacters(): string[] {
    const characters = new Set<string>();
    for (const candidate of this.candidates) {
      if (candidate.startsWith(this.prefix) && candidate.length > this.prefix.length) {
        characters.add(candidate[this.prefix.length]);
      }
    }
    return [...characters];
  }

  input(rawKey: string): TypingResult {
    if (this.isComplete) return 'already-complete';
    const key = rawKey.toLowerCase();
    if (key.length !== 1) return 'miss';
    const attempt = this.prefix + key;
    if (!this.candidates.some((candidate) => candidate.startsWith(attempt))) {
      return 'miss';
    }
    this.prefix = attempt;
    return this.isComplete ? 'complete' : 'progress';
  }
}

export function romanize(reading: string): string {
  return new TypingEngine(reading).candidates[0];
}

