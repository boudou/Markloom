// Images from the open folder, shown in the preview and in rich text through object URLs. Re-renders
// reuse the cached URL without touching the file; after the window regains focus, each cached image is
// checked once on its next use (refreshImages checks the ones on screen right away).
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

/**
 * Points `img` at the image file at `path`, or calls `onMissing` when the file can't be read.
 * Neither happens if a later render has pointed `img` at another file meanwhile.
 */
export async function showImage(img: HTMLImageElement, path: string, onMissing: () => void): Promise<void> {
  img.dataset.imagePath = path;

  try {
    const { url } = await imageFor(path);

    if (img.dataset.imagePath === path) img.src = url;
  } catch {
    if (img.dataset.imagePath === path) onMissing();
  }
}

/** Re-reads the images shown in `container` whose files changed. */
export function refreshImages(container: HTMLElement): void {
  container.querySelectorAll<HTMLImageElement>('img[data-image-path]').forEach((img) => {
    const path = img.dataset.imagePath;

    if (!path || !images.has(path)) return;

    imageFor(path).then(
      ({ url }) => {
        if (img.dataset.imagePath === path && img.src !== url) img.src = url;
      },
      () => {}
    );
  });
}
