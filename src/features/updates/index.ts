// Desktop update check (#157): the main process asks GitHub for the newest release; this module
// keeps the latest answer so Settings > Updates shows it, even after being closed mid-check.
import { create } from 'zustand';
import { useSettingsStore } from '@/stores/settingsStore';

type DesktopBridge = NonNullable<Window['markloomDesktop']>;

type UpdateCheck = Awaited<ReturnType<DesktopBridge['checkForUpdate']>>;

export type UpdateError = Extract<UpdateCheck, { ok: false }>['error'];

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'latest' }
  | { state: 'available'; version: string; url: string }
  | { state: 'failed'; error: UpdateError };

interface UpdateStore {
  status: UpdateStatus;
}

export const useUpdateStore = create<UpdateStore>()(() => ({ status: { state: 'idle' } }));

export const UPDATE_ERROR_TEXT: Record<UpdateError, string> = {
  offline: "Couldn't reach GitHub. Are you offline?",
  'rate-limited': 'GitHub is limiting requests right now. Try again later.',
  other: "Couldn't check for updates. Try again later.",
};

/** Desktop only; a check already running is not started again. Only a success records the time. */
export async function checkForUpdate(): Promise<void> {
  const bridge = window.markloomDesktop;

  if (!bridge || useUpdateStore.getState().status.state === 'checking') return;

  useUpdateStore.setState({ status: { state: 'checking' } });

  let result: UpdateCheck;

  try {
    result = await bridge.checkForUpdate();
  } catch (error) {
    console.error('Failed to check for updates:', error);
    result = { ok: false, error: 'other' };
  }

  if (!result.ok) {
    useUpdateStore.setState({ status: { state: 'failed', error: result.error } });

    return;
  }

  useSettingsStore.getState().setLastUpdateCheckAt(result.checkedAt);
  useUpdateStore.setState({
    status: result.newer ? { state: 'available', version: result.latest, url: result.url } : { state: 'latest' },
  });
}
