import { useState } from 'react';
import { m } from 'framer-motion';
import { Columns2, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStoreBase, type EditorMode } from '@/stores/appStore';

const modes: { value: EditorMode; icon: React.ElementType; label: string; description: string }[] = [
  { value: 'split', icon: Columns2, label: 'Markdown', description: 'Markdown source with live preview' },
  { value: 'wysiwyg', icon: Type, label: 'Rich text', description: 'Edit the formatted document directly' },
];

// Segmented control after interior.dev: a thumb slides to the chosen mode, and the labels
// inside it move the opposite way, so each label changes colour exactly where the thumb passes
const THUMB = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

function Face({ icon: Icon, label, className }: { icon: React.ElementType; label: string; className?: string }) {
  return (
    <span className={cn('flex items-center justify-center gap-1.5 h-7 px-2.5 text-xs font-medium whitespace-nowrap', className)}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

export function ModeToggle() {
  const editorMode = useAppStoreBase((s) => s.editorMode);
  const setEditorMode = useAppStoreBase((s) => s.setEditorMode);
  const [hovered, setHovered] = useState(-1);
  const index = Math.max(0, modes.findIndex((mode) => mode.value === editorMode));

  return (
    <div role="group" aria-label="Editing mode" className="relative grid grid-cols-2 p-0.5 rounded-md bg-wash select-none">
      {modes.map((mode, i) => (
        <Face
          key={mode.value}
          icon={mode.icon}
          label={mode.label}
          className={cn(
            'transition-colors duration-150',
            hovered === i && i !== index ? 'text-text-primary' : 'text-text-secondary'
          )}
        />
      ))}

      <m.div
        aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] overflow-hidden rounded bg-canvas shadow-[0_1px_2px_rgba(26,26,26,0.08)]"
        initial={false}
        animate={{ x: `${index * 100}%` }}
        transition={THUMB}
      >
        <m.div className="absolute inset-0" initial={false} animate={{ x: `${index * -100}%` }} transition={THUMB}>
          <div className="absolute inset-y-0 left-0 grid grid-cols-2 w-[200%]">
            {modes.map((mode) => (
              <Face key={mode.value} icon={mode.icon} label={mode.label} className="text-text-primary" />
            ))}
          </div>
        </m.div>
      </m.div>

      <div className="absolute inset-0.5 grid grid-cols-2" onPointerLeave={() => setHovered(-1)}>
        {modes.map((mode, i) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={i === index}
            aria-label={mode.label}
            title={mode.description}
            onClick={() => setEditorMode(mode.value)}
            onPointerEnter={() => setHovered(i)}
            className="rounded outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          />
        ))}
      </div>
    </div>
  );
}
