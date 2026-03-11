import { useState } from 'react';
import { Settings, Moon, Sun, Type, Monitor } from 'lucide-react';

interface AppSettings {
  theme: 'dark' | 'light';
  terminalFontSize: number;
  terminalLineHeight: number;
  editorMinimap: boolean;
  editorWordWrap: boolean;
}

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

export function SettingsDialog({ isOpen, onClose, settings, onSave }: SettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 w-full max-w-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
        </div>

        <div className="space-y-6">
          {/* Theme */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              {localSettings.theme === 'dark' ? (
                <Moon className="w-4 h-4 text-blue-400" />
              ) : (
                <Sun className="w-4 h-4 text-yellow-400" />
              )}
              <label className="text-sm font-medium text-zinc-200">Theme</label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setLocalSettings({ ...localSettings, theme: 'dark' })}
                className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
                  localSettings.theme === 'dark'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => setLocalSettings({ ...localSettings, theme: 'light' })}
                className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
                  localSettings.theme === 'light'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Light
              </button>
            </div>
          </div>

          {/* Terminal Font Size */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Type className="w-4 h-4 text-zinc-400" />
              <label className="text-sm font-medium text-zinc-200">
                Terminal Font Size: {localSettings.terminalFontSize}px
              </label>
            </div>
            <input
              type="range"
              min="10"
              max="24"
              value={localSettings.terminalFontSize}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, terminalFontSize: parseInt(e.target.value) })
              }
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>10px</span>
              <span>24px</span>
            </div>
          </div>

          {/* Terminal Line Height */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-4 h-4 text-zinc-400" />
              <label className="text-sm font-medium text-zinc-200">
                Terminal Line Height: {localSettings.terminalLineHeight}
              </label>
            </div>
            <input
              type="range"
              min="1.0"
              max="2.0"
              step="0.1"
              value={localSettings.terminalLineHeight}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, terminalLineHeight: parseFloat(e.target.value) })
              }
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>1.0</span>
              <span>2.0</span>
            </div>
          </div>

          {/* Editor Options */}
          <div>
            <label className="text-sm font-medium text-zinc-200 mb-3 block">Editor Options</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.editorMinimap}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, editorMinimap: e.target.checked })
                  }
                  className="accent-blue-600"
                />
                <span className="text-sm text-zinc-300">Show Minimap</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.editorWordWrap}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, editorWordWrap: e.target.checked })
                  }
                  className="accent-blue-600"
                />
                <span className="text-sm text-zinc-300">Word Wrap</span>
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-8 pt-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
