export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  /** Directories: undefined until loaded, [] when loaded and empty. Files: always undefined. */
  children?: FileNode[];
  /** Why the last read of this directory failed; cleared to retry */
  loadError?: string;
  isExpanded?: boolean;
}

export interface FileTreeState {
  nodes: FileNode[];
  expandedPaths: Set<string>;
  selectedPath: string | null;
}
