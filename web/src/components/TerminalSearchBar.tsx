import { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SearchAddon } from 'xterm-addon-search';

interface TerminalSearchBarProps {
  searchAddonRef: React.MutableRefObject<SearchAddon | null>;
  onClose: () => void;
}

export function TerminalSearchBar({ searchAddonRef, onClose }: TerminalSearchBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  // State to track the match and results
  const [hasMatch, setHasMatch] = useState(false);
  // Count of search results (0 if not known or not implemented)  
  const [resultsCount, setResultsCount] = useState(0);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);  
  const inputRef = useRef<HTMLInputElement>(null);

  // Subscribe to onDidChangeResults event (fires when decorations are enabled)
  // The event provides { resultIndex, resultCount } for displaying match count
  useEffect(() => {
    const searchAddon: any = searchAddonRef.current;
    if (!searchAddon) return;

    // Check for correct API name (xterm.js v5+)
    if (searchAddon.onDidChangeResults) {
      const disposable = searchAddon.onDidChangeResults((result: { resultIndex: number; resultCount: number }) => {
        if (result) {
          setHasMatch(result.resultIndex !== -1 && result.resultCount > 0);
          setResultsCount(result.resultCount || 0);
          setCurrentResultIndex(Math.max(0, result.resultIndex || 0));
        }
      });
      return () => disposable?.dispose?.();
    }
  }, [searchAddonRef]);

  // Execute search when hotkey actions occur
  // NOTE: To get resultCount, we MUST enable decorations
  // This triggers onDidChangeResults event which provides { resultIndex, resultCount }
  const performSearch = (direction: 'next' | 'previous') => {
    if (!query.trim()) return;

    if (!searchAddonRef.current) {
      console.warn('Search addon not available');
      return;
    }

    try {
      const searchOptions = {
        caseSensitive,
        regex,
        wholeWord: false,
        incremental: direction === 'next',
        // Enable decorations to trigger onDidChangeResults event for resultCount
        decorations: {
          matchBackground: '#FFFF0033', // Yellow semi-transparent for all matches
          matchOverviewRuler: '#FFFF00', // Yellow in overview ruler
          activeMatchBackground: '#FF660066', // Orange semi-transparent for current match
          activeMatchColorOverviewRuler: '#FF6600', // Orange in overview ruler for current
        },
      };

      // findNext/findPrevious return boolean, but with decorations enabled,
      // onDidChangeResults event fires and updates resultsCount
      const found = direction === 'next'
        ? searchAddonRef.current.findNext(query.trim(), searchOptions)
        : searchAddonRef.current.findPrevious(query.trim(), searchOptions);

      // Update hasMatch based on return value (resultsCount updated via event)
      setHasMatch(found);
      if (!found) {
        setResultsCount(0);
        setCurrentResultIndex(0);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setHasMatch(false);
      setResultsCount(0);
      setCurrentResultIndex(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch('next');
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Initial focus on input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
          onClick={() => performSearch('previous')}
          disabled={!query.trim()}
          className="p-1 rounded hover:bg-term-selection/50 disabled:opacity-30 disabled:cursor-not-allowed text-term-fg"
          title={t('terminal.search_previous', 'Previous match')}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => performSearch('next')}
          disabled={!query.trim()}
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

      {query.trim() && hasMatch && resultsCount > 0 && (
        <div className="text-xs text-term-green/60 min-w-[60px] text-right">
          {t('terminal.matches_found', '{{current}}/{{total}}', { 
            current: currentResultIndex + 1, 
            total: resultsCount 
          })}
        </div>
      )}
      {query.trim() && hasMatch && resultsCount === 0 && (
        <div className="text-xs text-term-green/60 min-w-[60px] text-right">
          {t('terminal.match_found', 'Match')}
        </div>
      )}
      {query.trim() && !hasMatch && (
        <div className="text-xs text-term-red/60 min-w-[60px] text-right">
          {t('terminal.no_match', 'No match')}
        </div>
      )}

      <button
        onClick={() => {
          // Clear search decorations when closing
          if (searchAddonRef.current) {
            searchAddonRef.current.clearDecorations();
          }
          onClose();
        }}
        className="p-1 rounded hover:bg-term-selection/50 text-term-fg/60 hover:text-term-fg"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}