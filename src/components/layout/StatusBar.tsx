import { WordCountWidget } from '@/features/word-count';
import { AutoSaveIndicator } from '@/features/auto-save';

// The document's name and state live in the title bar; this row is for live stats.
export function StatusBar() {
  return (
    <footer className="h-7 flex items-center justify-between px-4 bg-panel border-t border-rule text-xs text-text-muted flex-shrink-0">
      <div className="flex items-center gap-4">
        <AutoSaveIndicator />
      </div>
      <div className="flex items-center gap-4">
        <WordCountWidget />
      </div>
    </footer>
  );
}
