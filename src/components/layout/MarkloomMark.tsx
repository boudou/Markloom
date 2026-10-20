import markUrl from '@/assets/markloom-mark.png';

/** The Markloom mark: an "ML" woven into a document page. */
export function MarkloomMark({ className }: { className?: string }) {
  return <img src={markUrl} alt="" aria-hidden="true" draggable={false} className={className} />;
}
