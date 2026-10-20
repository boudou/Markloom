import { cn } from '@/lib/utils';
import { shortcutParts, type ShortcutId } from '@/lib/shortcuts';

interface KbdProps {
  id: ShortcutId;
  className?: string;
}

export function Kbd({ id, className }: KbdProps) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {shortcutParts(id).map((key, index) => (
        <kbd
          key={index}
          className={cn(
            'inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5',
            'text-xs font-mono font-medium',
            'bg-rule text-text-secondary',
            'border border-rule/50 rounded',
            'shadow-sm'
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
