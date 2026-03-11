import { useState, useEffect } from 'react';
import { Copy, Play, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

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

  useEffect(() => {
    loadSnippets();
  }, []);

  const loadSnippets = async () => {
    setIsLoading(true);
    try {
      const data = await invoke<CommandSnippet[]>('list_snippets');
      setSnippets(data);
      const cats = [...new Set(data.map(s => s.category).filter(Boolean))] as string[];
      setCategories(cats);
    } catch (error) {
      console.error('Failed to load snippets:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  const filteredSnippets = selectedCategory === 'all'
    ? snippets
    : snippets.filter(s => s.category === selectedCategory);

  const groupedSnippets = filteredSnippets.reduce((acc, snippet) => {
    const category = snippet.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(snippet);
    return acc;
  }, {} as Record<string, CommandSnippet[]>);

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">Command Snippets</h2>
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

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-center text-zinc-500 text-sm py-8">Loading...</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedSnippets).map(([category, snippets]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  <FolderOpen className="w-3 h-3" />
                  {category}
                </div>
                <div className="space-y-2">
                  {snippets.map(snippet => (
                    <div
                      key={snippet.id}
                      className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-800 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-medium text-zinc-200">
                          {snippet.name}
                        </h3>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleCopy(snippet)}
                            className="p-1 hover:bg-zinc-700 rounded transition-colors"
                            title="Copy command"
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
                              title="Execute command"
                            >
                              <Play className="w-3.5 h-3.5 text-blue-400" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="bg-zinc-950 rounded p-2 mb-2">
                        <code className="text-xs text-green-400 font-mono block break-all">
                          {snippet.command}
                        </code>
                      </div>
                      {snippet.description && (
                        <p className="text-xs text-zinc-500">
                          {snippet.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
