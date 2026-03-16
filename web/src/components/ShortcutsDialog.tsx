import { X, Keyboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { category: 'General', items: [
    { keys: ['Ctrl', 'N'], action: 'new_connection' },
    { keys: ['Ctrl', ','], action: 'settings' },
    { keys: ['Ctrl', 'T'], action: 'new_terminal' },
    { keys: ['F11'], action: 'fullscreen' },
  ]},
  { category: 'Tabs', items: [
    { keys: ['Ctrl', 'W'], action: 'close_tab' },
    { keys: ['Ctrl', 'Tab'], action: 'next_tab' },
    { keys: ['Ctrl', 'Shift', 'Tab'], action: 'prev_tab' },
    { keys: ['Ctrl', '1-9'], action: 'switch_tab' },
  ]},
  { category: 'Terminal', items: [
    { keys: ['↑', '↓'], action: 'command_history' },
    { keys: ['Ctrl', 'C'], action: 'copy' },
    { keys: ['Ctrl', 'V'], action: 'paste' },
  ]},
  { category: 'File', items: [
    { keys: ['Ctrl'], action: 'multi_select' },
    { keys: ['Shift'], action: 'range_select' },
  ]},
];

export function ShortcutsDialog({ isOpen, onClose }: ShortcutsDialogProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-term-bg border border-term-selection rounded-lg w-full max-w-2xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-term-blue" />
            <h2 className="text-lg font-semibold text-term-fg">
              {t('shortcuts.title', 'Keyboard Shortcuts')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-term-selection/50 text-term-fg/60 hover:text-term-fg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shortcuts.map((section) => (
            <div key={section.category} className="space-y-3">
              <h3 className="text-sm font-semibold text-term-fg/80 uppercase tracking-wider">
                {t(`shortcuts.${section.category.toLowerCase()}`, section.category)}
              </h3>
              <div className="space-y-2">
                {section.items.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded bg-term-selection/20 hover:bg-term-selection/30 transition-colors"
                  >
                    <span className="text-sm text-term-fg">
                      {t(`shortcuts.${shortcut.action}`, shortcut.action)}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <kbd
                          key={i}
                          className={cn(
                            "px-2 py-1 text-xs font-mono rounded border",
                            "bg-term-bg border-term-selection text-term-fg/80"
                          )}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-term-selection">
          <p className="text-xs text-term-fg/40 text-center">
            {t('shortcuts.tip', 'Press')} <kbd className="px-2 py-1 text-xs rounded bg-term-selection/30">F1</kbd> {t('shortcuts.tip2', 'to open this help anytime')}
          </p>
        </div>
      </div>
    </div>
  );
}
