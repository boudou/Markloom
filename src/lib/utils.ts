import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : '';
}

export function getFileName(path: string): string {
  // Handle file:// prefix for standalone files
  let normalizedPath = path;
  if (path.startsWith('file://')) {
    normalizedPath = path.slice(7); // Remove 'file://'
  }
  const parts = normalizedPath.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

export function isMarkdownFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ['md', 'markdown', 'mdx'].includes(ext);
}

export function isMermaidFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ext === 'mmd';
}
