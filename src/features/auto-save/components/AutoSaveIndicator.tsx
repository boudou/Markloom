import { Cloud, CloudOff, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Tooltip } from '@/components/ui';
import { cn } from '@/lib/utils';
import { selectActiveTab, useTabsStore } from '@/features/tabs';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAutoSave, type AutoSaveStatus } from '../hooks';
import { toggleAutoSave } from '../autoSave';

interface Look {
  icon: React.ElementType;
  /** Visible text */
  text: string;
  /** Tooltip sentence after "Auto-save on." */
  detail: string;
  className: string;
  iconClassName?: string;
}

const off: Look = { icon: CloudOff, text: 'Auto-save off', detail: '', className: 'text-text-muted' };

const looks: Record<AutoSaveStatus, Look> = {
  idle: { icon: Cloud, text: 'Auto-save on', detail: '', className: 'text-text-secondary' },
  pending: { icon: Cloud, text: 'Auto-save on', detail: 'Changes waiting to be saved. ', className: 'text-warning' },
  saving: { icon: Loader2, text: 'Saving…', detail: 'Saving… ', className: 'text-accent-primary', iconClassName: 'animate-spin' },
  saved: { icon: Check, text: 'Saved', detail: 'Saved. ', className: 'text-success' },
  error: { icon: AlertCircle, text: 'Save failed', detail: 'The last save failed. ', className: 'text-error' },
};

/** Status-bar toggle: shows whether auto-save is on and what it is doing, and turns it on or off. */
export function AutoSaveIndicator() {
  const autoSave = useSettingsStore((s) => s.autoSave);
  const interval = useSettingsStore((s) => s.autoSaveInterval);
  const hasFile = useTabsStore((s) => !!selectActiveTab(s)?.path);
  const { status, lastSaved } = useAutoSave();

  const look = autoSave ? looks[status] : off;
  const Icon = look.icon;

  const detail =
    status === 'saved' && lastSaved
      ? `Saved at ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. `
      : look.detail;

  // The tooltip is also the button's accessible name, so it starts with the state
  let tooltip = `Auto-save off. Turn it on to save documents that have a file ${interval} seconds after you stop typing.`;

  if (autoSave && hasFile) tooltip = `Auto-save on. ${detail}Click to turn off.`;

  if (autoSave && !hasFile) tooltip = 'Auto-save on. Save this document once to start auto-saving it. Click to turn off.';

  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        aria-pressed={autoSave}
        onClick={toggleAutoSave}
        className={cn(
          'flex items-center gap-1 h-5 px-1 -mx-1 rounded text-xs hover:text-text-primary transition-colors',
          'outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
          look.className
        )}
      >
        <Icon className={cn('w-3.5 h-3.5', look.iconClassName)} aria-hidden />
        <span>{look.text}</span>
      </button>
    </Tooltip>
  );
}
