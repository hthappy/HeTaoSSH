import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Shortcut {
  id: string;
  label: string;
  defaultKeys: string;
  keys: string;
  category: 'global' | 'terminal' | 'editor';
}

interface ShortcutsState {
  shortcuts: Shortcut[];
  loadShortcuts: () => void;
  saveShortcut: (id: string, keys: string) => void;
  resetShortcut: (id: string) => void;
  resetAll: () => void;
  getKeys: (id: string) => string;
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: 'new-connection', label: 'shortcuts.new_connection', defaultKeys: 'Ctrl+N', keys: 'Ctrl+N', category: 'global' },
  { id: 'toggle-sidebar', label: 'shortcuts.toggle_sidebar', defaultKeys: 'Ctrl+B', keys: 'Ctrl+B', category: 'global' },
  { id: 'close-tab', label: 'shortcuts.close_tab', defaultKeys: 'Ctrl+W', keys: 'Ctrl+W', category: 'global' },
  { id: 'close-pane', label: 'shortcuts.close_pane', defaultKeys: 'Ctrl+Shift+W', keys: 'Ctrl+Shift+W', category: 'global' },
  { id: 'new-local-terminal', label: 'shortcuts.new_local_terminal', defaultKeys: 'Ctrl+T', keys: 'Ctrl+T', category: 'global' },
  { id: 'settings', label: 'shortcuts.settings', defaultKeys: 'Ctrl+,', keys: 'Ctrl+,', category: 'global' },
  { id: 'terminal-search', label: 'shortcuts.terminal_search', defaultKeys: 'Ctrl+F', keys: 'Ctrl+F', category: 'terminal' },
  { id: 'split-horizontal', label: 'shortcuts.split_horizontal', defaultKeys: 'Ctrl+Shift+D', keys: 'Ctrl+Shift+D', category: 'terminal' },
  { id: 'split-vertical', label: 'shortcuts.split_vertical', defaultKeys: 'Ctrl+Shift+E', keys: 'Ctrl+Shift+E', category: 'terminal' },
  { id: 'editor-save', label: 'shortcuts.editor_save', defaultKeys: 'Ctrl+S', keys: 'Ctrl+S', category: 'editor' },
];

// Parse shortcut string like "Ctrl+Shift+D" into parts
export function parseShortcut(shortcut: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = shortcut.toLowerCase().split('+');
  return {
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts[parts.length - 1] || '',
  };
}

// Check if a keyboard event matches a shortcut
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  const key = e.key.toLowerCase();
  return (
    (e.ctrlKey || e.metaKey) === parsed.ctrl &&
    e.shiftKey === parsed.shift &&
    e.altKey === parsed.alt &&
    key === parsed.key
  );
}

export const useShortcutsStore = create<ShortcutsState>()(
  persist(
    (set, get) => ({
      shortcuts: DEFAULT_SHORTCUTS,

      loadShortcuts: () => {
        // Already loaded via persist middleware
      },

      saveShortcut: (id: string, keys: string) => {
        set((state) => ({
          shortcuts: state.shortcuts.map((s) =>
            s.id === id ? { ...s, keys } : s
          ),
        }));
      },

      resetShortcut: (id: string) => {
        set((state) => ({
          shortcuts: state.shortcuts.map((s) =>
            s.id === id ? { ...s, keys: s.defaultKeys } : s
          ),
        }));
      },

      resetAll: () => {
        set({ shortcuts: DEFAULT_SHORTCUTS });
      },

      getKeys: (id: string) => {
        const shortcut = get().shortcuts.find((s) => s.id === id);
        return shortcut?.keys || '';
      },
    }),
    {
      name: 'HeTaoSSH_shortcuts',
      partialize: (state) => ({
        shortcuts: state.shortcuts.map((s) => ({ id: s.id, keys: s.keys })),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Merge saved shortcuts with defaults (to handle new shortcuts added in updates)
          const savedKeys = new Map(
            (state.shortcuts as unknown as Array<{ id: string; keys: string }>)?.map((s) => [s.id, s.keys]) || []
          );
          state.shortcuts = DEFAULT_SHORTCUTS.map((s) => ({
            ...s,
            keys: savedKeys.get(s.id) || s.defaultKeys,
          }));
        }
      },
    }
  )
);