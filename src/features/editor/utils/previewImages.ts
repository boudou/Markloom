// Images from the open folder, shown in the preview and in rich text through object URLs. Re-renders
// reuse the cached URL without touching the file; after the window regains focus, each cached image is
// checked once on its next use (refreshImages checks the ones on screen right away). An image that
// couldn't be read stays in the page, hidden beside a `.missing-image` box, so a focus re-checks it too.
import { fileVersion, readChangedFile, readFileBlob } from '@/features/file-tree/api/fileSystem';

interface CachedImage {
  url: string;
  version: string;
}

// One entry per resolved path: the image, or the read or check in flight (so an image used twice
// is read once). A rejected entry is a file that couldn't be read: not tried again until focus.
const images = new Map<string, Promise<CachedImage>>();

// Paths whose files may have changed while the app was in the background
const stale = new Set<string>();

// Listened to here rather than in an editor: an image edited while it wasn't on screen (an image
// used only in another tab) is still checked when next shown. Registered at import, so it runs
// before the editors' own focus listeners call refreshImages.
window.addEventListener('focus', () => {
  images.forEach((_, path) => stale.add(path));
});

async function loadImage(path: string): Promise<CachedImage> {
  const file = await readFileBlob(path);

  return { url: URL.createObjectURL(file), version: fileVersion(file) };
}

/** The cached image, replaced (and its URL freed) when its file changed; a failed entry is read again. */
async function checkImage(path: string, entry: Promise<CachedImage>): Promise<CachedImage> {
  let image: CachedImage;

  try {
    image = await entry;
  } catch {
    return loadImage(path);
  }

  try {
    const file = await readChangedFile(path, image.version);

    if (!file) return image;

    const url = URL.createObjectURL(file);
    URL.revokeObjectURL(image.url);

    return { url, version: fileVersion(file) };
  } catch {
    // The image stays as cached if its file can't be checked or read now
    return image;
  }
}

function imageFor(path: string): Promise<CachedImage> {
  const entry = images.get(path);

  if (entry && !stale.has(path)) return entry;

  // Set before any await, so every caller during this read or check shares it
  stale.delete(path);
  const next = entry ? checkImage(path, entry) : loadImage(path);
  images.set(path, next);

  return next;
}

/** The cached object URL of the file at `path` (a srcset candidate, a video); rejects when it can't be read. */
export async function documentFileUrl(path: string): Promise<string> {
  const { url } = await imageFor(path);

  return url;
}

/**
 * Points `img` at the image file at `path`, or calls `onMissing` when the file can't be read (or is
 * the same file already shown missing: it read but wouldn't decode, and loading it again would only
 * flash the broken-image icon). Neither happens if a later render has pointed `img` at another file
 * meanwhile.
 */
export async function showImage(img: HTMLImageElement, path: string, onMissing: () => void): Promise<void> {
  img.dataset.imagePath = path;

  try {
    const { url } = await imageFor(path);

    if (img.dataset.imagePath !== path) return;

    // A box with this URL: the file wouldn't decode (the rule beside markImageMissing)
    if (img.src === url && isImageMarkedMissing(img)) {
      onMissing();

      return;
    }

    clearImageMissing(img);
    img.src = url;
  } catch {
    if (img.dataset.imagePath !== path) return;

    // Drops the last file's URL (or the preview's relative src, hidden behind the box anyway), which
    // keeps the rule beside markImageMissing true
    img.removeAttribute('src');
    onMissing();
  }
}

/** Why a relative image can't be shown in a document that wasn't opened from a folder */
export const NO_FOLDER_HINT = 'open the document from its folder to show it';

/**
 * The box shown beside an image that couldn't be found, naming `name` (and `hint`, when given).
 * Drawn by the `.missing-image` CSS, so it follows the theme in the preview and in rich text.
 */
export function createMissingImage(name: string, hint?: string): HTMLSpanElement {
  const box = document.createElement('span');
  box.className = 'missing-image';
  box.setAttribute('role', 'img');
  const label = `Image not found: ${name}`;
  box.setAttribute('aria-label', hint ? `${label}. ${hint}` : label);
  box.textContent = hint ? `${label} (${hint})` : label;

  return box;
}

// The box shown for each img marked missing; only these imgs are ever unhidden, so an author's
// `<img hidden>` stays hidden
const missingBoxes = new WeakMap<HTMLImageElement, HTMLSpanElement>();

/**
 * Hides `img` and shows a box naming `name` beside it (beside a raw-HTML `<picture>`, not inside it).
 * A box already shown is replaced in place, so a label change never flashes the alt text. An img
 * the author hid gets no box, and the img needs a parent. It stays in the page, so its file is
 * re-checked on focus.
 *
 * The undecodable-image rule, which `showImage`, `refreshImages`, `markMissingOnFailedLoad`
 * (documentMedia.ts) and their callers in the preview (useDocumentLinks.ts) and rich text
 * (milkdown/plugins.ts) rely on: a boxed img whose src is still the cached blob URL of its file is
 * a file that was read but wouldn't decode. A file that can't be read leaves no src (`showImage`
 * removes it, in the preview and in rich text alike), so it never matches that URL. Loading the
 * same URL again would only flash the broken-image icon; a changed file gets a new URL and is tried.
 */
export function markImageMissing(img: HTMLImageElement, name: string, hint?: string): void {
  const shownBox = missingBoxes.get(img);

  if (!shownBox && (img.hidden || !img.parentElement)) return;

  const box = createMissingImage(name, hint);
  missingBoxes.set(img, box);

  if (shownBox) {
    shownBox.replaceWith(box);

    return;
  }

  img.hidden = true;
  const anchor = img.parentElement instanceof HTMLPictureElement ? img.parentElement : img;
  anchor.after(box);
}

/** Whether `img` is hidden beside a box from `markImageMissing` */
export function isImageMarkedMissing(img: HTMLImageElement): boolean {
  return missingBoxes.has(img);
}

/** Takes down the box `markImageMissing` showed for `img` and shows the img again. */
export function clearImageMissing(img: HTMLImageElement): void {
  const box = missingBoxes.get(img);

  if (!box) return;

  box.remove();
  missingBoxes.delete(img);
  img.hidden = false;
}

/** Re-reads the images shown in `container` whose files changed, and the missing ones. */
export function refreshImages(container: HTMLElement): void {
  container.querySelectorAll<HTMLImageElement>('img[data-image-path]').forEach((img) => {
    const path = img.dataset.imagePath;

    if (!path || !images.has(path)) return;

    imageFor(path).then(
      ({ url }) => {
        // Same URL: the file is unchanged, so an img that wouldn't decode keeps its box (the rule
        // beside markImageMissing)
        if (img.dataset.imagePath !== path || img.src === url) return;

        clearImageMissing(img);
        img.src = url;
      },
      () => {}
    );
  });
}
