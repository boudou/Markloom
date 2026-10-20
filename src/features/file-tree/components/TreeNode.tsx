import { memo, useCallback, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { cn, isMarkdownFile, isMermaidFile } from '@/lib/utils';
import { FileIcon } from './FileIcon';
import { useFileTreeStore } from '../stores/fileTreeStore';
import { readDirectory } from '../api/fileSystem';
import type { FileNode } from '../types';

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
}

// Memoized with narrow selections: expanding one folder or selecting one file re-renders only the nodes it changes
export const TreeNode = memo(function TreeNode({ node, depth, onFileSelect }: TreeNodeProps) {
  const isExpanded = useFileTreeStore((s) => s.expandedPaths.has(node.path));
  const isSelected = useFileTreeStore((s) => s.selectedPath === node.path);
  const toggleExpanded = useFileTreeStore((s) => s.toggleExpanded);
  const setSelected = useFileTreeStore((s) => s.setSelected);
  const updateNode = useFileTreeStore((s) => s.updateNode);

  // An expanded folder that isn't loaded (and hasn't failed) is loading: the read ends by setting children or loadError
  const isLoading = node.isDirectory && isExpanded && node.children === undefined && node.loadError === undefined;

  // Loads on the click that expands a folder, after Refresh replaces the nodes, and for expanded folders
  // nested inside it once it renders them
  useEffect(() => {
    if (!isLoading) return;

    // Dropped after cleanup: collapse or Refresh while loading, or the StrictMode double mount
    let cancelled = false;
    readDirectory(node.path).then(
      (children) => {
        if (!cancelled) updateNode(node.path, { children });
      },
      (error) => {
        if (!cancelled) updateNode(node.path, { loadError: error instanceof Error ? error.message : String(error) });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [isLoading, node.path, updateNode]);

  const handleClick = useCallback(() => {
    if (node.isDirectory) {
      // Expanding a folder that failed to read clears the error, so the effect tries again
      if (!isExpanded && node.loadError !== undefined) {
        updateNode(node.path, { loadError: undefined });
      }

      toggleExpanded(node.path);
    } else {
      setSelected(node.path);
      if (isMarkdownFile(node.name) || isMermaidFile(node.name)) {
        onFileSelect(node.path);
      }
    }
  }, [node, isExpanded, toggleExpanded, setSelected, updateNode, onFileSelect]);

  const handleDoubleClick = useCallback(() => {
    if (!node.isDirectory) {
      onFileSelect(node.path);
    }
  }, [node, onFileSelect]);

  return (
    <div>
      <button
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={cn(
          'w-full flex items-center gap-1.5 py-1 px-2 text-left text-sm',
          'rounded-md transition-colors duration-150',
          'hover:bg-wash/70',
          isSelected && 'bg-accent-primary/20 text-text-primary',
          !isSelected && 'text-text-secondary'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {/* Expand/collapse chevron for directories */}
        {node.isDirectory ? (
          <m.div
            initial={false}
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="w-4 h-4 flex items-center justify-center"
          >
            <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          </m.div>
        ) : (
          <div className="w-4" />
        )}

        {/* File/folder icon */}
        <FileIcon
          name={node.name}
          isDirectory={node.isDirectory}
          isExpanded={isExpanded}
        />

        {/* File/folder name */}
        <span className="truncate flex-1">{node.name}</span>

        {/* Loading indicator */}
        {isLoading && (
          <div className="w-3 h-3 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
        )}
      </button>

      {/* Children */}
      <AnimatePresence>
        {node.isDirectory && isExpanded && node.children && node.children.length > 0 && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
              />
            ))}
          </m.div>
        )}
      </AnimatePresence>

      {/* Empty folder or read failure */}
      <AnimatePresence>
        {node.isDirectory && isExpanded && node.children && node.children.length === 0 && (
          <FolderNote key="empty" depth={depth} className="text-text-muted italic">
            Empty folder
          </FolderNote>
        )}
        {node.isDirectory && isExpanded && node.loadError !== undefined && (
          <FolderNote key="error" depth={depth} className="text-error" title={node.loadError}>
            Couldn't read this folder
          </FolderNote>
        )}
      </AnimatePresence>
    </div>
  );
});

interface FolderNoteProps {
  depth: number;
  className: string;
  title?: string;
  children: string;
}

/** A one-line note inside an expanded folder, indented like its entries */
function FolderNote({ depth, className, title, children }: FolderNoteProps) {
  return (
    <m.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div
        className={cn('text-xs py-1', className)}
        style={{ paddingLeft: `${(depth + 1) * 12 + 8 + 20}px` }}
        title={title}
      >
        {children}
      </div>
    </m.div>
  );
}
