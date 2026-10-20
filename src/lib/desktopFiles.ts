// Documents the operating system hands to the desktop app: double-clicking a .md file,
// "Open with Markloom", or dropping a file on the app icon.
import { useTabsStore } from '@/features/tabs';
import { useSettingsStore } from '@/stores/settingsStore';
import { notify } from '@/stores/uiStore';
import { desktopPathFor, documentName, readFile } from '@/features/file-tree/api/fileSystem';

async function openFromOs(osPaths: string[]) {
  for (const osPath of osPaths) {
    const path = desktopPathFor(osPath);
    try {
      useTabsStore.getState().openDocument(path, await readFile(path));
      useSettingsStore.getState().addRecentFile({ path, name: documentName(path) });
    } catch (error) {
      notify({
        tone: 'error',
        title: `Couldn't open ${documentName(path)}`,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Call once at startup; does nothing outside the desktop app. */
export async function initDesktopFiles(): Promise<void> {
  const bridge = window.markloomDesktop;
  if (!bridge?.takePendingFiles) return;
  bridge.onOpenFiles((files) => void openFromOs(files));
  await openFromOs(await bridge.takePendingFiles());
}
