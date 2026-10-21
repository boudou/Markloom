export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingTime: number; // in minutes
  speakingTime: number; // in minutes
}

const WORDS_PER_MINUTE_READING = 200;

const WORDS_PER_MINUTE_SPEAKING = 150;

/** Whether a UTF-16 code unit is whitespace as JavaScript's `\s` (and `String.prototype.trim`) defines it */
function isSpace(code: number): boolean {
  return (
    (code >= 0x09 && code <= 0x0d) ||
    code === 0x20 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

export interface TextCount {
  words: number;
  characters: number;
}

/** Words and characters in one pass, without allocating; what the status bar shows */
export function countText(text: string): TextCount {
  let words = 0;
  let inWord = false;

  for (let i = 0; i < text.length; i++) {
    const space = isSpace(text.charCodeAt(i));

    if (!space && !inWord) words++;
    inWord = !space;
  }

  return { words, characters: text.length };
}

export function readingMinutes(words: number): number {
  return Math.ceil(words / WORDS_PER_MINUTE_READING);
}

export function calculateTextStats(text: string): TextStats {
  // Words: runs of non-whitespace, counted the same way as in the status bar
  const { words, characters } = countText(text);
  const charactersNoSpaces = text.replace(/\s/g, '').length;

  // Sentences: count periods, exclamation marks, question marks
  // but not those inside abbreviations (like "e.g." or "Mr.")
  const sentenceEnders = text.match(/[.!?]+(?=\s|$)/g) || [];
  const sentences = sentenceEnders.length || (text.trim() ? 1 : 0);

  // Paragraphs: count blocks separated by blank lines
  const paragraphBlocks = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const paragraphs = paragraphBlocks.length || (text.trim() ? 1 : 0);

  // Lines: simple newline count
  const lines = text.split('\n').length;

  // Reading time: average adult reads ~200 words per minute
  const readingTime = readingMinutes(words);

  // Speaking time: average speaking rate is ~150 words per minute
  const speakingTime = Math.ceil(words / WORDS_PER_MINUTE_SPEAKING);

  return {
    characters,
    charactersNoSpaces,
    words,
    sentences,
    paragraphs,
    lines,
    readingTime,
    speakingTime,
  };
}

export function formatReadingTime(minutes: number): string {
  if (minutes < 1) {
    return '< 1 min';
  }

  if (minutes === 1) {
    return '1 min';
  }

  return `${minutes} min`;
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}
