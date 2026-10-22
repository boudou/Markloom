// Documents the operating system hands to the installed web app ("Open with Markloom" on a .md file),
// delivered through window.launchQueue. The desktop app gets its files through desktopFiles.ts instead.
import { adoptFileHandle } from '@/features/file-tree/api/fileSystem';
import { openPath } from '@/lib/documentActions';
import { notify } from '@/stores/uiStore';
import { errorMessage } from '@/lib/utils';

// One at a time, so documents open in the order the OS sent them and the last one ends up active
async function openLaunched(handles: readonly FileSystemHandle[]) {
  for (const handle of handles) {
    // The launch parameters are a boundary: only file handles can be opened
    if (!(handle instanceof FileSystemFileHandle)) continue;

    try {
      await openPath(await adoptFileHandle(handle));
    } catch (error) {
      notify({ tone: 'error', title: `Couldn't open ${handle.name}`, detail: errorMessage(error) });
    }
  }
}

/** Call once at startup, after the session; does nothing in the desktop app or without the Launch Queue API. */
export function initLaunchedFiles(): void {
  const queue = window.launchQueue;

  if (window.markloomDesktop || !queue) return;
  queue.setConsumer((params) => void openLaunched(params.files));
}
