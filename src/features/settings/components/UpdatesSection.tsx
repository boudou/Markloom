import { Button } from '@/components/ui';
import { UPDATE_ERROR_TEXT, checkForUpdate, useUpdateStore, type UpdateStatus } from '@/features/updates';
import { useSettingsStore } from '@/stores/settingsStore';

function formatCheckedAt(at: number | null): string {
  if (at === null) return 'Never';

  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusLine({ status }: { status: UpdateStatus }) {
  if (status.state === 'latest') {
    return (
      <p role="status" className="mt-2 text-sm text-text-secondary">
        You have the latest version.
      </p>
    );
  }

  if (status.state === 'available') {
    return (
      <div role="status" className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-primary">
        <span>Markloom {status.version} is available.</span>
        {/* Opens in the system browser: the desktop app hands new windows to the OS */}
        <a
          href={status.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-xs font-medium px-2.5 py-1.5 rounded-lg bg-accent-primary text-on-accent hover:bg-accent-hover outline-hidden focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          Download
        </a>
      </div>
    );
  }

  if (status.state === 'failed') {
    return (
      <p role="alert" className="mt-1 text-xs text-error">
        {UPDATE_ERROR_TEXT[status.error]}
      </p>
    );
  }

  return null;
}

/** Settings > Updates (desktop only): the installed version and a manual check against GitHub */
export function UpdatesSection() {
  const lastCheckedAt = useSettingsStore((s) => s.lastUpdateCheckAt);
  const status = useUpdateStore((s) => s.status);
  const checking = status.state === 'checking';

  return (
    <div>
      <h3 className="pt-1 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Version</h3>
      <dl className="py-2 text-sm">
        <div className="flex justify-between gap-4 py-1">
          <dt className="text-text-primary">Installed version</dt>
          <dd className="text-text-secondary tabular-nums">{__APP_VERSION__}</dd>
        </div>
        <div className="flex justify-between gap-4 py-1">
          <dt className="text-text-primary">Last checked</dt>
          <dd className="text-text-secondary tabular-nums">{formatCheckedAt(lastCheckedAt)}</dd>
        </div>
      </dl>
      <div className="py-3">
        <Button variant="secondary" size="sm" disabled={checking} onClick={() => void checkForUpdate()}>
          {checking ? 'Checking…' : 'Check now'}
        </Button>
        <StatusLine status={status} />
      </div>
    </div>
  );
}
