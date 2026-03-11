import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { SftpEntry } from '@/types/sftp';
import { cn } from '@/lib/utils';

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
  const [entries, setEntries] = useState<SftpEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [pathInput, setPathInput] = useState('/');

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [acOpen, setAcOpen] = useState(false);
  const [acLoading, setAcLoading] = useState(false);
  const [acItems, setAcItems] = useState<SftpEntry[]>([]);
  const [acActiveIndex, setAcActiveIndex] = useState(0);
  const acRequestSeq = useRef(0);

  const normalizePath = useCallback((p: string) => {
    let s = p.trim();
    if (!s) return '/';
    if (!s.startsWith('/')) s = `/${s}`;
    s = s.replace(/\/{2,}/g, '/');
    if (s.length > 1 && s.endsWith('/')) s = s.replace(/\/+$/g, '/');
    return s;
  }, []);

  const getParentAndPrefix = useCallback((raw: string) => {
    const s = normalizePath(raw);
    if (s === '/') return { parent: '/', prefix: '', normalized: s, endsWithSlash: true };
    const endsWithSlash = s.endsWith('/');
    const withoutTrailing = endsWithSlash ? s.slice(0, -1) : s;
    const lastSlash = withoutTrailing.lastIndexOf('/');
    // 如果以 / 结尾，表示用户已经明确进入该目录：应列出该目录下的内容
    const parent = endsWithSlash ? withoutTrailing : (lastSlash <= 0 ? '/' : withoutTrailing.slice(0, lastSlash));
    const prefix = endsWithSlash ? '' : withoutTrailing.slice(lastSlash + 1);
    return { parent, prefix, normalized: s, endsWithSlash };
  }, [normalizePath]);

  const loadDir = useCallback(async (dirPath: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<SftpEntry[]>('sftp_list_dir', { tabId, path: normalizePath(dirPath) });
      setEntries(result);
      const normalized = normalizePath(dirPath);
      setCurrentPath(normalized);
      setPathInput(normalized);
    } catch (err) {
      setError(`加载目录失败: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [tabId, normalizePath]);

  // 连接后自动加载根目录
  useEffect(() => {
    if (tabId) {
      loadDir('/');
    }
  }, [tabId, loadDir]);

  // 路径输入框回车跳转
  const handlePathKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
  };

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
    // 文件：这里只做补全，不自动打开（避免误触）
  }, [acItems, getParentAndPrefix, loadDir, pathInput]);

  const acHint = useMemo(() => {
    const { parent, prefix } = getParentAndPrefix(pathInput);
    return { parent, prefix };
  }, [getParentAndPrefix, pathInput]);

  // 输入变化时，debounce 请求补全
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

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* 路径导航输入框 */}
      <div className="px-2 py-1.5 border-b border-zinc-800 flex-shrink-0 relative">
        <input
          type="text"
          value={pathInput}
          ref={inputRef}
          onChange={(e) => {
            setPathInput(e.target.value);
          }}
          onKeyDown={handlePathKeyDown}
          onFocus={() => {
            if (acItems.length > 0) setAcOpen(true);
          }}
          onBlur={() => {
            // 给点击补全项留时间
            window.setTimeout(() => setAcOpen(false), 120);
          }}
          placeholder="输入路径，如 /var/log"
          className="w-full bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-700 focus:border-blue-500 focus:outline-none placeholder-zinc-500"
        />
        {acOpen && (acLoading || acItems.length > 0) && (
          <div className="absolute left-2 right-2 top-[calc(100%+4px)] z-20 rounded-md border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
            <div className="px-2 py-1 text-[10px] text-zinc-500 border-b border-zinc-800 flex items-center justify-between">
              <span className="truncate">
                {acHint.parent} {acHint.prefix ? `· 前缀: ${acHint.prefix}` : ''}
              </span>
              <span className="flex-shrink-0">{acLoading ? '加载中…' : 'Tab 补全 / Enter 跳转'}</span>
            </div>
            <div className="max-h-56 overflow-auto no-scrollbar">
              {acItems.length === 0 ? (
                <div className="px-2 py-2 text-xs text-zinc-500">无匹配项</div>
              ) : (
                acItems.slice(0, 12).map((item, idx) => (
                  <button
                    key={`${item.filename}-${idx}`}
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs',
                      'hover:bg-zinc-800',
                      idx === acActiveIndex && 'bg-blue-900/30'
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(idx, { loadOnAccept: true })}
                  >
                    {item.is_dir ? (
                      <Folder className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    ) : (
                      <File className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    )}
                    <span className="text-zinc-200 truncate">{item.filename}{item.is_dir ? '/' : ''}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 文件列表区域 */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {error ? (
          <div className="p-4 text-red-400 text-sm">{error}</div>
        ) : isLoading && !entries ? (
          <div className="p-4 text-zinc-500 text-sm">加载中...</div>
        ) : !entries ? (
          <div className="p-4 text-zinc-500 text-sm">正在连接...</div>
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
