// Focus mode changes the editor's padding; both editors use this to keep the caret where it
// was on screen so the text doesn't jump when focus mode is turned on or off.
import { useAppStore } from '@/stores/appStore';

/**
 * Watches focus mode and scrolls `scroller` by however far the caret moved when it toggled.
 * Returns the cleanup.
 */
export function keepCaretOnFocusToggle(caretTop: () => number | null, scroller: () => HTMLElement | null): () => void {
  let frame = 0;

  const unsubscribe = useAppStore.subscribe((state, prev) => {
    if (state.focusMode === prev.focusMode) return;

    // A zustand subscriber runs before React commits [data-focus], so this reads the old
    // layout; the next frame reads the new one
    const before = caretTop();

    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const after = caretTop();
      const page = scroller();

      if (before !== null && after !== null && page) page.scrollTop += after - before;
    });
  });

  return () => {
    unsubscribe();
    cancelAnimationFrame(frame);
  };
}
