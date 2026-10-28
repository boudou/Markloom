import {
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  FileCode,
  File,
  FileJson,
  GitBranch,
} from 'lucide-react';
import { getFileExtension } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface FileIconProps {
  name: string;
  isDirectory: boolean;
  isExpanded?: boolean;
  className?: string;
}

export function FileIcon({ name, isDirectory, isExpanded, className }: FileIconProps) {
  const ext = getFileExtension(name);
  const iconClass = cn('w-4 h-4 shrink-0', className);

  if (isDirectory) {
    return isExpanded ? (
      <FolderOpen className={cn(iconClass, 'text-accent-primary')} />
    ) : (
      <Folder className={cn(iconClass, 'text-accent-primary/70')} />
    );
  }

  switch (ext) {
    case 'md':
    case 'markdown':
    case 'mdx':
      return <FileText className={cn(iconClass, 'text-accent-primary')} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return <FileImage className={cn(iconClass, 'text-success')} />;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'css':
    case 'html':
      return <FileCode className={cn(iconClass, 'text-warning')} />;
    case 'json':
      return <FileJson className={cn(iconClass, 'text-warning/70')} />;
    case 'mmd':
      return <GitBranch className={cn(iconClass, 'text-accent-secondary')} />;
    default:
      return <File className={cn(iconClass, 'text-text-muted')} />;
  }
}
