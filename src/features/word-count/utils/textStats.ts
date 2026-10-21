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

export function calculateTextStats(text: string): TextStats {
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, '').length;

  // Words: split by whitespace, filter empty
  const words = text.trim() ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

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
  const readingTime = Math.ceil(words / WORDS_PER_MINUTE_READING);

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

export function calculateSelectionStats(text: string, selectionStart: number, selectionEnd: number): TextStats | null {
  if (selectionStart === selectionEnd) {
    return null;
  }

  const selectedText = text.slice(selectionStart, selectionEnd);

  return calculateTextStats(selectedText);
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
