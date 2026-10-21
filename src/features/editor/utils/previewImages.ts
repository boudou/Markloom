// Images from the open folder, shown in the preview through object URLs. Re-renders reuse the
// cached URL without touching the file; after the window regains focus, each cached image is
// checked once on its next use (refreshImages checks the ones on screen right away).
import { fileVersion, readFileBlob, readFileVersion } from '@/features/file-tree/api/fileSystem';

// Object URLs keyed by resolved path, with the version of the file they show
const cache = new Map<string, { url: string; version: string }>();

// Reads in flight, so an image used twice (or re-rendered mid-read) is read once
const pending = new Map<string, Promise<string>>();

// Version checks in flight, so a render during a check waits for it instead of checking again
const checks = new Map<string, Promise<string>>();

// Paths that failed to load: not read again until the window regains focus
const missing = new Set<string>();

// Cached paths whose files may have changed while the app was in the background
const stale = new Set<string>();

// Listened to here rather than in a preview: an image edited while no preview was mounted
// (Rich text mode, or an image used only in another tab) is still checked when next shown
window.addEventListener('focus', () => {
  missing.clear();
  cache.forEach((_, path) => stale.add(path));
});

/** Reads the image at `path` into a fresh object URL, replacing (and freeing) its cached one. */
function readImage(path: string): Promise<string> {
  const inFlight = pending.get(path);

  if (inFlight) return inFlight;

  const read = readFileBlob(path)
    .then((file) => {
      const url = URL.createObjectURL(file);
      const previous = cache.get(path);

      if (previous) URL.revokeObjectURL(previous.url);
      cache.set(path, { url, version: fileVersion(file) });

      return url;
    })
    .finally(() => pending.delete(path));

  pending.set(path, read);

  return read;
}

/** The URL of the cached image at `path`, re-read first when its file changed. */
function checkImage(path: string, cached: { url: string; version: string }): Promise<string> {
  const inFlight = checks.get(path);

  if (inFlight) return inFlight;

  stale.delete(path);

  const check = readFileVersion(path)
    .then((version) => (version === cached.version ? cached.url : readImage(path)))
    // The image stays as cached if its file can't be checked or read now
    .catch(() => cache.get(path)?.url ?? cached.url)
    .finally(() => checks.delete(path));

  checks.set(path, check);

  return check;
}

async function imageUrl(path: string): Promise<string> {
  const cached = cache.get(path);

  if (cached) return stale.has(path) || checks.has(path) ? checkImage(path, cached) : cached.url;

  if (missing.has(path)) throw new Error(`Image not found: ${path}`);

  try {
    return await readImage(path);
  } catch (error) {
    missing.add(path);
    throw error;
  }
}

/**
 * Points `img` at the image file at `path`, or calls `onMissing` when the file can't be read.
 * Neither happens if a later render has pointed `img` at another file meanwhile.
 */
export async function showImage(img: HTMLImageElement, path: string, onMissing: () => void): Promise<void> {
  img.dataset.imagePath = path;

  try {
    const url = await imageUrl(path);

    if (img.dataset.imagePath === path) img.src = url;
  } catch {
    if (img.dataset.imagePath === path) onMissing();
  }
}

/** Re-reads the images shown in `container` whose files changed. */
export function refreshImages(container: HTMLElement): void {
  const shownPaths = new Set<string>();
  container.querySelectorAll<HTMLImageElement>('img[data-image-path]').forEach((img) => {
    const path = img.dataset.imagePath;

    if (path && cache.has(path)) shownPaths.add(path);
  });

  shownPaths.forEach((path) => {
    const cached = cache.get(path);

    if (!cached) return;

    void checkImage(path, cached).then((url) => {
      if (url === cached.url) return;

      container.querySelectorAll<HTMLImageElement>(`img[data-image-path="${CSS.escape(path)}"]`).forEach((img) => {
        img.src = url;
      });
    });
  });
}
