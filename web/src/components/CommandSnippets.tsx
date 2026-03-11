import { useCallback, useMemo, useState, useEffect } from 'react';
import { Copy, Play, FolderOpen, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

interface CommandSnippet {
  id?: number;
  name: string;
  command: string;
  description?: string;
  category?: string;
}

interface CommandSnippetsProps {
  onExecute?: (command: string) => void;
}

export function CommandSnippets({ onExecute }: CommandSnippetsProps) {
  const [snippets, setSnippets] = useState<CommandSnippet[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CommandSnippet | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  const loadSnippets = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await invoke<CommandSnippet[]>('list_snippets');
      setSnippets(data);
      const cats = [...new Set(data.map(s => s.category).filter(Boolean))] as string[];
      setCategories(cats);
    } catch (error) {
      console.error('Failed to load snippets:', error);
      showToast(`加载 Snippets 失败: ${error}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);

  const handleCopy = async (snippet: CommandSnippet) => {
    await navigator.clipboard.writeText(snippet.command);
    setCopiedId(snippet.id || 0);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExecute = (snippet: CommandSnippet) => {
    if (onExecute) {
      onExecute(snippet.command);
    }
  };

  const filteredSnippets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byCategory = selectedCategory === 'all'
      ? snippets
      : snippets.filter(s => s.category === selectedCategory);
    if (!q) return byCategory;
    return byCategory.filter(s => {
      const hay = `${s.name}\n${s.command}\n${s.description || ''}\n${s.category || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, selectedCategory, snippets]);

  const groupedSnippets = useMemo(() => {
    return filteredSnippets.reduce((acc, snippet) => {
      const category = snippet.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(snippet);
      return acc;
    }, {} as Record<string, CommandSnippet[]>);
  }, [filteredSnippets]);

  const openCreate = () => {
    setEditing({ name: '', command: '', description: '', category: selectedCategory === 'all' ? '' : selectedCategory });
    setIsEditorOpen(true);
  };

  const openEdit = (snippet: CommandSnippet) => {
    setEditing({
      id: snippet.id,
      name: snippet.name,
      command: snippet.command,
      description: snippet.description || '',
      category: snippet.category || '',
    });
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditing(null);
    setIsSaving(false);
  };

  const saveSnippet = async () => {
    if (!editing) return;
    const payload: CommandSnippet = {
      id: editing.id,
      name: editing.name.trim(),
      command: editing.command.trim(),
      description: editing.description?.trim() || undefined,
      category: editing.category?.trim() || undefined,
    };
    if (!payload.name || !payload.command) {
      showToast('名称和命令不能为空', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await invoke<number>('save_snippet', { snippet: payload });
      showToast('已保存', 'success');
      closeEditor();
      await loadSnippets();
    } catch (error) {
      console.error('Failed to save snippet:', error);
      showToast(`保存失败: ${error}`, 'error');
      setIsSaving(false);
    }
  };

  const deleteSnippet = async (snippet: CommandSnippet) => {
    if (!snippet.id) return;
    const ok = window.confirm(`确认删除 Snippet「${snippet.name}」？`);
    if (!ok) return;
    try {
      await invoke('delete_snippet', { id: snippet.id });
      showToast('已删除', 'success');
      await loadSnippets();
    } catch (error) {
      console.error('Failed to delete snippet:', error);
      showToast(`删除失败: ${error}`, 'error');
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-200 flex-shrink-0">Snippets</h2>
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称/命令/描述…"
            className="w-full bg-zinc-800 text-zinc-200 text-xs pl-7 pr-2 py-1.5 rounded border border-zinc-700 focus:border-blue-500 focus:outline-none placeholder-zinc-500"
          />
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-blue-600/90 hover:bg-blue-600 text-white text-xs transition-colors flex-shrink-0"
          title="新增 Snippet"
        >
          <Plus className="w-3.5 h-3.5" />
          新增
        </button>
      </div>

      <div className="p-2 border-b border-zinc-800 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
            selectedCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-center text-zinc-500 text-sm py-8">Loading...</div>
        ) : filteredSnippets.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm py-8">无匹配 Snippet</div>
        ) : (
          <div className="p-2 space-y-4">
            {Object.entries(groupedSnippets).map(([category, snippets]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
                  <FolderOpen className="w-3 h-3" />
                  {category}
                </div>
                <div className="space-y-1">
                  {snippets.map(snippet => (
                    <div
                      key={snippet.id}
                      className="group bg-zinc-800/30 rounded-md px-2 py-1.5 border border-zinc-800 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium text-zinc-200 truncate">{snippet.name}</span>
                            {snippet.description && (
                              <span className="text-[11px] text-zinc-500 truncate">— {snippet.description}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-green-400 font-mono truncate">
                            {snippet.command}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleCopy(snippet)}
                            className="p-1 hover:bg-zinc-700 rounded transition-colors"
                            title="复制"
                          >
                            {copiedId === snippet.id ? (
                              <span className="text-xs text-green-400">✓</span>
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </button>
                          {onExecute && (
                            <button
                              onClick={() => handleExecute(snippet)}
                              className="p-1 hover:bg-blue-900/50 rounded transition-colors"
                              title="执行"
                            >
                              <Play className="w-3.5 h-3.5 text-blue-400" />
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(snippet)}
                            className="p-1 hover:bg-zinc-700 rounded transition-colors"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                          <button
                            onClick={() => deleteSnippet(snippet)}
                            className="p-1 hover:bg-red-900/30 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {isEditorOpen && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeEditor}
          />
          <div className="relative w-[560px] max-w-[92vw] rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="text-sm font-semibold text-zinc-200">
                {editing.id ? '编辑 Snippet' : '新增 Snippet'}
              </div>
              <button
                onClick={closeEditor}
                className="p-1 rounded hover:bg-zinc-800 transition-colors"
                title="关闭"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs text-zinc-500">名称</div>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full bg-zinc-800 text-zinc-200 text-xs px-2 py-1.5 rounded border border-zinc-700 focus:border-blue-500 focus:outline-none"
                    placeholder="如：Disk Usage"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-xs text-zinc-500">分类</div>
                  <input
                    value={editing.category || ''}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    className="w-full bg-zinc-800 text-zinc-200 text-xs px-2 py-1.5 rounded border border-zinc-700 focus:border-blue-500 focus:outline-none"
                    placeholder="如：System（可选）"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <div className="text-xs text-zinc-500">命令</div>
                <textarea
                  value={editing.command}
                  onChange={(e) => setEditing({ ...editing, command: e.target.value })}
                  className="w-full bg-zinc-800 text-zinc-200 text-xs px-2 py-2 rounded border border-zinc-700 focus:border-blue-500 focus:outline-none font-mono min-h-[92px]"
                  placeholder="如：df -h"
                />
              </label>

              <label className="space-y-1 block">
                <div className="text-xs text-zinc-500">描述</div>
                <input
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full bg-zinc-800 text-zinc-200 text-xs px-2 py-1.5 rounded border border-zinc-700 focus:border-blue-500 focus:outline-none"
                  placeholder="（可选）"
                />
              </label>
            </div>

            <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                onClick={closeEditor}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
                disabled={isSaving}
              >
                取消
              </button>
              <button
                onClick={saveSnippet}
                className={cn(
                  'px-3 py-1.5 rounded text-xs transition-colors',
                  isSaving ? 'bg-blue-600/40 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
                )}
                disabled={isSaving}
              >
                {isSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
