import { useState } from 'react';
import { Keyboard, Edit2, Save, X } from 'lucide-react';
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
  const [localShortcuts, setLocalShortcuts] = useState(shortcuts);

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
      <div className="flex items-center gap-2 text-term-fg mb-4">
        <Keyboard className="w-5 h-5" />
        <h3 className="text-lg font-semibold">{t('settings.shortcuts.title', 'Keyboard Shortcuts')}</h3>
      </div>

      <div className="space-y-3">
        {localShortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className="flex items-center justify-between p-3 bg-term-selection/10 rounded-lg border border-term-selection/30"
          >
            <div className="flex-1">
              <div className="text-sm text-term-fg font-medium">{shortcut.label}</div>
              <div className="text-xs text-term-fg/40">{shortcut.category}</div>
            </div>

            {editingId === shortcut.id ? (
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 bg-term-selection/30 border border-term-blue rounded text-sm text-term-fg min-w-[120px] text-center">
                  {tempKeys || t('settings.shortcuts.press_keys', 'Press keys...')}
                </div>
                <button
                  onClick={() => saveShortcut(shortcut)}
                  className="p-1.5 rounded hover:bg-term-blue/20 text-term-blue"
                  title={t('common.save', 'Save')}
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setEditingId(null);
                    setTempKeys('');
                  }}
                  className="p-1.5 rounded hover:bg-term-red/20 text-term-red"
                  title={t('common.cancel', 'Cancel')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {parseKeys(shortcut.keys).map((key, i) => (
                    <kbd
                      key={i}
                      className="px-2 py-1 text-xs bg-term-selection/50 border border-term-selection rounded text-term-fg"
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
                  className="p-1.5 rounded hover:bg-term-selection/50 text-term-fg/60 hover:text-term-fg"
                  title={t('common.edit', 'Edit')}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {shortcut.keys !== shortcut.defaultKeys && (
                  <button
                    onClick={() => resetShortcut(shortcut)}
                    className="p-1.5 rounded hover:bg-term-yellow/20 text-term-yellow"
                    title={t('common.reset', 'Reset')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-term-selection text-xs text-term-fg/40">
        <p>{t('settings.shortcuts.hint', 'Click the edit button and press your desired key combination')}</p>
      </div>
    </div>
  );
}
