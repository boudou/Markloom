// Document images (an img whose address comes from the document), shown the same way in the preview
// and in rich text. Each img keeps its address as written in `data-markdown-src`: once shown, its src
// is an object URL or gone, so this is what resolves it again when the document's path changes
// while its text doesn't (Save As). A file that read but wouldn't decode follows the rule beside
// markImageMissing (previewImages.ts).
import { canResolveRelative } from '@/features/file-tree/api/fileSystem';
import { isAbsoluteUrl, resolveSourcePath } from '@/lib/documentPath';
import { clearImageMissing, isImageMarkedMissing, markImageMissing, NO_FOLDER_HINT, showImage } from './previewImages';
import { markMissingOnFailedLoad } from './documentMedia';

/**
 * Shows a document image in an img: a relative `src` loads from the folder of `docPath` (through the
 * image cache), anything else as written. An image that can't be shown is hidden beside a box that
 * names `label`. The img needs a parent.
 */
export function showDocumentImage(img: HTMLImageElement, src: string, label: string, docPath: string | null): void {
  img.dataset.markdownSrc = src;
  // The latest call's label wins, so a failed load names the label of the last render
  markMissingOnFailedLoad(img, () => label);

  if (!src || isAbsoluteUrl(src) || src.startsWith('#')) {
    // Takes the img out of any folder read still in flight and out of focus refreshes
    delete img.dataset.imagePath;

    if (img.getAttribute('src') !== src) {
      // The error listener puts the box back if the new address fails too
      clearImageMissing(img);
      img.src = src;
    } else if (isImageMarkedMissing(img)) {
      // Only the label changed: setting the same src again would not load it again
      markImageMissing(img, label);
    }

    return;
  }

  if (!canResolveRelative(docPath)) {
    // Never loaded from the app's own address (nor from a folder the document has left); the box says why
    delete img.dataset.imagePath;
    img.removeAttribute('src');
    markImageMissing(img, label, NO_FOLDER_HINT);

    return;
  }

  // A box already shown stays until the read settles, so a missing-to-missing edit never flashes
  void showImage(img, resolveSourcePath(docPath, src), () => markImageMissing(img, label));
}

/** Shows every document image under `root` again from its address as written, for the document now at `docPath`. */
export function reshowDocumentImages(root: ParentNode, docPath: string | null): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-markdown-src]')) {
    const src = img.dataset.markdownSrc ?? '';
    showDocumentImage(img, src, img.alt || src, docPath);
  }
}
