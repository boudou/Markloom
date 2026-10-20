import { useEffect, type RefObject } from 'react';
import { useActivePath, useTabsStore } from '@/features/tabs';
import { readFile, readFileBlob } from '@/features/file-tree/api/fileSystem';

// Matches URLs with a scheme (http:, mailto:, data:, blob:, ...) or protocol-relative URLs
const ABSOLUTE_URL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

// Object URLs for images loaded from the open folder, keyed by resolved path
const imageUrlCache = new Map<string, { url: string; lastModified: number }>();

function showMissingImage(img: HTMLImageElement, src: string, hint?: string) {
  if (!img.isConnected) return;
  const placeholder = document.createElement('span');
  placeholder.className = 'missing-image';
  placeholder.setAttribute('role', 'img');
  const label = `Image not found: ${img.alt || src}`;
  placeholder.setAttribute('aria-label', hint ? `${label}. ${hint}` : label);
  placeholder.textContent = hint ? `${label} (${hint})` : label;
  img.replaceWith(placeholder);
}

/** Resolves `target` relative to the folder containing `fromFile` (both use '/' separators). */
export function resolveRelativePath(fromFile: string, target: string): string {
  const parts = fromFile.split('/').filter(Boolean);
  parts.pop(); // drop file name
  const root = parts[0];

  // A leading '/' means "from the root of the open folder"
  const stack = target.startsWith('/') ? (root ? [root] : []) : parts;

  for (const segment of target.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 1) stack.pop();
    } else {
      stack.push(segment);
    }
  }
  return stack.join('/');
}

function splitHash(href: string): { path: string; hash: string } {
  const hashIndex = href.indexOf('#');
  const withoutHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex + 1);
  const path = withoutHash.split('?')[0];
  return { path: safeDecode(path), hash: safeDecode(hash) };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Files opened standalone (not from a folder) have no folder to resolve against
function canResolve(filePath: string | null): filePath is string {
  return !!filePath && !filePath.startsWith('file://');
}

function scrollToAnchor(container: HTMLElement, id: string): void {
  if (!id) {
    container.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const target =
    container.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ??
    container.querySelector<HTMLElement>(`[name="${CSS.escape(id)}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Makes rendered markdown behave like a document on disk:
 * - relative image paths are loaded from the open folder,
 * - `#anchor` links scroll within the document,
 * - relative links to other files open them in a tab,
 * - external links open outside the app.
 */
export function useDocumentLinks(
  containerRef: RefObject<HTMLElement>,
  html: string,
  options: {
    /** Editable surfaces follow links only on Ctrl/Cmd+click */
    requireModifier?: boolean;
    /** Off when the editor resolves images itself */
    resolveImages?: boolean;
  } = {}
): void {
  const { requireModifier = false, resolveImages = true } = options;
  const activeFilePath = useActivePath();
  const openDocument = useTabsStore((s) => s.openDocument);

  // Swap relative image sources for object URLs read through the file system API
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !resolveImages) return;

    let cancelled = false;
    container.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
      const src = img.getAttribute('src') ?? '';
      // Any image that fails to load (remote 404, bad data URL) gets a readable placeholder
      img.addEventListener('error', () => showMissingImage(img, src), { once: true });
      if (!src || ABSOLUTE_URL.test(src) || src.startsWith('#')) return;

      if (!canResolve(activeFilePath)) {
        showMissingImage(img, src, 'open the document from its folder to show it');
        return;
      }

      const path = resolveRelativePath(activeFilePath, splitHash(src).path);
      const cached = imageUrlCache.get(path);
      if (cached) img.src = cached.url;

      // Re-check the file each time so an image edited on disk shows its new version
      readFileBlob(path)
        .then((file) => {
          const current = imageUrlCache.get(path);
          if (current && current.lastModified === file.lastModified) return;
          if (current) URL.revokeObjectURL(current.url);
          const url = URL.createObjectURL(file);
          imageUrlCache.set(path, { url, lastModified: file.lastModified });
          if (!cancelled) img.src = url;
        })
        .catch(() => {
          if (!cancelled) showMissingImage(img, src);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [containerRef, html, activeFilePath, resolveImages]);

  // Intercept link clicks
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = async (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor || !container.contains(anchor)) return;

      const href = anchor.getAttribute('href');
      if (!href) return;
      if (requireModifier && !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();

      if (ABSOLUTE_URL.test(href)) {
        window.open(href, '_blank', 'noopener');
        return;
      }

      const { path, hash } = splitHash(href);
      if (!path) {
        scrollToAnchor(container, hash);
        return;
      }

      if (!canResolve(activeFilePath)) {
        console.warn(`Cannot follow relative link without an open folder: ${href}`);
        return;
      }

      const targetPath = resolveRelativePath(activeFilePath, path);
      try {
        if (/\.(md|markdown|mdx|mmd|txt)$/i.test(targetPath)) {
          openDocument(targetPath, await readFile(targetPath));
          if (hash) {
            // Wait for the newly opened document to render before scrolling
            setTimeout(() => {
              const current = containerRef.current;
              if (current) scrollToAnchor(current, hash);
            }, 150);
          }
        } else {
          // Other files (PDF, images, ...): show them in a new window/tab
          const url = URL.createObjectURL(await readFileBlob(targetPath));
          window.open(url, '_blank');
        }
      } catch (error) {
        console.error(`Failed to open linked file: ${targetPath}`, error);
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [containerRef, activeFilePath, openDocument, requireModifier]);
}
