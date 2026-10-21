import { useRef, type ReactNode } from 'react';
import { useRovingToolbar } from '@/lib/useRovingToolbar';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  Image,
  Table,
  Minus,
  Plus,
  SquareCode,
  Workflow,
  ChevronDown,
} from 'lucide-react';
import {
  IconButton,
  Tooltip,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
} from '@/components/ui';
import { mermaidTemplates } from '@/features/mermaid-toolbar';
import { cn } from '@/lib/utils';
import { shortcutHint, shortcutKeys, type ShortcutId } from '@/lib/shortcuts';
import { EMPTY_FORMAT_STATE, type EditorCommands, type FormatState, type MarkdownAction } from '../types';

interface EditorToolbarProps {
  commands: EditorCommands | null;
  /** Formats at the cursor, shown as pressed buttons */
  active?: FormatState;
  /** Controls shown at the right end (mode switch, view toggles) */
  trailing?: ReactNode;
  className?: string;
}

interface ToolbarButton {
  action: MarkdownAction;
  icon: React.ElementType;
  label: string;
  shortcut?: ShortcutId;
}

const inlineButtons: ToolbarButton[] = [
  { action: 'bold', icon: Bold, label: 'Bold', shortcut: 'bold' },
  { action: 'italic', icon: Italic, label: 'Italic', shortcut: 'italic' },
  { action: 'strikethrough', icon: Strikethrough, label: 'Strikethrough', shortcut: 'strikethrough' },
  { action: 'code', icon: Code, label: 'Inline code', shortcut: 'inlineCode' },
];

const blockButtons: ToolbarButton[] = [
  { action: 'ul', icon: List, label: 'Bulleted list', shortcut: 'bulletList' },
  { action: 'ol', icon: ListOrdered, label: 'Numbered list', shortcut: 'orderedList' },
  { action: 'checkbox', icon: ListChecks, label: 'Task list', shortcut: 'taskList' },
  { action: 'quote', icon: Quote, label: 'Quote', shortcut: 'blockquote' },
];

const headingItems: ToolbarButton[] = [
  { action: 'paragraph', icon: Pilcrow, label: 'Body text' },
  { action: 'h1', icon: Heading1, label: 'Heading 1', shortcut: 'heading1' },
  { action: 'h2', icon: Heading2, label: 'Heading 2', shortcut: 'heading2' },
  { action: 'h3', icon: Heading3, label: 'Heading 3', shortcut: 'heading3' },
];

function Divider() {
  return <div className="w-px h-4 bg-rule mx-1.5" aria-hidden />;
}

export function EditorToolbar({ commands, active = EMPTY_FORMAT_STATE, trailing, className }: EditorToolbarProps) {
  const disabled = !commands;
  const toolbarRef = useRef<HTMLDivElement>(null);
  useRovingToolbar(toolbarRef);
  const run = (action: MarkdownAction) => commands?.run(action);

  const isActive = (action: MarkdownAction): boolean => {
    switch (action) {
      case 'bold': return active.bold;
      case 'italic': return active.italic;
      case 'strikethrough': return active.strikethrough;
      case 'code': return active.code;
      case 'link': return active.link;
      case 'quote': return active.quote;
      case 'ul':
      case 'ol':
      case 'checkbox': return active.list === action;
      default: return false;
    }
  };

  const styleLabel = active.heading ? `H${active.heading}` : 'Body';

  const renderButton = ({ action, icon: Icon, label, shortcut }: ToolbarButton) => (
    <Tooltip key={action} content={shortcutHint(label, shortcut)}>
      <IconButton variant="ghost" size="sm" disabled={disabled} pressed={isActive(action)} onClick={() => run(action)}>
        <Icon className="w-4 h-4" />
      </IconButton>
    </Tooltip>
  );

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Formatting"
      className={cn(
        'flex items-center gap-0.5 h-10 px-2 flex-shrink-0',
        'border-b border-rule bg-canvas',
        className
      )}
    >
      {inlineButtons.map(renderButton)}
      <Divider />

      <Menu>
        <Tooltip content={`Text style: ${active.heading ? `Heading ${active.heading}` : 'Body text'}`}>
          <MenuTrigger asChild>
            <IconButton variant="ghost" size="sm" disabled={disabled} className="w-auto min-w-[3.25rem] px-1.5 gap-0.5 justify-between">
              <span className="text-xs font-medium tabular-nums">{styleLabel}</span>
              <ChevronDown className="w-3 h-3 text-text-muted" />
            </IconButton>
          </MenuTrigger>
        </Tooltip>
        <MenuContent>
          {headingItems.map(({ action, icon: Icon, label, shortcut }) => (
            <MenuItem
              key={action}
              icon={<Icon />}
              hint={shortcut ? shortcutKeys(shortcut) : undefined}
              onSelect={() => run(action)}
            >
              {label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      <Divider />
      {blockButtons.map(renderButton)}
      <Divider />

      {renderButton({ action: 'link', icon: Link, label: 'Link', shortcut: 'link' })}

      <Menu>
        <Tooltip content="Insert">
          <MenuTrigger asChild>
            <IconButton variant="ghost" size="sm" disabled={disabled} className="w-auto px-1.5 gap-0.5">
              <Plus className="w-4 h-4" />
              <ChevronDown className="w-3 h-3 text-text-muted" />
            </IconButton>
          </MenuTrigger>
        </Tooltip>
        <MenuContent className="w-56">
          <MenuItem icon={<Image />} onSelect={() => run('image')}>
            Image
          </MenuItem>
          <MenuItem icon={<Table />} onSelect={() => run('table')}>
            Table
          </MenuItem>
          <MenuItem icon={<SquareCode />} hint={shortcutKeys('codeBlock')} onSelect={() => run('codeblock')}>
            Code block
          </MenuItem>
          <MenuItem icon={<Minus />} onSelect={() => run('hr')}>
            Divider
          </MenuItem>
          <MenuSeparator />
          <MenuSub>
            <MenuSubTrigger icon={<Workflow />}>Diagram</MenuSubTrigger>
            <MenuSubContent className="w-64">
              {mermaidTemplates.map((template) => (
                <MenuItem
                  key={template.id}
                  description={template.description}
                  onSelect={() => commands?.insert(template.template)}
                >
                  {template.name}
                </MenuItem>
              ))}
            </MenuSubContent>
          </MenuSub>
        </MenuContent>
      </Menu>

      <div className="flex-1" />
      {trailing}
    </div>
  );
}
