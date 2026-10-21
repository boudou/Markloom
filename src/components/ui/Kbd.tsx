import { cn } from '@/lib/utils';
import { shortcutParts, shortcutSpokenKeys, type ShortcutId } from '@/lib/shortcuts';

interface KbdProps {
  id: ShortcutId;
  /** "sm" is the compact chip that fits inside a 28 px button */
  size?: 'md' | 'sm';
  className?: string;
}

// The chips are hidden from assistive tech; one spoken string ("Ctrl+Shift+P") stands in for them.
// It is text, not aria-label: a plain span has the generic role, which ARIA does not let you name.
export function Kbd({ id, size = 'md', className }: KbdProps) {
  return (
    <span className={cn('inline-flex items-center', size === 'sm' ? 'gap-0.5' : 'gap-1', className)}>
      <span className="sr-only">{shortcutSpokenKeys(id)}</span>
      {shortcutParts(id).map((key, index) => (
        <kbd
          key={index}
          aria-hidden
          className={cn(
            'inline-flex items-center justify-center font-mono rounded',
            size === 'sm'
              ? 'min-w-[1rem] h-4 px-1 text-[10px] bg-wash text-text-muted'
              : 'min-w-[1.5rem] h-6 px-1.5 text-xs font-medium bg-rule text-text-secondary border border-rule/50 shadow-sm'
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
