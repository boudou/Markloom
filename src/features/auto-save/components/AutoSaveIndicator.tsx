import { Cloud, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Tooltip } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAutoSave, type AutoSaveStatus } from '../hooks';

const statusConfig: Record<
  AutoSaveStatus,
  { icon: React.ElementType; label: string; className: string }
> = {
  idle: {
    icon: Cloud,
    label: 'Auto-save enabled',
    className: 'text-text-muted',
  },
  pending: {
    icon: Cloud,
    label: 'Changes pending…',
    className: 'text-warning',
  },
  saving: {
    icon: Loader2,
    label: 'Saving…',
    className: 'text-accent-primary animate-spin',
  },
  saved: {
    icon: Check,
    label: 'Saved',
    className: 'text-success',
  },
  error: {
    icon: AlertCircle,
    label: 'Save failed',
    className: 'text-error',
  },
};

export function AutoSaveIndicator() {
  const { status, lastSaved } = useAutoSave();
  const config = statusConfig[status];
  const Icon = config.icon;

  const formatTime = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const tooltipContent =
    status === 'saved' && lastSaved
      ? `${config.label} at ${formatTime(lastSaved)}`
      : config.label;

  return (
    <Tooltip content={tooltipContent}>
      <div
        className={cn(
          'flex items-center gap-1 text-xs cursor-default',
          config.className
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        {status === 'saving' && <span>Saving…</span>}
        {status === 'saved' && <span>Saved</span>}
        {status === 'error' && <span>Error</span>}
      </div>
    </Tooltip>
  );
}
