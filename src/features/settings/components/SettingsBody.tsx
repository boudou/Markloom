import { useId, useState, type ChangeEvent, type ElementType, type KeyboardEvent, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toggleAutoSave } from '@/features/auto-save';
import { AUTO_SAVE_INTERVALS, PAGE_WIDTHS, formatInterval, useSettingsStore } from '@/stores/settingsStore';

type SectionId = 'editor';

interface Section {
  id: SectionId;
  label: string;
  icon: ElementType;
}

// Later sections (About, History, Updates, Window, Appearance) append here
const SECTIONS: readonly Section[] = [{ id: 'editor', label: 'Editor', icon: SlidersHorizontal }];

const CONTROL_FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-accent-primary';

interface CheckboxRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  autoFocus?: boolean;
}

function CheckboxRow({ label, hint, checked, onChange, autoFocus }: CheckboxRowProps) {
  const hintId = useId();

  return (
    <div className="py-3">
      <label className="flex items-center gap-2.5 text-sm text-text-primary cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hintId}
          data-autofocus={autoFocus || undefined}
          className={cn('w-4 h-4 rounded accent-accent-primary cursor-pointer', CONTROL_FOCUS)}
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
          className={cn('h-8 min-w-[9rem] px-2 rounded-md border border-rule bg-canvas text-sm text-text-primary', CONTROL_FOCUS)}
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
      <div role="tablist" aria-label="Settings sections" aria-orientation="vertical" className="flex sm:flex-col gap-1 sm:w-40 flex-shrink-0">
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
      </div>
    </div>
  );
}
