// Toolbar keyboard pattern: the whole toolbar is one Tab stop; arrow keys move between
// its controls (WAI-ARIA toolbar). Keeps the path from the window edge to the document short.
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [role="radio"], input:not([disabled])';

export function useRovingToolbar(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const toolbar = ref.current;
    if (!toolbar) return;
    let current: HTMLElement | null = null;

    const items = () =>
      Array.from(toolbar.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);

    // Exactly one control is reachable with Tab: the last one used (or the first)
    const sync = () => {
      const all = items();
      if (!current || !all.includes(current)) current = all[0] ?? null;
      for (const el of all) el.tabIndex = el === current ? 0 : -1;
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(FOCUSABLE);
      if (target && toolbar.contains(target)) {
        current = target;
        sync();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') return;
      const all = items();
      const index = all.indexOf(target.closest<HTMLElement>(FOCUSABLE)!);
      if (index === -1) return;
      const next =
        e.key === 'Home' ? 0
        : e.key === 'End' ? all.length - 1
        : (index + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
      e.preventDefault();
      all[next].focus();
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(toolbar, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    toolbar.addEventListener('focusin', onFocusIn);
    toolbar.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      toolbar.removeEventListener('focusin', onFocusIn);
      toolbar.removeEventListener('keydown', onKeyDown);
    };
  }, [ref]);
}
