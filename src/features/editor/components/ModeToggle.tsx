import { Columns2, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStoreBase, type EditorMode } from '@/stores/appStore';

const modes: { value: EditorMode; icon: React.ElementType; label: string; description: string }[] = [
  { value: 'split', icon: Columns2, label: 'Markdown', description: 'Markdown source with live preview' },
  { value: 'wysiwyg', icon: Type, label: 'Rich text', description: 'Edit the formatted document directly' },
];

export function ModeToggle() {
  const editorMode = useAppStoreBase((s) => s.editorMode);
  const setEditorMode = useAppStoreBase((s) => s.setEditorMode);

  return (
    <div role="group" aria-label="Editing mode" className="flex items-center p-0.5 rounded-md bg-wash">
      {modes.map(({ value, icon: Icon, label, description }) => {
        const active = editorMode === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            title={description}
            onClick={() => setEditorMode(value)}
            className={cn(
              'flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium',
              'transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
              active
                ? 'bg-canvas text-text-primary shadow-[0_1px_2px_rgba(26,26,26,0.08)]'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
