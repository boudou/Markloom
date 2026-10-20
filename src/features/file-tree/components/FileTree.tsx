import { useCallback, useEffect } from 'react';
import { FolderOpen, RefreshCw, AlertCircle } from 'lucide-react';
import { m } from 'framer-motion';
import { IconButton, Tooltip } from '@/components/ui';
import { useFileTreeStore } from '../stores/fileTreeStore';
import { useAppStore } from '@/stores/appStore';
import { useTabsStore } from '@/features/tabs';
import { readDirectory, readFile, isFileSystemSupported, documentName } from '../api/fileSystem';
import { openFolder } from '@/lib/documentActions';
import { useSettingsStore } from '@/stores/settingsStore';
import { notify } from '@/stores/uiStore';
import { TreeNode } from './TreeNode';
import { getFileName } from '@/lib/utils';

export function FileTree() {
  const nodes = useFileTreeStore((s) => s.nodes);
  const isLoading = useFileTreeStore((s) => s.isLoading);
  const setNodes = useFileTreeStore((s) => s.setNodes);
  const setLoading = useFileTreeStore((s) => s.setLoading);
  const rootPath = useAppStore((s) => s.rootPath);
  const openDocument = useTabsStore((s) => s.openDocument);
  const addRecentFile = useSettingsStore((s) => s.addRecentFile);

  const isSupported = isFileSystemSupported();

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const children = await readDirectory(path);
        setNodes(children);
      } catch (error) {
        console.error('Failed to load directory:', error);
      }
      setLoading(false);
    },
    [setNodes, setLoading]
  );

  useEffect(() => {
    if (rootPath) {
      loadDirectory(rootPath);
    }
  }, [rootPath, loadDirectory]);

  const handleRefresh = useCallback(() => {
    if (rootPath) {
      loadDirectory(rootPath);
    }
  }, [rootPath, loadDirectory]);

  const handleFileSelect = useCallback(
    async (path: string) => {
      try {
        const content = await readFile(path);
        openDocument(path, content);
        addRecentFile({ path, name: documentName(path) });
      } catch (error) {
        notify({
          tone: 'error',
          title: `Couldn't open ${documentName(path)}`,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [openDocument, addRecentFile]
  );

  // Show browser compatibility warning
  if (!isSupported) {
    return (
      <div className="h-full flex flex-col bg-panel">
        <div className="flex items-center justify-between px-3 py-2 border-b border-rule/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Explorer
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 text-warning mx-auto mb-3" />
            <p className="text-sm text-text-secondary mb-2">Browser not supported</p>
            <p className="text-xs text-text-muted">
              Please use Chrome, Edge, or another Chromium-based browser for full file system access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-panel">
      {/* Header */}
      <div className="h-8 flex items-center justify-between gap-2 pl-4 pr-1.5 border-b border-rule">
        <h2 className="min-w-0 truncate text-xs font-medium text-text-secondary" title={rootPath ?? undefined}>
          {rootPath ? getFileName(rootPath) : 'Files'}
        </h2>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Tooltip content="Open another folder">
            <IconButton variant="ghost" size="sm" onClick={() => void openFolder()}>
              <FolderOpen className="w-4 h-4" />
            </IconButton>
          </Tooltip>
          {rootPath && (
            <Tooltip content="Refresh">
              <IconButton variant="ghost" size="sm" onClick={handleRefresh}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-auto py-2">
        {!rootPath && nodes.length === 0 ? (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full px-4 text-center"
          >
            <FolderOpen className="w-12 h-12 text-text-muted/50 mb-4" />
            <p className="text-sm text-text-secondary mb-2">No folder open</p>
            <p className="text-xs text-text-muted mb-4">
              Open a folder to browse your markdown files
            </p>
            <button
              onClick={() => void openFolder()}
              className="text-sm text-accent-primary hover:text-accent-hover transition-colors"
            >
              Open folder
            </button>
          </m.div>
        ) : (
          <div className="px-1">
            {nodes.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                onFileSelect={handleFileSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
