// Where a dropped or pasted image goes: next to the document in "assets/", linked by a
// relative path. Only documents without a folder fall back to embedding the image inline.
import { useTabsStore } from '@/features/tabs';
import { notify } from '@/stores/uiStore';
import { canResolveRelative, fileExists, writeFile } from '@/features/file-tree/api/fileSystem';
import { fileToBase64, getAltTextFromFilename, getExtensionFromMimeType } from './utils';

const ASSETS_DIR = 'assets';

const LARGE_INLINE_IMAGE = 500 * 1024;

function safeBaseName(file: File): string {
  // Clipboard images are all called "image.png"; give them a findable, unique-ish name
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const raw = /^image\.\w+$/i.test(file.name) ? `pasted-${stamp}` : file.name.replace(/\.[^.]+$/, '');

  return raw.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `image-${stamp}`;
}

function extensionOf(file: File): string {
  return file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? getExtensionFromMimeType(file.type);
}

/** Returns the markdown for the image, having saved it beside the document when possible. */
export async function storeImageForDocument(file: File): Promise<string> {
  const isClipboardImage = /^image\.\w+$/i.test(file.name);
  const alt = isClipboardImage ? 'Pasted image' : getAltTextFromFilename(file.name) || 'Image';
  const { tabs, activeTabId } = useTabsStore.getState();
  const docPath = tabs.find((t) => t.id === activeTabId)?.path ?? null;

  // Folder documents and desktop-opened documents have a real directory we can write to
  if (canResolveRelative(docPath)) {
    const docDir = docPath.slice(0, docPath.lastIndexOf('/'));
    const base = safeBaseName(file);
    const ext = extensionOf(file);
    let name = `${base}.${ext}`;

    for (let n = 2; await fileExists(`${docDir}/${ASSETS_DIR}/${name}`); n++) name = `${base}-${n}.${ext}`;

    const target = `${docDir}/${ASSETS_DIR}/${name}`;

    try {
      await writeFile(target, file);

      return `![${alt}](${ASSETS_DIR}/${encodeURI(name)})`;
    } catch (error) {
      notify({
        tone: 'error',
        title: `Couldn't save ${name} to ${ASSETS_DIR}/`,
        detail: `${error instanceof Error ? error.message : error}. The image was embedded in the document instead.`,
      });
    }
  } else if (file.size > LARGE_INLINE_IMAGE) {
    notify({
      tone: 'info',
      title: 'Image embedded in the document',
      detail: 'Save the document in a folder first and images will be stored in an assets/ folder next to it, keeping the file small.',
    });
  }

  return `![${alt}](${await fileToBase64(file)})`;
}
