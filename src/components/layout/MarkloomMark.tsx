/** The Markloom mark: a single drop of ink. */
export function MarkloomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.75c3.9 4.6 6.75 8.35 6.75 11.85a6.75 6.75 0 0 1-13.5 0C5.25 11.1 8.1 7.35 12 2.75Z"
        fill="currentColor"
      />
      <path
        d="M9.1 15.2a3.1 3.1 0 0 0 2.6 2.75"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.85"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
