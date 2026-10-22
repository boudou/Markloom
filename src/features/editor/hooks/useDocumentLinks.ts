import { useEffect, type RefObject } from 'react';
import { useActivePath, useTabsStore } from '@/features/tabs';
import { canResolveRelative, readFile, readFileBlob } from '@/features/file-tree/api/fileSystem';
import { refreshImages, showImage } from '../utils/previewImages';
import { isAbsoluteUrl, resolveRelativePath, resolveSourcePath, splitHash } from '@/lib/documentPath';

// Linked files that open in a window, by extension, with the type they open as. The type never
// comes from the file: a folder's .html would otherwise run as a page of this app's origin.
// Anything else is downloaded; SVG is shown through imagePage().
const VIEWABLE_TYPES = new Map<string, string>([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['bmp', 'image/bmp'],
  ['avif', 'image/avif'],
  ['ico', 'image/x-icon'],
  ['pdf', 'application/pdf'],
  ['csv', 'text/plain;charset=utf-8'],
  ['tsv', 'text/plain;charset=utf-8'],
  ['log', 'text/plain;charset=utf-8'],
  ['json', 'text/plain;charset=utf-8'],
  ['xml', 'text/plain;charset=utf-8'],
  ['yaml', 'text/plain;charset=utf-8'],
  ['yml', 'text/plain;charset=utf-8'],
]);

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

// An SVG opened as a page runs its scripts with this app's origin; inside <img> it is only a picture
function imagePage(imageUrl: string, title: string): Blob {
  const page = document.implementation.createHTMLDocument(title);
  const csp = page.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; img-src blob:";
  page.head.prepend(csp);

  const img = page.createElement('img');
  img.src = imageUrl;
  img.alt = title;
  page.body.append(img);

  return new Blob([`<!doctype html>${page.documentElement.outerHTML}`], { type: 'text/html;charset=utf-8' });
}

/** Opens `url` in a new window and frees its object URLs once the window has had time to load them. */
function openInWindow(url: string, objectUrls: string[]): void {
  window.open(url, '_blank', 'noopener');
  setTimeout(() => objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl)), 60_000);
}

/** Shows a linked file (not a document) in a new window, or downloads it if it isn't safe to show. */
async function openLinkedFile(path: string, file: File): Promise<void> {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();

  if (extension === 'svg') {
    const imageUrl = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }));
    const pageUrl = URL.createObjectURL(imagePage(imageUrl, file.name));
    openInWindow(pageUrl, [pageUrl, imageUrl]);

    return;
  }

  const type = VIEWABLE_TYPES.get(extension);

  if (!type) {
    const { saveAs } = await import('file-saver');
    saveAs(file, file.name);

    return;
  }

  const url = URL.createObjectURL(new Blob([file], { type }));
  // The desktop app turns scripts off in the new window except for PDFs, whose viewer needs them
  openInWindow(type === 'application/pdf' ? `${url}#pdf` : url, [url]);
}

/**
 * Makes rendered markdown behave like a document on disk:
 * - relative image paths are loaded from the open folder,
 * - `#anchor` links scroll within the document,
 * - relative links to other documents open them in a tab; images, PDFs and plain text open in
 *   a window, and other files are downloaded,
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

    container.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
      const src = img.getAttribute('src') ?? '';
      // Any image that fails to load (remote 404, bad data URL) gets a readable placeholder
      img.addEventListener('error', () => showMissingImage(img, src), { once: true });

      if (!src || isAbsoluteUrl(src) || src.startsWith('#')) return;

      if (!canResolveRelative(activeFilePath)) {
        showMissingImage(img, src, 'open the document from its folder to show it');

        return;
      }

      const path = resolveSourcePath(activeFilePath, src);
      void showImage(img, path, () => showMissingImage(img, src));
    });
  }, [containerRef, html, activeFilePath, resolveImages]);

  // An image edited in another app shows its new version when the user comes back
  useEffect(() => {
    if (!resolveImages) return;

    const handleFocus = () => {
      const container = containerRef.current;

      if (container) refreshImages(container);
    };

    window.addEventListener('focus', handleFocus);

    return () => window.removeEventListener('focus', handleFocus);
  }, [containerRef, resolveImages]);

  // Intercept link clicks
  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const handleClick = async (event: MouseEvent) => {
      // SAFETY: click events fire on elements (never text nodes), and only Element.closest is used.
      const anchor = (event.target as HTMLElement).closest('a');

      if (!anchor || !container.contains(anchor)) return;

      const href = anchor.getAttribute('href');

      if (!href) return;

      if (requireModifier && !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();

      if (isAbsoluteUrl(href)) {
        window.open(href, '_blank', 'noopener');

        return;
      }

      const { path, hash } = splitHash(href);

      if (!path) {
        scrollToAnchor(container, hash);

        return;
      }

      if (!canResolveRelative(activeFilePath)) {
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
          await openLinkedFile(targetPath, await readFileBlob(targetPath));
        }
      } catch (error) {
        console.error(`Failed to open linked file: ${targetPath}`, error);
      }
    };

    container.addEventListener('click', handleClick);

    return () => container.removeEventListener('click', handleClick);
  }, [containerRef, activeFilePath, openDocument, requireModifier]);
}
