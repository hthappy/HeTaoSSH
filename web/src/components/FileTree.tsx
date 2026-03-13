import { useRef, useState, useCallback, useEffect } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import type { SftpEntry } from '@/types/sftp';
import { cn } from '@/lib/utils';

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
  onFileSelect?: (path: string) => void;
}

function FileTreeNode({ entry, path, depth, tabId, onFileSelect }: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [children, setChildren] = useState<SftpEntry[] | null>(null);

  const handleToggle = async () => {
    if (entry.is_dir) {
      if (!isExpanded && !children) {
        setIsLoading(true);
        try {
          const entries = await invoke<SftpEntry[]>('sftp_list_dir', { tabId, path });
          setChildren(entries.filter(e => !e.filename.startsWith('.')));
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
          {children.map((child, index) => (
            <FileTreeNode
              key={`${path}/${child.filename}-${index}`}
              entry={child}
              path={`${path}/${child.filename}`}
              depth={depth + 1}
              tabId={tabId}
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

export function FileTree({ tabId, onFileSelect }: FileTreeProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SftpEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [pathInput, setPathInput] = useState('');

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
      setEntries(result.filter(e => !e.filename.startsWith('.')));
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

  // Autocomplete state
  const [acOpen, setAcOpen] = useState(false);
  const [acLoading, setAcLoading] = useState(false);
  const [acItems, setAcItems] = useState<SftpEntry[]>([]);
  const [acActiveIndex, setAcActiveIndex] = useState(0);
  const acRequestSeq = useRef(0);

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

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* 路径导航输入框 */}
      <div className="px-2 py-1.5 border-b border-term-selection flex-shrink-0 relative">
        <input
          type="text"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={handlePathKeyDown}
          onFocus={() => acItems.length > 0 && setAcOpen(true)}
          onBlur={() => window.setTimeout(() => setAcOpen(false), 120)}
          placeholder={t('file_tree.path_placeholder')}
          className="w-full bg-term-selection/50 text-term-fg text-xs px-2 py-1 rounded border border-term-selection focus:border-term-blue focus:outline-none placeholder-term-fg/40"
        />
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
            {entries.map((entry, index) => (
              <FileTreeNode
                key={`${entry.filename}-${index}`}
                entry={entry}
                path={currentPath === '/' ? `/${entry.filename}` : `${currentPath}/${entry.filename}`}
                depth={0}
                tabId={tabId}
                onFileSelect={onFileSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
