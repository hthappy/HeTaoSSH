import { useState, useEffect, useCallback } from 'react';
import { Edit2, Save, X, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShortcutsStore } from '@/stores/shortcuts-store';

export interface ShortcutConfig {
  id: string;
  label: string;
  defaultKeys: string;
  keys: string;
  category: 'global' | 'terminal' | 'editor';
}

interface ShortcutsSettingsProps {
  shortcuts?: ShortcutConfig[];
  onSave?: (shortcuts: ShortcutConfig[]) => void;
}

export function ShortcutsSettings({ shortcuts: propShortcuts, onSave }: ShortcutsSettingsProps) {
  const { t } = useTranslation();
  const { shortcuts: storeShortcuts, saveShortcut, resetShortcut, resetAll } = useShortcutsStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempKeys, setTempKeys] = useState('');

  // Use store shortcuts or prop shortcuts
  const shortcuts = propShortcuts || storeShortcuts;

  const parseKeys = (keys: string): string[] => {
    return keys.split('+').map(k => k.trim());
  };

  const saveShortcutLocal = (shortcut: ShortcutConfig) => {
    if (onSave) {
      const updated = shortcuts.map(s =>
        s.id === shortcut.id ? { ...s, keys: tempKeys } : s
      );
      onSave(updated as ShortcutConfig[]);
    } else {
      saveShortcut(shortcut.id, tempKeys);
    }
    setEditingId(null);
    setTempKeys('');
  };

  const resetShortcutLocal = (shortcut: ShortcutConfig) => {
    if (onSave) {
      const updated = shortcuts.map(s =>
        s.id === shortcut.id ? { ...s, keys: s.defaultKeys } : s
      );
      onSave(updated as ShortcutConfig[]);
    } else {
      resetShortcut(shortcut.id);
    }
  };

  // Handle keyboard input for shortcut recording
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!editingId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    
    // Add the key (but not modifier keys)
    const key = e.key.toLowerCase();
    if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    }
    
    if (parts.length > 0) {
      setTempKeys(parts.join('+'));
    }
  }, [editingId]);

  useEffect(() => {
    if (editingId) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [editingId, handleKeyDown]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className="flex items-center justify-between p-2 bg-term-selection/10 rounded-sm border border-term-selection/30"
          >
            <div className="flex-1">
              <div className="text-xs text-term-fg font-medium">{t(shortcut.label)}</div>
            </div>

            {editingId === shortcut.id ? (
              <div className="flex items-center gap-1.5">
                <div className="px-2 py-1 bg-term-selection/30 border border-term-blue rounded-sm text-[10px] text-term-fg min-w-[80px] text-center">
                  {tempKeys || t('shortcuts.press_keys', 'Press keys...')}
                </div>
                <button
                  onClick={() => saveShortcutLocal(shortcut)}
                  className="p-1 rounded-sm hover:bg-term-blue/20 text-term-blue"
                  title={t('common.save', 'Save')}
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setEditingId(null);
                    setTempKeys('');
                  }}
                  className="p-1 rounded-sm hover:bg-term-red/20 text-term-red"
                  title={t('common.cancel', 'Cancel')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {parseKeys(shortcut.keys).map((key, i) => (
                    <kbd
                      key={i}
                      className="px-1 py-0.5 text-[9px] bg-term-selection/50 border border-term-selection rounded-sm text-term-fg/70"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setEditingId(shortcut.id);
                    setTempKeys(shortcut.keys);
                  }}
                  className="p-1 rounded-sm hover:bg-term-selection/50 text-term-fg/60 hover:text-term-fg"
                  title={t('common.edit', 'Edit')}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                {shortcut.keys !== shortcut.defaultKeys && (
                  <button
                    onClick={() => resetShortcutLocal(shortcut)}
                    className="p-1 rounded-sm hover:bg-term-yellow/20 text-term-yellow"
                    title={t('common.reset', 'Reset')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reset All Button */}
      <div className="pt-2 border-t border-term-selection/30">
        <button
          onClick={() => {
            resetAll();
          }}
          className="text-xs text-term-fg/50 hover:text-term-fg transition-colors"
        >
          {t('shortcuts.reset_all', 'Reset all shortcuts to defaults')}
        </button>
      </div>
    </div>
  );
}
