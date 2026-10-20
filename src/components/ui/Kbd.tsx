import { cn } from '@/lib/utils';

interface KbdProps {
  children: string;
  className?: string;
}

// Format shortcut for display
function formatShortcut(shortcut: string): string[] {
  const isMac = navigator.platform.includes('Mac');

  return shortcut
    .split('+')
    .map((key) => {
      const k = key.trim().toLowerCase();
      switch (k) {
        case 'ctrl':
        case 'control':
          return isMac ? '\u2303' : 'Ctrl';
        case 'alt':
          return isMac ? '\u2325' : 'Alt';
        case 'shift':
          return isMac ? '\u21E7' : 'Shift';
        case 'meta':
        case 'cmd':
        case 'command':
          return isMac ? '\u2318' : 'Win';
        case 'enter':
          return '\u21B5';
        case 'escape':
        case 'esc':
          return 'Esc';
        case 'backspace':
          return '\u232B';
        case 'delete':
          return 'Del';
        case 'tab':
          return '\u21B9';
        case 'arrowup':
          return '\u2191';
        case 'arrowdown':
          return '\u2193';
        case 'arrowleft':
          return '\u2190';
        case 'arrowright':
          return '\u2192';
        case ' ':
        case 'space':
          return 'Space';
        default:
          return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
      }
    });
}

export function Kbd({ children, className }: KbdProps) {
  const keys = formatShortcut(children);

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((key, index) => (
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

// Inline keyboard shortcut (lighter styling for use in tooltips)
export function KbdInline({ children, className }: KbdProps) {
  const keys = formatShortcut(children);

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-text-muted', className)}>
      {keys.map((key, index) => (
        <span key={index} className="text-xs font-mono">
          {key}
          {index < keys.length - 1 && '+'}
        </span>
      ))}
    </span>
  );
}
