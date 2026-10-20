import { useState, useCallback } from 'react';
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

export function TreeNode({ node, depth, onFileSelect }: TreeNodeProps) {
  const { expandedPaths, selectedPath, toggleExpanded, setSelected, updateNode } =
    useFileTreeStore();
  const [isLoading, setIsLoading] = useState(false);

  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleClick = useCallback(async () => {
    if (node.isDirectory) {
      // Always toggle first
      toggleExpanded(node.path);

      // Load children if not loaded yet and we're expanding
      const willBeExpanded = !isExpanded;
      if (willBeExpanded && (!node.children || node.children.length === 0)) {
        setIsLoading(true);
        try {
          const children = await readDirectory(node.path);
          updateNode(node.path, { children });
        } catch (error) {
          console.error('Failed to load directory:', error);
        }
        setIsLoading(false);
      }
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

      {/* Empty folder message */}
      <AnimatePresence>
        {node.isDirectory && isExpanded && node.children && node.children.length === 0 && !isLoading && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div
              className="text-xs text-text-muted italic py-1"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8 + 20}px` }}
            >
              Empty folder
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
