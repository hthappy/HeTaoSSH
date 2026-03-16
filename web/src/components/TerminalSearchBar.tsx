import { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TerminalHandle } from './Terminal';

interface TerminalSearchBarProps {
  terminalRef: React.MutableRefObject<TerminalHandle | null>;
  onClose: () => void;
}

export function TerminalSearchBar({ terminalRef, onClose }: TerminalSearchBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = (direction: 'next' | 'previous') => {
    if (!query || !terminalRef.current) return;

    try {
      const term = (terminalRef.current as any)._term;
      if (!term) return;

      const searchAddon = term._searchAddon;
      if (!searchAddon) return;

      const searchOptions = {
        caseSensitive,
        regex,
        wholeWord: false,
        incremental: false,
      };

      if (direction === 'next') {
        searchAddon.findNext(query, searchOptions);
      } else {
        searchAddon.findPrevious(query, searchOptions);
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch('next');
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="absolute top-2 right-4 z-50 flex items-center gap-2 p-2 bg-term-bg border border-term-selection rounded-lg shadow-xl min-w-[320px]">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('terminal.search_placeholder', 'Search in terminal...')}
        className="flex-1 px-2 py-1 text-sm bg-term-selection/20 border border-term-selection rounded focus:outline-none focus:border-term-blue text-term-fg"
      />
      
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleSearch('previous')}
          disabled={!query}
          className="p-1 rounded hover:bg-term-selection/50 disabled:opacity-30 disabled:cursor-not-allowed text-term-fg"
          title={t('terminal.search_previous', 'Previous match')}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleSearch('next')}
          disabled={!query}
          className="p-1 rounded hover:bg-term-selection/50 disabled:opacity-30 disabled:cursor-not-allowed text-term-fg"
          title={t('terminal.search_next', 'Next match')}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-2 text-xs text-term-fg/60">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="w-3 h-3 rounded"
          />
          <span>Aa</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={regex}
            onChange={(e) => setRegex(e.target.checked)}
            className="w-3 h-3 rounded"
          />
          <span>.*</span>
        </label>
      </div>

      {query && (
        <div className="text-xs text-term-fg/60 min-w-[60px] text-right">
          {t('terminal.search_found', 'Matches found')}
        </div>
      )}

      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-term-selection/50 text-term-fg/60 hover:text-term-fg"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
