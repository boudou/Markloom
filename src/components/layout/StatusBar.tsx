import { selectActiveTab, useTabsStore } from '@/features/tabs';
import { useSettingsStore } from '@/stores/settingsStore';
import { WordCountWidget } from '@/features/word-count';
import { AutoSaveIndicator } from '@/features/auto-save';

// The document's name and state live in the title bar; this row is for live stats.
export function StatusBar() {
  const hasFile = useTabsStore((s) => !!selectActiveTab(s)?.path);
  const autoSave = useSettingsStore((s) => s.autoSave);

  return (
    <footer className="h-7 flex items-center justify-between px-4 bg-panel border-t border-rule text-xs text-text-muted flex-shrink-0">
      <div className="flex items-center gap-4">{autoSave && hasFile && <AutoSaveIndicator />}</div>
      <div className="flex items-center gap-4">
        <WordCountWidget />
      </div>
    </footer>
  );
}
