import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { GitBranch, ChevronDown } from 'lucide-react';
import { IconButton, Tooltip } from '@/components/ui';
import { cn } from '@/lib/utils';
import { mermaidTemplates, type MermaidTemplate } from '../utils';

interface MermaidTemplateMenuProps {
  onInsert: (template: string) => void;
}

export function MermaidTemplateMenu({ onInsert }: MermaidTemplateMenuProps) {
  const handleSelect = (template: MermaidTemplate) => {
    onInsert(template.template);
  };

  return (
    <DropdownMenu.Root>
      <Tooltip content="Insert Mermaid Diagram">
        <DropdownMenu.Trigger asChild>
          <IconButton variant="ghost" size="sm" className="gap-0.5">
            <GitBranch className="w-4 h-4" />
            <ChevronDown className="w-3 h-3" />
          </IconButton>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            'min-w-[220px] p-1 rounded-lg',
            'bg-wash border border-rule',
            'shadow-xl',
            'animate-fade-in'
          )}
          sideOffset={4}
          align="start"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-text-muted">
            Insert Diagram
          </DropdownMenu.Label>

          {mermaidTemplates.map((template) => (
            <DropdownMenu.Item
              key={template.id}
              className={cn(
                'flex flex-col px-2 py-2 rounded-md cursor-pointer',
                'outline-none',
                'data-[highlighted]:bg-rule'
              )}
              onSelect={() => handleSelect(template)}
            >
              <span className="text-sm text-text-primary font-medium">
                {template.name}
              </span>
              <span className="text-xs text-text-muted">
                {template.description}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
