// Documents the operating system hands to the desktop app: double-clicking a .md file,
// "Open with Markloom", or dropping a file on the app icon.
import { desktopPathFor } from '@/features/file-tree/api/fileSystem';
import { openPath } from '@/lib/documentActions';

// One at a time, so documents open in the order the OS sent them and the last one ends up active
async function openFromOs(osPaths: string[]) {
  for (const osPath of osPaths) await openPath(desktopPathFor(osPath));
}

/** Call once at startup; does nothing outside the desktop app. */
export async function initDesktopFiles(): Promise<void> {
  const bridge = window.markloomDesktop;

  if (!bridge?.takePendingFiles) return;
  bridge.onOpenFiles((files) => void openFromOs(files));
  await openFromOs(await bridge.takePendingFiles());
}
