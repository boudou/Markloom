import markUrl from '@/assets/markloom-mark.png';

/** The Markloom mark: a pen drawing a line. */
export function MarkloomMark({ className }: { className?: string }) {
  return <img src={markUrl} alt="" aria-hidden="true" draggable={false} className={className} />;
}
