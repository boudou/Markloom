// Images from the open folder, shown in the preview through object URLs. Re-renders reuse the
// cached URL without touching the file; only refreshImages (on window focus) checks the files.
import { fileVersion, readFileBlob, readFileVersion } from '@/features/file-tree/api/fileSystem';

// Object URLs keyed by resolved path, with the version of the file they show
const cache = new Map<string, { url: string; version: string }>();

// Reads in flight, so an image used twice (or re-rendered mid-read) is read once
const pending = new Map<string, Promise<string>>();

// Paths that failed to load: not read again until the next refreshImages
const missing = new Set<string>();

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

async function imageUrl(path: string): Promise<string> {
  const cached = cache.get(path);
  if (cached) return cached.url;
  if (missing.has(path)) throw new Error(`Image not found: ${path}`);

  try {
    return await readImage(path);
  } catch (error) {
    missing.add(path);
    throw error;
  }
}

/** Points `img` at the image file at `path`; rejects when the file can't be read. */
export async function showImage(img: HTMLImageElement, path: string): Promise<void> {
  img.dataset.imagePath = path;
  const url = await imageUrl(path);
  // A later render may have pointed this element at another file meanwhile
  if (img.dataset.imagePath === path) img.src = url;
}

async function refreshImage(container: HTMLElement, path: string): Promise<void> {
  try {
    if ((await readFileVersion(path)) === cache.get(path)?.version) return;

    const url = await readImage(path);
    container.querySelectorAll<HTMLImageElement>(`img[data-image-path="${CSS.escape(path)}"]`).forEach((img) => {
      img.src = url;
    });
  } catch {
    // The image stays as shown if its file can't be checked or read now
  }
}

/** Re-reads the images shown in `container` whose files changed, and lets missing ones be retried. */
export function refreshImages(container: HTMLElement): void {
  missing.clear();
  const shownPaths = new Set<string>();
  container.querySelectorAll<HTMLImageElement>('img[data-image-path]').forEach((img) => {
    const path = img.dataset.imagePath;
    if (path && cache.has(path)) shownPaths.add(path);
  });

  shownPaths.forEach((path) => void refreshImage(container, path));
}
