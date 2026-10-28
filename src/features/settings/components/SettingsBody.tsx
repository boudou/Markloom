import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ElementType,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AppWindow, History as HistoryIcon, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { toggleAutoSave } from '@/features/auto-save';
// Deep paths: the version-history barrel is imported eagerly by the title bar, and these must stay in this lazy chunk
import { useHistoryStore } from '@/features/version-history/stores/historyStore';
import { readHistoryUsage, type HistoryUsage } from '@/features/version-history/utils';
import { AUTO_SAVE_INTERVALS, HISTORY_LIMITS, PAGE_WIDTHS, formatInterval, useSettingsStore } from '@/stores/settingsStore';
import { UpdatesSection } from './UpdatesSection';

type SectionId = 'editor' | 'history' | 'window' | 'updates';

interface Section {
  id: SectionId;
  label: string;
  icon: ElementType;
}

// The desktop bridge; this module is a lazy chunk, so the preload has run
const desktop = window.markloomDesktop;

// Later sections (About, Appearance) append here; Window and Updates are desktop only
const SECTIONS: readonly Section[] = [
  { id: 'editor', label: 'Editor', icon: SlidersHorizontal },
  { id: 'history', label: 'History', icon: HistoryIcon },
  ...(desktop ? [{ id: 'window' as const, label: 'Window', icon: AppWindow }] : []),
  ...(desktop ? [{ id: 'updates' as const, label: 'Updates', icon: RefreshCw }] : []),
];

const CONTROL_FOCUS = 'outline-hidden focus-visible:ring-2 focus-visible:ring-accent-primary';

interface CheckboxRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

function CheckboxRow({ label, hint, checked, onChange, autoFocus, disabled }: CheckboxRowProps) {
  const hintId = useId();

  return (
    <div className="py-3">
      <label className={cn('flex items-center gap-2.5 text-sm text-text-primary', disabled ? 'cursor-default opacity-60' : 'cursor-pointer')}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hintId}
          data-autofocus={autoFocus || undefined}
          className={cn('w-4 h-4 rounded-sm accent-accent-primary cursor-pointer', CONTROL_FOCUS)}
        />
        {label}
      </label>
      <p id={hintId} className="mt-0.5 pl-[26px] text-xs text-text-muted">
        {hint}
      </p>
    </div>
  );
}

interface SelectRowProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}

function SelectRow({ label, hint, value, onChange, children }: SelectRowProps) {
  const hintId = useId();

  return (
    <div className="py-3">
      <label className="flex items-center justify-between gap-4 text-sm text-text-primary">
        {label}
        <select
          value={value}
          onChange={onChange}
          aria-describedby={hint ? hintId : undefined}
          className={cn('h-8 min-w-36 px-2 rounded-md border border-rule bg-canvas text-sm text-text-primary', CONTROL_FOCUS)}
        >
          {children}
        </select>
      </label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-xs text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function EditorSection() {
  const wordWrap = useSettingsStore((s) => s.editor.wordWrap);
  const lineNumbers = useSettingsStore((s) => s.editor.lineNumbers);
  const syncScroll = useSettingsStore((s) => s.syncScroll);
  const pageWidth = useSettingsStore((s) => s.pageWidth);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const interval = useSettingsStore((s) => s.autoSaveInterval);
  const setWordWrap = useSettingsStore((s) => s.setWordWrap);
  const setLineNumbers = useSettingsStore((s) => s.setLineNumbers);
  const setSyncScroll = useSettingsStore((s) => s.setSyncScroll);
  const setPageWidth = useSettingsStore((s) => s.setPageWidth);
  const setAutoSaveInterval = useSettingsStore((s) => s.setAutoSaveInterval);

  // A stored delay that isn't offered still shows, so the select is never blank and nothing is rewritten
  const intervals = AUTO_SAVE_INTERVALS.includes(interval) ? AUTO_SAVE_INTERVALS : [...AUTO_SAVE_INTERVALS, interval].sort((a, b) => a - b);

  const changePageWidth = (event: ChangeEvent<HTMLSelectElement>) => {
    const width = PAGE_WIDTHS.find((w) => w.value === event.target.value);

    if (width) setPageWidth(width.value);
  };

  const changeInterval = (event: ChangeEvent<HTMLSelectElement>) => {
    const seconds = intervals.find((s) => String(s) === event.target.value);

    if (seconds !== undefined) setAutoSaveInterval(seconds);
  };

  return (
    <div className="divide-y divide-rule">
      <div>
        <h3 className="pt-1 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Writing</h3>
        <CheckboxRow label="Wrap long lines" hint="Markdown editor" checked={wordWrap} onChange={setWordWrap} autoFocus />
        <CheckboxRow label="Line numbers" hint="Markdown editor" checked={lineNumbers} onChange={setLineNumbers} />
        <CheckboxRow
          label="Scroll panes together"
          hint="Markdown editor: the preview follows the source"
          checked={syncScroll}
          onChange={setSyncScroll}
        />
        <SelectRow label="Page width" hint="How wide the rich-text page and the preview may grow" value={pageWidth} onChange={changePageWidth}>
          {PAGE_WIDTHS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectRow>
      </div>
      <div className="pt-3">
        <h3 className="pt-1 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Saving</h3>
        <CheckboxRow
          label="Auto-save"
          hint="Documents that have a file are saved after you stop typing"
          checked={autoSave}
          onChange={(on) => on !== autoSave && toggleAutoSave()}
        />
        <SelectRow label="Save after" value={String(interval)} onChange={changeInterval}>
          {intervals.map((seconds) => (
            <option key={seconds} value={seconds}>
              {formatInterval(seconds)}
            </option>
          ))}
        </SelectRow>
      </div>
    </div>
  );
}

/** "0 bytes", "1 byte", "12.3 KB", "4.5 MB" */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes === 1 ? '1 byte' : `${bytes} bytes`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

type UsageReadout = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; usage: HistoryUsage };

/** Where focus goes when the confirm group closes */
type FocusAfterConfirm = 'clear' | 'storage' | null;

const ERROR_TEXT = 'mt-1 text-xs text-error';

function HistorySection() {
  const historyLimit = useSettingsStore((s) => s.historyLimit);
  const setHistoryLimit = useSettingsStore((s) => s.setHistoryLimit);
  const [readout, setReadout] = useState<UsageReadout>({ status: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [trimFailed, setTrimFailed] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  // Only the newest read may update the numbers; unmounting bumps it so a late reply is dropped
  const latestRead = useRef(0);
  const focusAfterConfirm = useRef<FocusAfterConfirm>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const storageGroup = useRef<HTMLDivElement>(null);

  // A stored limit that isn't offered still shows, so the select is never blank and nothing is rewritten
  const limits = HISTORY_LIMITS.includes(historyLimit) ? HISTORY_LIMITS : [...HISTORY_LIMITS, historyLimit].sort((a, b) => a - b);

  // The old numbers stay up while a refresh runs, so the Clear button doesn't flicker
  const refresh = useCallback(async () => {
    latestRead.current += 1;
    const read = latestRead.current;

    try {
      const usage = await readHistoryUsage();

      if (read === latestRead.current) setReadout({ status: 'ready', usage });
    } catch (error) {
      console.error('Failed to read history usage:', error);

      if (read === latestRead.current) setReadout({ status: 'failed' });
    }
  }, []);

  useEffect(() => {
    void refresh();

    return () => {
      latestRead.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (confirming) {
      cancelButton.current?.focus();

      return;
    }

    if (focusAfterConfirm.current === 'clear') clearButton.current?.focus();
    else if (focusAfterConfirm.current === 'storage') storageGroup.current?.focus();

    focusAfterConfirm.current = null;
  }, [confirming]);

  const changeLimit = async (event: ChangeEvent<HTMLSelectElement>) => {
    const count = limits.find((n) => String(n) === event.target.value);

    if (count === undefined) return;

    const lowered = count < historyLimit;
    setHistoryLimit(count);
    setTrimFailed(false);

    if (!lowered) return;

    try {
      await useHistoryStore.getState().trimAll(count);
    } catch {
      setTrimFailed(true);
    }

    await refresh();
  };

  const cancelClear = () => {
    focusAfterConfirm.current = 'clear';
    setConfirming(false);
  };

  const deleteAll = async () => {
    setClearFailed(false);

    try {
      await useHistoryStore.getState().clearAll();
      // The Clear button is disabled once nothing is left, so focus goes to the numbers that changed
      focusAfterConfirm.current = 'storage';
    } catch {
      setClearFailed(true);
      focusAfterConfirm.current = 'clear';
    }

    await refresh();
    setConfirming(false);
  };

  const usage = readout.status === 'ready' ? readout.usage : null;
  const pending = readout.status === 'loading' ? '…' : 'Not available';

  return (
    <div className="divide-y divide-rule">
      <div>
        <h3 className="pt-1 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Versions</h3>
        <SelectRow
          label="Versions to keep per file"
          hint="Older versions of each file are deleted past this number"
          value={String(historyLimit)}
          onChange={(event) => void changeLimit(event)}
        >
          {limits.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </SelectRow>
        {trimFailed && (
          <p role="alert" className={cn(ERROR_TEXT, 'pb-3')}>
            Couldn't remove older versions. They will go the next time you save a version.
          </p>
        )}
      </div>
      <div ref={storageGroup} tabIndex={-1} className="pt-3 outline-hidden">
        <h3 className="pt-1 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Storage</h3>
        <dl className="py-2 text-sm">
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-text-primary">Storage used</dt>
            <dd className="text-text-secondary tabular-nums">{usage ? formatBytes(usage.bytes) : pending}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-text-primary">Files with history</dt>
            <dd className="text-text-secondary tabular-nums">{usage ? usage.files : pending}</dd>
          </div>
        </dl>
        <div className="py-3">
          {confirming && usage ? (
            <div role="group" aria-label="Confirm clear all history" className="flex flex-wrap items-center gap-2">
              <p className="w-full text-sm text-text-primary">
                Delete all {plural(usage.versions, 'version')} of {plural(usage.files, 'file')}? This can't be undone.
              </p>
              <Button ref={cancelButton} variant="secondary" size="sm" onClick={cancelClear}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={() => void deleteAll()}>
                Delete all
              </Button>
            </div>
          ) : (
            <Button ref={clearButton} variant="danger" size="sm" disabled={!usage || usage.versions === 0} onClick={() => setConfirming(true)}>
              Clear all history…
            </Button>
          )}
          {clearFailed && (
            <p role="alert" className={ERROR_TEXT}>
              Couldn't clear the history.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface TrayPrefs {
  minimizeToTray: boolean;
  closeToTray: boolean;
}

interface ExplorerMenu {
  enabled: boolean;
  portable: boolean;
}

const GROUP_HEADING = 'pt-1 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted';

/** Desktop only: the tray toggles and, on Windows, the Explorer menu. Main stores all three. */
function WindowSection() {
  const [prefs, setPrefs] = useState<TrayPrefs | null>(null);
  const [prefsFailed, setPrefsFailed] = useState(false);
  const [explorer, setExplorer] = useState<ExplorerMenu | null>(null);
  const [explorerBusy, setExplorerBusy] = useState(false);
  const [explorerFailed, setExplorerFailed] = useState(false);
  // Replies that arrive after Settings closed are dropped
  const mounted = useRef(true);
  const windows = desktop?.platform === 'win32';

  useEffect(() => {
    mounted.current = true;

    if (!desktop) return;

    desktop.updateWindowPrefs({}).then(
      (reply) => mounted.current && setPrefs(reply),
      () => mounted.current && setPrefsFailed(true)
    );

    if (windows) {
      desktop.setExplorerMenu().then(
        (reply) => mounted.current && setExplorer(reply),
        () => mounted.current && setExplorerFailed(true)
      );
    }

    return () => {
      mounted.current = false;
    };
  }, [windows]);

  if (!desktop) return null;

  const changeTray = async (changes: Partial<TrayPrefs>) => {
    setPrefsFailed(false);

    try {
      const reply = await desktop.updateWindowPrefs(changes);

      if (mounted.current) setPrefs(reply);
    } catch {
      if (mounted.current) setPrefsFailed(true);
    }
  };

  const changeExplorer = async (on: boolean) => {
    setExplorerBusy(true);
    setExplorerFailed(false);

    try {
      const reply = await desktop.setExplorerMenu(on);

      if (mounted.current) setExplorer(reply);
    } catch {
      if (mounted.current) setExplorerFailed(true);

      // Show what main has now; keep the old state if even that can't be read
      try {
        const reply = await desktop.setExplorerMenu();

        if (mounted.current) setExplorer(reply);
      } catch {
        // The error above already shows
      }
    }

    if (mounted.current) setExplorerBusy(false);
  };

  const explorerHint =
    'Right-click a Markdown file, a folder, or the empty space in a folder. On Windows 11 it is under Show more options.' +
    (explorer?.portable ? ' Turn this off before deleting Markloom.' : '');

  return (
    <div className="divide-y divide-rule">
      <div>
        <h3 className={GROUP_HEADING}>Tray</h3>
        <CheckboxRow
          label="Minimize to tray"
          hint="Minimizing hides the window; click the tray icon to bring it back"
          checked={prefs?.minimizeToTray ?? false}
          onChange={(on) => void changeTray({ minimizeToTray: on })}
          disabled={!prefs}
          autoFocus
        />
        <CheckboxRow
          label="Close to tray"
          hint="Closing the window keeps Markloom running; quit from the tray icon"
          checked={prefs?.closeToTray ?? false}
          onChange={(on) => void changeTray({ closeToTray: on })}
          disabled={!prefs}
        />
        {prefsFailed && (
          <p role="alert" className={cn(ERROR_TEXT, 'pb-3')}>
            Couldn't change the window settings.
          </p>
        )}
      </div>
      {windows && (
        <div className="pt-3">
          <h3 className={GROUP_HEADING}>Explorer</h3>
          <CheckboxRow
            label='Add "Open with Markloom" to the Explorer menu'
            hint={explorerHint}
            checked={explorer?.enabled ?? false}
            onChange={(on) => void changeExplorer(on)}
            disabled={!explorer || explorerBusy}
          />
          {explorerFailed && (
            <p role="alert" className={cn(ERROR_TEXT, 'pb-3')}>
              Couldn't change the Explorer menu.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Settings window: a section list on the left, the chosen section on the right */
export default function SettingsBody() {
  const [section, setSection] = useState<SectionId>('editor');
  const baseId = useId();
  const tabId = (id: SectionId) => `${baseId}-tab-${id}`;
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  // Up and Down move between sections, as in a vertical tab list
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;

    if (step === 0) return;

    event.preventDefault();
    const index = SECTIONS.findIndex((s) => s.id === section);
    const next = SECTIONS[(index + step + SECTIONS.length) % SECTIONS.length];
    setSection(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 min-h-[360px]">
      <div role="tablist" aria-label="Settings sections" aria-orientation="vertical" className="flex sm:flex-col gap-1 sm:w-40 shrink-0">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const selected = id === section;

          return (
            <button
              key={id}
              id={tabId(id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setSection(id)}
              onKeyDown={onTabKeyDown}
              className={cn(
                'flex items-center gap-2 h-8 px-2.5 rounded-md text-sm font-medium text-left transition-colors',
                CONTROL_FOCUS,
                selected ? 'bg-wash text-text-primary' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <Icon className="w-4 h-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={tabId(current.id)} className="flex-1 min-w-0">
        {current.id === 'editor' && <EditorSection />}
        {current.id === 'history' && <HistorySection />}
        {current.id === 'window' && <WindowSection />}
        {current.id === 'updates' && <UpdatesSection />}
      </div>
    </div>
  );
}
