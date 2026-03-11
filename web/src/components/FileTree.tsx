import { useState } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { SftpEntry } from '@/types/sftp';
import { cn } from '@/lib/utils';

interface FileTreeProps {
  onFileSelect?: (path: string) => void;
}

interface FileTreeNodeProps {
  entry: SftpEntry;
  path: string;
  depth: number;
  onFileSelect?: (path: string) => void;
}

function FileTreeNode({ entry, path, depth, onFileSelect }: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [children, setChildren] = useState<SftpEntry[] | null>(null);

  const handleToggle = async () => {
    if (entry.is_dir) {
      if (!isExpanded && !children) {
        setIsLoading(true);
        try {
          const entries = await invoke<SftpEntry[]>('sftp_list_dir', { path });
          setChildren(entries);
        } catch (error) {
          console.error('Failed to list directory:', error);
        } finally {
          setIsLoading(false);
        }
      }
      setIsExpanded(!isExpanded);
    } else if (onFileSelect) {
      onFileSelect(path);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 hover:bg-zinc-800 cursor-pointer rounded',
          !entry.is_dir && 'cursor-pointer hover:bg-blue-900/30'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleToggle}
      >
        {entry.is_dir ? (
          <>
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-zinc-500 animate-spin flex-shrink-0" />
            ) : isExpanded ? (
              <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-blue-400 flex-shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-4 flex-shrink-0" />
            <File className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          </>
        )}
        <span className="text-sm text-zinc-300 truncate">{entry.filename}</span>
        {entry.is_file && entry.size > 0 && (
          <span className="text-xs text-zinc-500 ml-auto">
            {formatSize(entry.size)}
          </span>
        )}
      </div>
      {isExpanded && children && (
        <div>
          {children.map((child, index) => (
            <FileTreeNode
              key={`${path}/${child.filename}-${index}`}
              entry={child}
              path={`${path}/${child.filename}`}
              depth={depth + 1}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function FileTree({ onFileSelect }: FileTreeProps) {
  const [entries, setEntries] = useState<SftpEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoot = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<SftpEntry[]>('sftp_list_dir', { path: '.' });
      setEntries(result);
    } catch (err) {
      setError(`Failed to load directory: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-900">
      <div className="p-2 border-b border-zinc-800">
        <button
          onClick={loadRoot}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error ? (
        <div className="p-4 text-red-400 text-sm">{error}</div>
      ) : isLoading && !entries ? (
        <div className="p-4 text-zinc-500 text-sm">Loading...</div>
      ) : !entries ? (
        <div className="p-4 text-zinc-500 text-sm">Click Refresh to load files</div>
      ) : (
        <div className="py-2">
          {entries.map((entry, index) => (
            <FileTreeNode
              key={`${entry.filename}-${index}`}
              entry={entry}
              path={entry.filename}
              depth={0}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
