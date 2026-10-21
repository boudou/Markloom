import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

interface ResizeDragOptions {
  /** The persisted value; shown whenever no drag is in progress */
  stored: number;
  min: number;
  max: number;
  /** Measured once when the drag starts */
  anchorRef: RefObject<HTMLElement>;
  /** Pointer x to value, given the anchor's rect from the start of the drag */
  toValue: (clientX: number, anchor: DOMRect) => number;
  /** Called once, on release, with the last value (not called when the pointer never moved) */
  commit: (value: number) => void;
}

interface ResizeDrag {
  value: number;
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Drags a resize handle: the value follows the pointer in local state and is saved once, on
 * release, so persisted stores aren't rewritten on every pointer move. Pointer capture keeps
 * the drag alive when the pointer races ahead of the handle (the editor, the desktop title bar
 * region or an iframe would otherwise swallow moves).
 */
export function useResizeDrag({ stored, min, max, anchorRef, toValue, commit }: ResizeDragOptions): ResizeDrag {
  const [local, setLocal] = useState<number | null>(null);
  const endRef = useRef<(() => void) | null>(null);

  // Unmounting mid-drag (sidebar closed, mode switched) still saves and resets the cursor
  useEffect(() => () => endRef.current?.(), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const anchor = anchorRef.current;

    // One drag at a time: a second finger or pen on a touch-none handle would start another
    if (event.button !== 0 || !anchor || endRef.current) return;

    event.preventDefault();
    const { pointerId } = event;
    event.currentTarget.setPointerCapture(pointerId);
    const rect = anchor.getBoundingClientRect();
    let latest: number | null = null;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setLocal(stored);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;

      const next = Math.min(max, Math.max(min, toValue(ev.clientX, rect)));
      latest = next;
      setLocal(next);
    };

    const release = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) end();
    };

    // Window, not the handle: captured events bubble here and keep arriving if the handle unmounts
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      endRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Store first, so no frame shows the old stored value
      if (latest !== null) commit(latest);
      setLocal(null);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    endRef.current = end;
  };

  return { value: local ?? stored, dragging: local !== null, onPointerDown };
}
