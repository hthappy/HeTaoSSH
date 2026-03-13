import { useRef, useState, useCallback, useEffect } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, Loader2, Download, Trash2, Copy, RefreshCcw, Eye, EyeOff } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save, open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import type { SftpEntry } from '@/types/sftp';
import { cn } from '@/lib/utils';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '@/components/ContextMenu';
import { useToast } from '@/components/Toast';

// Helper to get file icon color based on extension
const getFileIconColor = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext || ext === filename) return 'text-term-fg/60';
  
  switch (ext) {
    case 'rs': return 'text-orange-500';
    case 'js': case 'jsx': return 'text-yellow-400';
    case 'ts': case 'tsx': return 'text-blue-400';
    case 'css': case 'scss': case 'less': return 'text-blue-300';
    case 'html': return 'text-orange-600';
    case 'json': case 'yaml': case 'yml': return 'text-green-500';
    case 'md': case 'txt': return 'text-purple-400';
    case 'py': return 'text-yellow-500';
    case 'go': return 'text-cyan-500';
    case 'java': case 'jar': return 'text-red-500';
    case 'c': case 'cpp': case 'h': return 'text-blue-600';
    case 'sh': case 'bash': return 'text-green-400';
    case 'lock': return 'text-gray-500';
    default: return 'text-term-fg/60';
  }
};

interface FileTreeProps {
  tabId: string;
  onFileSelect?: (path: string) => void;
}

interface FileTreeNodeProps {
  entry: SftpEntry;
  path: string;
  depth: number;
  tabId: string;
  showHidden: boolean;
  onFileSelect?: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: SftpEntry, path: string) => void;
}

function FileTreeNode({ entry, path, depth, tabId, showHidden, onFileSelect, onContextMenu }: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [children, setChildren] = useState<SftpEntry[] | null>(null);

  // Listen for terminal enter key events to refresh children if expanded
  useEffect(() => {
    if (!isExpanded || !entry.is_dir) return;

    const handleTerminalEnter = (e: Event) => {
      const customEvent = e as CustomEvent<{ tabId: string }>;
      if (customEvent.detail?.tabId === tabId) {
        // Refresh children silently (no loading state to avoid flicker)
        invoke<SftpEntry[]>('sftp_list_dir', { tabId, path })
          .then(setChildren)
          .catch(console.error);
      }
    };

    window.addEventListener('ssh-terminal-enter', handleTerminalEnter);
    return () => {
      window.removeEventListener('ssh-terminal-enter', handleTerminalEnter);
    };
  }, [tabId, path, isExpanded, entry.is_dir]);

  const handleToggle = async () => {
    if (entry.is_dir) {
      if (!isExpanded && !children) {
        setIsLoading(true);
        try {
          const entries = await invoke<SftpEntry[]>('sftp_list_dir', { tabId, path });
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
          'flex items-center gap-1 py-1 px-2 hover:bg-term-selection cursor-pointer rounded',
          !entry.is_dir && 'cursor-pointer hover:bg-term-blue/20'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleToggle}
        onContextMenu={(e) => onContextMenu(e, entry, path)}
      >
        {entry.is_dir ? (
          <>
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-term-fg/40 animate-spin flex-shrink-0" />
            ) : isExpanded ? (
              <ChevronDown className="w-4 h-4 text-term-fg/40 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-term-fg/40 flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-term-blue flex-shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-term-blue flex-shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-4 flex-shrink-0" />
            <File className={cn("w-4 h-4 flex-shrink-0", getFileIconColor(entry.filename))} />
          </>
        )}
        <span className="text-sm text-term-fg truncate">{entry.filename}</span>
        {entry.is_file && entry.size > 0 && (
          <span className="text-xs text-term-fg/40 ml-auto">
            {formatSize(entry.size)}
          </span>
        )}
      </div>
      {isExpanded && children && (
        <div>
          {children
            .filter(child => showHidden || !child.filename.startsWith('.'))
            .map((child, index) => (
            <FileTreeNode
              key={`${path}/${child.filename}-${index}`}
              entry={child}
              path={`${path}/${child.filename}`}
              depth={depth + 1}
              tabId={tabId}
              showHidden={showHidden}
              onFileSelect={onFileSelect}
              onContextMenu={onContextMenu}
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

export function FileTree({ tabId, onFileSelect }: FileTreeProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [entries, setEntries] = useState<SftpEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [pathInput, setPathInput] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizePath = useCallback((p: string) => {
    let s = p.trim();
    if (!s) return '/';
    if (!s.startsWith('/')) s = `/${s}`;
    s = s.replace(/\/{2,}/g, '/');
    if (s.length > 1 && s.endsWith('/')) s = s.replace(/\/+$/g, '/');
    return s;
  }, []);

  const loadDir = useCallback(async (dirPath: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<SftpEntry[]>('sftp_list_dir', { tabId, path: normalizePath(dirPath) });
      setEntries(result);
      const normalized = normalizePath(dirPath);
      setCurrentPath(normalized);
      setPathInput('');
    } catch (err) {
      setError(t('file_tree.load_error', { error: `${err}` }));
    } finally {
      setIsLoading(false);
    }
  }, [tabId, normalizePath, t]);

  // 自动加载用户主目录
  useEffect(() => {
    const init = async () => {
      try {
        const home = await invoke<string>('sftp_get_home_dir', { tabId });
        loadDir(home || '/');
      } catch (error) {
        console.warn('Failed to get home dir, falling back to root:', error);
        loadDir('/');
      }
    };
    init();
  }, [tabId, loadDir]);

  // Listen for terminal enter key events to refresh file list
  useEffect(() => {
    const handleTerminalEnter = (e: Event) => {
      const customEvent = e as CustomEvent<{ tabId: string }>;
      if (customEvent.detail?.tabId === tabId) {
        // Refresh current directory to reflect potential changes (rm, touch, mkdir, etc.)
        loadDir(currentPath);
      }
    };

    window.addEventListener('ssh-terminal-enter', handleTerminalEnter);
    return () => {
      window.removeEventListener('ssh-terminal-enter', handleTerminalEnter);
    };
  }, [tabId, currentPath, loadDir]);

  // Autocomplete state
  const [acOpen, setAcOpen] = useState(false);
  const [acLoading, setAcLoading] = useState(false);
  const [acItems, setAcItems] = useState<SftpEntry[]>([]);
  const [acActiveIndex, setAcActiveIndex] = useState(0);
  const acRequestSeq = useRef(0);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path?: string;
    entry?: SftpEntry;
  } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: SftpEntry, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path,
      entry
    });
  }, []);

  const handleCopyPath = async () => {
    if (!contextMenu?.path) return;
    try {
      await navigator.clipboard.writeText(contextMenu.path);
      showToast(t('common.copied_to_clipboard', 'Copied to clipboard'), 'success');
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
    setContextMenu(null);
  };

  const handleDownload = async () => {
    if (!contextMenu || !contextMenu.entry || !contextMenu.path) return;

    if (contextMenu.entry.is_dir) {
      try {
        const dirName = contextMenu.entry.filename;
        const selected = await open({
          directory: true,
          multiple: false,
          title: t('file.select_download_folder', 'Select download destination'),
        });

        if (selected) {
          const destDir = Array.isArray(selected) ? selected[0] : selected;
          if (!destDir) return;

          // Simple path join (backend handles normalization usually, but we need to append dir name)
          // We try to detect separator from destDir
          const separator = destDir.includes('\\') ? '\\' : '/';
          // Avoid double separator
          const cleanDest = destDir.endsWith(separator) ? destDir.slice(0, -1) : destDir;
          const localPath = `${cleanDest}${separator}${dirName}`;

          showToast(t('file.download_started', 'Download started...'), 'info');
          setContextMenu(null);

          await invoke('sftp_download_dir', {
            tabId,
            remotePath: contextMenu.path,
            localPath,
          });
          showToast(t('file.download_success', 'Directory downloaded successfully'), 'success');
        }
      } catch (error) {
        console.error('Failed to download directory:', error);
        showToast(t('file.download_failed', 'Failed to download directory'), 'error');
      }
      return;
    }
    
    try {
      const fileName = contextMenu.entry.filename;
      
      // Use save dialog to let user choose filename and location
      const localPath = await save({
        defaultPath: fileName,
        title: t('file.download_save_as', 'Save file as'),
      });
      
      if (localPath) {
        showToast(t('file.download_started', 'Download started...'), 'info');
        setContextMenu(null);
        await invoke('sftp_download_file', {
          tabId,
          remotePath: contextMenu.path,
          localPath
        });
        showToast(t('file.download_success', 'File downloaded successfully'), 'success');
      }
    } catch (error: any) {
      const errorMsg = error.toString();
      if (errorMsg.includes('Cannot download a directory')) {
        showToast(t('file.download_dir_error', 'Cannot download a directory (or symlink to one)'), 'error');
        // Expected error for directories, log as info
        console.info('Skipped directory download:', contextMenu.path);
      } else {
        console.error('Failed to download file:', error);
        showToast(t('file.download_failed', 'Failed to download file'), 'error');
      }
    }
    setContextMenu(null);
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    
    try {
      await invoke('sftp_remove_file', { tabId, path: contextMenu.path });
      showToast(t('file.delete_success', 'File deleted successfully'), 'success');
      // Refresh parent directory
      // We need to know parent path.
      // contextMenu.path is full path.
      if (contextMenu.path) {
        const parentPath = contextMenu.path.substring(0, contextMenu.path.lastIndexOf('/')) || '/';
        loadDir(parentPath);
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      showToast(t('file.delete_failed', 'Failed to delete file'), 'error');
    }
    setContextMenu(null);
  };

  const getParentAndPrefix = useCallback((raw: string) => {
    const s = normalizePath(raw);
    if (s === '/') return { parent: '/', prefix: '', normalized: s, endsWithSlash: true };
    const endsWithSlash = s.endsWith('/');
    const withoutTrailing = endsWithSlash ? s.slice(0, -1) : s;
    const lastSlash = withoutTrailing.lastIndexOf('/');
    const parent = endsWithSlash ? withoutTrailing : (lastSlash <= 0 ? '/' : withoutTrailing.slice(0, lastSlash));
    const prefix = endsWithSlash ? '' : withoutTrailing.slice(lastSlash + 1);
    return { parent, prefix, normalized: s, endsWithSlash };
  }, [normalizePath]);

  const fetchSuggestions = useCallback(async (raw: string) => {
    const { parent, prefix } = getParentAndPrefix(raw);
    const seq = ++acRequestSeq.current;
    setAcLoading(true);
    try {
      const list = await invoke<SftpEntry[]>('sftp_list_dir', { tabId, path: parent });
      if (seq !== acRequestSeq.current) return;
      const filtered = list
        .filter((e) => (prefix ? e.filename.toLowerCase().startsWith(prefix.toLowerCase()) : true))
        .sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.filename.localeCompare(b.filename));
      setAcItems(filtered.slice(0, 50));
      setAcActiveIndex(0);
      setAcOpen(true);
    } catch {
      if (seq !== acRequestSeq.current) return;
      setAcItems([]);
      setAcOpen(false);
    } finally {
      if (seq === acRequestSeq.current) setAcLoading(false);
    }
  }, [getParentAndPrefix, tabId]);

  useEffect(() => {
    if (!tabId) return;
    const raw = pathInput;
    if (!raw.trim()) {
      setAcOpen(false);
      setAcItems([]);
      return;
    }
    const t = window.setTimeout(() => {
      fetchSuggestions(raw);
    }, 150);
    return () => window.clearTimeout(t);
  }, [fetchSuggestions, pathInput, tabId]);

  const applySuggestion = useCallback((index: number, opts: { loadOnAccept: boolean }) => {
    const item = acItems[index];
    if (!item) return;
    const { parent } = getParentAndPrefix(pathInput);
    const full = parent === '/' ? `/${item.filename}` : `${parent}/${item.filename}`;
    const next = item.is_dir ? `${full}/` : full;
    setPathInput(next);
    setAcOpen(false);
    if (opts.loadOnAccept && item.is_dir) {
      loadDir(full);
    }
  }, [acItems, getParentAndPrefix, loadDir, pathInput]);

  const handlePathKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && acOpen && acItems.length > 0) {
      e.preventDefault();
      setAcActiveIndex((i) => Math.min(i + 1, acItems.length - 1));
      return;
    }
    if (e.key === 'ArrowUp' && acOpen && acItems.length > 0) {
      e.preventDefault();
      setAcActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Escape' && acOpen) {
      e.preventDefault();
      setAcOpen(false);
      return;
    }
    if (e.key === 'Tab' && acOpen && acItems.length > 0) {
      e.preventDefault();
      applySuggestion(acActiveIndex, { loadOnAccept: false });
      return;
    }
    if (e.key === 'Enter') {
      const hasSuggestions = acOpen && acItems.length > 0;
      if (hasSuggestions) {
        e.preventDefault();
        applySuggestion(acActiveIndex, { loadOnAccept: true });
        return;
      }
      const target = pathInput.trim();
      if (target) loadDir(target);
    }
  }, [acOpen, acItems, acActiveIndex, applySuggestion, loadDir, pathInput]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!tabId) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      // @ts-ignore
      const localPath = file.path;
      
      if (!localPath) {
        showToast(t('file.upload_failed_no_path'), 'error');
        continue;
      }

      const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      
      try {
        showToast(t('file.uploading', { name: file.name }), 'info');
        await invoke('sftp_upload_file', {
          tabId,
          localPath,
          remotePath
        });
        showToast(t('file.upload_success', { name: file.name }), 'success');
      } catch (error) {
        console.error('Upload failed:', error);
        showToast(t('file.upload_failed', { name: file.name, error: `${error}` }), 'error');
      }
    }
    
    loadDir(currentPath);
  }, [tabId, currentPath, t, showToast, loadDir]);

  // Listen for Tauri global drag-drop event (fallback for missing file paths)
  useEffect(() => {
    if (!tabId) return;

    const unlisten = listen('tauri://drag-drop', (event) => {
      const payload = event.payload as { paths: string[]; position: { x: number; y: number } };
      
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      // Adjust for device pixel ratio (OS scaling)
      const scale = window.devicePixelRatio || 1;
      const x = payload.position.x / scale;
      const y = payload.position.y / scale;
      
      // Check if drop is within this component
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        // Handle files
        const files = payload.paths;
        if (!files || files.length === 0) return;

        files.forEach(async (localPath) => {
          // Normalize path separators to forward slash for consistency if needed, 
          // but backend handles local path as is usually.
          // Extract filename safely
          const fileName = localPath.split(/[\\/]/).pop() || 'unknown';
          const remotePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
          
          try {
            showToast(t('file.uploading', { name: fileName }), 'info');
            await invoke('sftp_upload_file', {
              tabId,
              localPath,
              remotePath
            });
            showToast(t('file.upload_success', { name: fileName }), 'success');
          } catch (error) {
            console.error('Upload failed:', error);
            showToast(t('file.upload_failed', { name: fileName, error: `${error}` }), 'error');
          }
        });
        
        // Refresh directory after short delay
        setTimeout(() => loadDir(currentPath), 1000);
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [tabId, currentPath, t, showToast, loadDir]);

  return (
    <div 
      ref={containerRef}
      className="h-full w-full flex flex-col overflow-hidden"
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({
          x: e.clientX,
          y: e.clientY
        });
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          {contextMenu.entry && contextMenu.path ? (
            <div className="flex flex-col gap-0.5 p-1">
              <ContextMenuItem 
                label={t('file.copy_path', 'Copy Path')} 
                icon={<Copy className="w-4 h-4" />}
                onClick={handleCopyPath}
              />
              <ContextMenuSeparator />
              <ContextMenuItem 
                label={t('file.download', 'Download')} 
                icon={<Download className="w-4 h-4" />}
                onClick={() => {
                  handleDownload();
                  setContextMenu(null);
                }}
              />
              <ContextMenuItem 
                label={t('file.delete', 'Delete')} 
                icon={<Trash2 className="w-4 h-4" />}
                danger
                onClick={handleDelete}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 p-1">
              <ContextMenuItem 
                label={t('file.refresh')} 
                icon={<RefreshCcw className="w-4 h-4" />}
                onClick={() => {
                  loadDir(currentPath);
                  setContextMenu(null);
                }}
              />
              <ContextMenuItem 
                label={showHidden ? t('file.hide_hidden') : t('file.show_hidden')} 
                icon={showHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                onClick={() => {
                  setShowHidden(!showHidden);
                  setContextMenu(null);
                }}
              />
            </div>
          )}
        </ContextMenu>
      )}

      {/* 路径导航输入框 */}
      <div className="px-2 py-1.5 border-b border-term-selection flex-shrink-0 relative flex items-center gap-2">
        <input
          type="text"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={handlePathKeyDown}
          onFocus={() => acItems.length > 0 && setAcOpen(true)}
          onBlur={() => window.setTimeout(() => setAcOpen(false), 120)}
          placeholder={t('file_tree.path_placeholder')}
          className="flex-1 bg-term-selection/50 text-term-fg text-xs px-2 py-1 rounded border border-term-selection focus:border-term-blue focus:outline-none placeholder-term-fg/40"
        />
        <button
          onClick={() => loadDir(currentPath)}
          className="p-1 hover:bg-term-selection rounded text-term-fg/60 hover:text-term-fg transition-colors flex-shrink-0"
          title={t('file.refresh', 'Refresh')}
        >
          <RefreshCcw className="w-3.5 h-3.5" />
        </button>
        {acOpen && (acLoading || acItems.length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-term-bg border border-term-selection rounded shadow-xl max-h-60 overflow-auto z-10">
            {acItems.map((item, index) => (
              <div
                key={`${item.filename}-${index}`}
                className={`px-2 py-1 text-sm cursor-pointer flex items-center gap-2 ${
                  index === acActiveIndex ? 'bg-term-blue text-term-bg' : 'text-term-fg/80 hover:bg-term-selection'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(index, { loadOnAccept: true });
                }}
              >
                {item.is_dir ? (
                  <FolderOpen className={cn("w-4 h-4", index === acActiveIndex ? "text-term-bg" : "text-term-blue")} />
                ) : (
                  <File className={cn("w-4 h-4", index === acActiveIndex ? "text-term-bg/60" : "text-term-fg/40")} />
                )}
                <span className="truncate flex-1">{item.filename}</span>
                {item.is_file && item.size > 0 && (
                  <span className="text-xs opacity-70">{formatSize(item.size)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 面包屑导航 */}
      <div className="px-2 py-1 border-b border-term-selection flex items-center text-xs text-term-fg/60 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button
          onClick={() => loadDir('/')}
          className="hover:text-term-blue hover:bg-term-selection px-1.5 py-0.5 rounded transition-colors flex-shrink-0"
          title={t('file_tree.root')}
        >
          /
        </button>
        {currentPath.split('/').filter(Boolean).map((part, index, arr) => {
          const path = '/' + arr.slice(0, index + 1).join('/');
          return (
            <div key={path} className="flex items-center flex-shrink-0">
              {index > 0 && <span className="text-term-fg/40 mx-0.5">/</span>}
              <button
                onClick={() => loadDir(path)}
                className="hover:text-term-blue hover:bg-term-selection px-1.5 py-0.5 rounded transition-colors"
              >
                {part}
              </button>
            </div>
          );
        })}
      </div>

      {/* 文件列表区域 */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {error ? (
          <div className="p-4 text-term-red text-sm">{error}</div>
        ) : isLoading && !entries ? (
          <div className="p-4 text-term-fg/40 text-sm">{t('file_tree.loading')}</div>
        ) : !entries ? (
          <div className="p-4 text-term-fg/40 text-sm">{t('file_tree.connecting')}</div>
        ) : (
          <div className="py-1">
            {entries
              .filter(entry => showHidden || !entry.filename.startsWith('.'))
              .map((entry, index) => (
              <FileTreeNode
                key={`${entry.filename}-${index}`}
                entry={entry}
                path={currentPath === '/' ? `/${entry.filename}` : `${currentPath}/${entry.filename}`}
                depth={0}
                tabId={tabId}
                showHidden={showHidden}
                onFileSelect={onFileSelect}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
