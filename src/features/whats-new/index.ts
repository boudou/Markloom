import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';

export { WhatsNewModal } from './components/WhatsNewModal';

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)/;

/** Major, minor and patch; a pre-release suffix such as `-beta.1` is ignored */
function parseVersion(version: string): [number, number, number] | null {
  const match = VERSION_PATTERN.exec(version);

  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Compared numerically, so 0.10.0 is newer than 0.9.0; an unreadable version is never newer */
function isNewer(current: string, seen: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(seen);

  if (!a || !b) return false;

  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }

  return false;
}

/**
 * Opens What's new on the first launch after an update. A first launch (nothing stored) and a
 * downgrade only record the version.
 */
export function showWhatsNewAfterUpdate(): void {
  const settings = useSettingsStore.getState();
  const seen = settings.lastSeenVersion;

  if (seen === __APP_VERSION__) return;

  // Recorded on open, so a reload (or a crash) never shows the same notes twice
  settings.setLastSeenVersion(__APP_VERSION__);

  if (seen !== null && isNewer(__APP_VERSION__, seen)) useUiStore.getState().openDialog('whatsNew');
}
