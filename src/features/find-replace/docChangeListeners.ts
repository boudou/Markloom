/** Per-view doc-change listeners: the editor's static hook calls `notify`, an engine `listen`s while a query is active */
export interface DocChangeListeners<View extends object> {
  notify(view: View): void;
  listen(view: View, listener: () => void): () => void;
}

export function createDocChangeListeners<View extends object>(): DocChangeListeners<View> {
  const listeners = new WeakMap<View, () => void>();

  return {
    notify: (view) => listeners.get(view)?.(),
    listen(view, listener) {
      listeners.set(view, listener);

      return () => {
        // A newer engine on the same view may have taken over; leave its listener alone
        if (listeners.get(view) === listener) listeners.delete(view);
      };
    },
  };
}
