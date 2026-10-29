import markUrl from '@/assets/markloom-mark.png';
import { cn } from '@/lib/utils';

/** The Markloom mark: a pen drawing a line. White in dark mode, where the navy drawing would vanish. */
export function MarkloomMark({ className }: { className?: string }) {
  return (
    <img
      src={markUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('dark:[filter:brightness(0)_invert(1)]', className)}
    />
  );
}
