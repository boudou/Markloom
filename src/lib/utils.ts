import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The message of a caught value: an Error's message, anything else as a string. */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');

  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : '';
}

export function isMarkdownFile(filename: string): boolean {
  const ext = getFileExtension(filename);

  return ['md', 'markdown', 'mdx'].includes(ext);
}

export function isMermaidFile(filename: string): boolean {
  const ext = getFileExtension(filename);

  return ext === 'mmd';
}
