import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal, Kbd, Input } from '@/components/ui';
import { SHORTCUTS, shortcutKeys, type ShortcutId } from '@/lib/shortcuts';

interface ShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROUPS = ['File', 'Edit', 'Format', 'View'] as const;
const ALL_IDS = Object.keys(SHORTCUTS) as ShortcutId[];

// Generated from the same table the key handlers use, so it can't promise keys that don't work.
export function ShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const groups = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (id: ShortcutId) => {
      const text = `${SHORTCUTS[id].label} ${shortcutKeys(id)} ${SHORTCUTS[id].group}`.toLowerCase();
      return words.every((w) => text.includes(w));
    };
    return GROUPS.map((group) => ({
      group,
      items: ALL_IDS.filter((id) => SHORTCUTS[id].group === group && matches(id)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" size="3xl">
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
        <Input
          data-autofocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shortcuts"
          aria-label="Search shortcuts"
          className="pl-9"
        />
      </div>
      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 max-h-[55vh] overflow-y-auto pr-1">
        {groups.length === 0 && <p className="text-sm text-text-muted">No shortcuts match “{query}”.</p>}
        {groups.map(({ group, items }) => (
          <section key={group}>
            <h3 className="text-xs font-medium text-text-muted mb-1.5">{group}</h3>
            <dl className="divide-y divide-rule border-y border-rule">
              {items.map((id) => (
                <div key={id} className="flex items-center justify-between gap-4 py-1.5">
                  <dt className="text-sm text-text-primary">{SHORTCUTS[id].label}</dt>
                  <dd>
                    <Kbd>{shortcutKeys(id)}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-5 text-xs text-text-muted">
        Formatting shortcuts work the same in Markdown and Rich text modes. Every command is also in the command palette ({shortcutKeys('commandPalette')}).
        In the Markdown editor, Tab indents; press Esc, then Tab, to move focus out.
      </p>
    </Modal>
  );
}
