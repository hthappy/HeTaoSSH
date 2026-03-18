import { useState, useEffect } from 'react';
import { Edit2, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ShortcutConfig {
  id: string;
  label: string;
  defaultKeys: string;
  keys: string;
  category: 'global' | 'terminal' | 'editor';
}

interface ShortcutsSettingsProps {
  shortcuts: ShortcutConfig[];
  onSave: (shortcuts: ShortcutConfig[]) => void;
}

export function ShortcutsSettings({ shortcuts, onSave }: ShortcutsSettingsProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempKeys, setTempKeys] = useState('');
  const [localShortcuts, setLocalShortcuts] = useState<ShortcutConfig[]>([]);

  useEffect(() => {
    if (shortcuts && shortcuts.length > 0) {
      setLocalShortcuts(shortcuts);
    } else {
      setLocalShortcuts(getDefaultShortcuts());
    }
  }, [shortcuts]);

  const getDefaultShortcuts = (): ShortcutConfig[] => [
    { id: 'new-connection', label: t('shortcuts.new_connection', 'New Connection'), defaultKeys: 'Ctrl+N', keys: 'Ctrl+N', category: 'global' },
    { id: 'toggle-sidebar', label: t('shortcuts.toggle_sidebar', 'Toggle Sidebar'), defaultKeys: 'Ctrl+B', keys: 'Ctrl+B', category: 'global' },
    { id: 'close-tab', label: t('shortcuts.close_tab', 'Close Tab'), defaultKeys: 'Ctrl+W', keys: 'Ctrl+W', category: 'global' },
    { id: 'new-local-terminal', label: t('shortcuts.new_local_terminal', 'New Local Terminal'), defaultKeys: 'Ctrl+T', keys: 'Ctrl+T', category: 'global' },
    { id: 'settings', label: t('shortcuts.settings', 'Settings'), defaultKeys: 'Ctrl+,', keys: 'Ctrl+,', category: 'global' },
    { id: 'terminal-search', label: t('shortcuts.terminal_search', 'Terminal Search'), defaultKeys: 'Ctrl+F', keys: 'Ctrl+F', category: 'terminal' },
  ];

  const parseKeys = (keys: string): string[] => {
    return keys.split('+').map(k => k.trim());
  };

  const saveShortcut = (shortcut: ShortcutConfig) => {
    const updated = localShortcuts.map(s =>
      s.id === shortcut.id ? { ...s, keys: tempKeys } : s
    );
    setLocalShortcuts(updated);
    onSave(updated);
    setEditingId(null);
    setTempKeys('');
  };

  const resetShortcut = (shortcut: ShortcutConfig) => {
    const updated = localShortcuts.map(s =>
      s.id === shortcut.id ? { ...s, keys: s.defaultKeys } : s
    );
    setLocalShortcuts(updated);
    onSave(updated);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {localShortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className="flex items-center justify-between p-2.5 bg-term-selection/10 rounded-md border border-term-selection/30"
          >
            <div className="flex-1">
              <div className="text-sm text-term-fg font-medium">{shortcut.label}</div>
            </div>

            {editingId === shortcut.id ? (
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 bg-term-selection/30 border border-term-blue rounded text-xs text-term-fg min-w-[100px] text-center">
                  {tempKeys || t('settings.shortcuts.press_keys', 'Press keys...')}
                </div>
                <button
                  onClick={() => saveShortcut(shortcut)}
                  className="p-1 rounded hover:bg-term-blue/20 text-term-blue"
                  title={t('common.save', 'Save')}
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setEditingId(null);
                    setTempKeys('');
                  }}
                  className="p-1 rounded hover:bg-term-red/20 text-term-red"
                  title={t('common.cancel', 'Cancel')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {parseKeys(shortcut.keys).map((key, i) => (
                    <kbd
                      key={i}
                      className="px-1.5 py-1 text-[10px] bg-term-selection/50 border border-term-selection rounded text-term-fg/70"
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
                  className="p-1 rounded hover:bg-term-selection/50 text-term-fg/60 hover:text-term-fg"
                  title={t('common.edit', 'Edit')}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                {shortcut.keys !== shortcut.defaultKeys && (
                  <button
                    onClick={() => resetShortcut(shortcut)}
                    className="p-1 rounded hover:bg-term-yellow/20 text-term-yellow"
                    title={t('common.reset', 'Reset')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
