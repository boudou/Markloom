import { Button } from '@/components/ui';
import { analyticsAvailable } from '@/lib/analytics';
import { selectAnalyticsConsent, useSettingsStore } from '@/stores/settingsStore';

/**
 * Asks once whether the web version may count page views (#210). Not modal and never takes focus:
 * the app works the same until it's answered. The palette changes the answer later.
 */
export function ConsentBar() {
  const consent = useSettingsStore(selectAnalyticsConsent);
  const setConsent = useSettingsStore((s) => s.setAnalyticsConsent);

  if (!analyticsAvailable || consent !== 'unset') return null;

  return (
    <section
      role="region"
      aria-label="Usage statistics"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 bg-panel border-t border-rule text-sm text-text-secondary flex-shrink-0"
    >
      <p>Count page views with Google Analytics to help improve Markloom? Nothing else is tracked.</p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setConsent('denied')}>
          No thanks
        </Button>
        <Button size="sm" onClick={() => setConsent('granted')}>
          Allow
        </Button>
      </div>
    </section>
  );
}
