import { useState, useEffect, useRef } from 'react';
import { X, Terminal, Folder, Server, Settings, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  category: 'connection' | 'terminal' | 'file' | 'settings' | 'tools';
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.shortcut?.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'connection': return <Server className="w-4 h-4" />;
      case 'terminal': return <Terminal className="w-4 h-4" />;
      case 'file': return <Folder className="w-4 h-4" />;
      case 'settings': return <Settings className="w-4 h-4" />;
      case 'tools': return <Zap className="w-4 h-4" />;
      default: return <Zap className="w-4 h-4" />;
    }
  };

  return (
      <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-term-bg border border-term-selection rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-term-selection">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={t('command_palette.search', 'Type a command or search...')}
            className="flex-1 bg-transparent text-lg text-term-fg placeholder-term-fg/40 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-term-selection/50 text-term-fg/60 hover:text-term-fg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[400px] overflow-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-term-fg/40">
              <p className="text-sm">{t('command_palette.no_results', 'No commands found')}</p>
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-term-selection/30 transition-colors',
                  index === selectedIndex && 'bg-term-selection/50'
                )}
              >
                <div className={cn(
                  'p-2 rounded-md',
                  cmd.category === 'connection' && 'bg-term-blue/20 text-term-blue',
                  cmd.category === 'terminal' && 'bg-term-green/20 text-term-green',
                  cmd.category === 'file' && 'bg-term-yellow/20 text-term-yellow',
                  cmd.category === 'settings' && 'bg-term-magenta/20 text-term-magenta',
                  cmd.category === 'tools' && 'bg-term-cyan/20 text-term-cyan',
                )}>
                  {cmd.icon || getCategoryIcon(cmd.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-term-fg truncate">{cmd.label}</div>
                </div>
                {cmd.shortcut && (
                  <div className="flex items-center gap-1">
                    {cmd.shortcut.split('+').map((key, i) => (
                      <kbd
                        key={i}
                        className="px-1.5 py-0.5 text-[10px] bg-term-selection/50 border border-term-selection rounded text-term-fg/60"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 bg-term-selection/20 border-t border-term-selection text-[10px] text-term-fg/40">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-term-selection/50 rounded">↑↓</kbd>
              {t('command_palette.navigate', 'to navigate')}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-term-selection/50 rounded">Enter</kbd>
              {t('command_palette.select', 'to select')}
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-term-selection/50 rounded">Esc</kbd>
            {t('command_palette.close', 'to close')}
          </span>
        </div>
      </div>
    </div>
  );
}
