import { useCallback, useMemo, useState, useEffect } from 'react';
import { Copy, Play, FolderOpen, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      showToast(t('snippets.load_failed') + `: ${error}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast, t]);

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
      showToast(t('snippets.validation_error'), 'error');
      return;
    }
    setIsSaving(true);
    try {
      await invoke<number>('save_snippet', { snippet: payload });
      showToast(t('snippets.saved'), 'success');
      closeEditor();
      await loadSnippets();
    } catch (error) {
      console.error('Failed to save snippet:', error);
      showToast(t('snippets.save_failed', { error }), 'error');
      setIsSaving(false);
    }
  };

  const deleteSnippet = async (snippet: CommandSnippet) => {
    if (!snippet.id) return;
    const ok = window.confirm(t('snippets.delete_confirm', { name: snippet.name }));
    if (!ok) return;
    try {
      await invoke('delete_snippet', { id: snippet.id });
      showToast(t('snippets.deleted'), 'success');
      await loadSnippets();
    } catch (error) {
      console.error('Failed to delete snippet:', error);
      showToast(t('snippets.delete_failed', { error }), 'error');
    }
  };

  return (
    <div className="h-full flex flex-col bg-term-bg">
      <div className="p-3 border-b border-term-selection flex items-center gap-2">
        <h2 className="text-sm font-semibold text-term-fg flex-shrink-0">{t('snippets.title')}</h2>
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-term-fg opacity-50 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('snippets.search_placeholder')}
            className="w-full bg-term-selection text-term-fg text-xs pl-7 pr-2 py-1.5 rounded border border-term-selection focus:border-term-blue focus:outline-none placeholder-term-fg placeholder-opacity-40"
          />
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-term-blue hover:opacity-90 text-white text-xs transition-colors flex-shrink-0"
          title={t('snippets.add')}
        >
          <Plus className="w-3.5 h-3.5" />
          {t('common.add')}
        </button>
      </div>

      <div className="p-2 border-b border-term-selection flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
            selectedCategory === 'all'
              ? 'bg-term-blue text-white'
              : 'bg-term-selection text-term-fg opacity-60 hover:opacity-100 hover:text-term-fg'
          }`}
        >
          {t('common.all')}
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-term-blue text-white'
                : 'bg-term-selection text-term-fg opacity-60 hover:opacity-100 hover:text-term-fg'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-center text-term-fg opacity-50 text-sm py-8">{t('common.loading')}</div>
        ) : filteredSnippets.length === 0 ? (
          <div className="text-center text-term-fg opacity-50 text-sm py-8">{t('snippets.no_match')}</div>
        ) : (
          <div className="p-2 space-y-4">
            {Object.entries(groupedSnippets).map(([category, snippets]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-term-fg opacity-50 uppercase tracking-wider px-1">
                  <FolderOpen className="w-3 h-3" />
                  {category}
                </div>
                <div className="space-y-1">
                  {snippets.map(snippet => (
                    <div
                      key={snippet.id}
                      className="group bg-term-selection/20 rounded-md px-2 py-1.5 border border-term-selection hover:border-term-blue/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium text-term-fg truncate">{snippet.name}</span>
                            {snippet.description && (
                              <span className="text-[11px] text-term-fg opacity-50 truncate">— {snippet.description}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-term-green font-mono truncate">
                            {snippet.command}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleCopy(snippet)}
                            className="p-1 hover:bg-term-selection rounded transition-colors"
                            title={t('snippets.copy')}
                          >
                            {copiedId === snippet.id ? (
                              <span className="text-xs text-term-green">✓</span>
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-term-fg opacity-60" />
                            )}
                          </button>
                          {onExecute && (
                            <button
                              onClick={() => handleExecute(snippet)}
                              className="p-1 hover:bg-term-blue/20 rounded transition-colors"
                              title={t('snippets.execute')}
                            >
                              <Play className="w-3.5 h-3.5 text-term-blue" />
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(snippet)}
                            className="p-1 hover:bg-term-selection rounded transition-colors"
                            title={t('snippets.edit')}
                          >
                            <Pencil className="w-3.5 h-3.5 text-term-fg opacity-60" />
                          </button>
                          <button
                            onClick={() => deleteSnippet(snippet)}
                            className="p-1 hover:bg-term-red/20 rounded transition-colors"
                            title={t('snippets.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-term-red" />
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
          <div className="relative w-[560px] max-w-[92vw] rounded-lg border border-term-selection bg-term-bg shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-term-selection">
              <div className="text-sm font-semibold text-term-fg">
                {editing.id ? t('snippets.edit') : t('snippets.add')}
              </div>
              <button
                onClick={closeEditor}
                className="p-1 rounded hover:bg-term-selection transition-colors"
                title={t('snippets.close')}
              >
                <X className="w-4 h-4 text-term-fg opacity-60" />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs text-term-fg opacity-50">{t('snippets.name')}</div>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full bg-term-selection text-term-fg text-xs px-2 py-1.5 rounded border border-term-selection focus:border-term-blue focus:outline-none"
                    placeholder={t('snippets.name_placeholder')}
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-xs text-term-fg opacity-50">{t('snippets.category')}</div>
                  <input
                    value={editing.category || ''}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    className="w-full bg-term-selection text-term-fg text-xs px-2 py-1.5 rounded border border-term-selection focus:border-term-blue focus:outline-none"
                    placeholder={t('snippets.category_placeholder')}
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <div className="text-xs text-term-fg opacity-50">{t('snippets.command')}</div>
                <textarea
                  value={editing.command}
                  onChange={(e) => setEditing({ ...editing, command: e.target.value })}
                  className="w-full bg-term-selection text-term-fg text-xs px-2 py-2 rounded border border-term-selection focus:border-term-blue focus:outline-none font-mono min-h-[92px]"
                  placeholder={t('snippets.command_placeholder')}
                />
              </label>

              <label className="space-y-1 block">
                <div className="text-xs text-term-fg opacity-50">{t('snippets.description')}</div>
                <input
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full bg-term-selection text-term-fg text-xs px-2 py-1.5 rounded border border-term-selection focus:border-term-blue focus:outline-none"
                  placeholder={t('snippets.optional')}
                />
              </label>
            </div>

            <div className="px-4 py-3 border-t border-term-selection flex items-center justify-end gap-2">
              <button
                onClick={closeEditor}
                className="px-3 py-1.5 rounded bg-term-selection hover:opacity-90 text-term-fg text-xs transition-colors"
                disabled={isSaving}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={saveSnippet}
                className={cn(
                  'px-3 py-1.5 rounded text-xs transition-colors',
                  isSaving ? 'bg-term-blue/40 text-white cursor-not-allowed' : 'bg-term-blue hover:opacity-90 text-white'
                )}
                disabled={isSaving}
              >
                {isSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
