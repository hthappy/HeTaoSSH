import { useState, useEffect } from 'react';
import { X, Globe, Palette, Trash2, Keyboard, Settings, Monitor, MousePointer2, Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { presets } from '../themes/presets';
import { ThemeSchema } from '../types/theme';
import { ShortcutsSettings } from './ShortcutsSettings';
import { cn } from '@/lib/utils';

export interface AppSettings {
  language: string;
  theme: 'dark' | 'light';
  themeName: string;
  customThemes: ThemeSchema[];
  terminalFontSize: number;
  terminalLineHeight: number;
  editorMinimap: boolean;
  editorWordWrap: boolean;
  rightClickBehavior: 'menu' | 'paste';
}

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onPreviewTheme?: (theme: ThemeSchema | null) => void;
}

export function SettingsDialog({ isOpen, onClose, settings, onSave, onPreviewTheme }: SettingsDialogProps) {
  const { t, i18n } = useTranslation();
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(console.error);
  }, []);

  const handleSave = () => {
    onSave(localSettings);
    // Change language immediately if changed
    if (localSettings.language !== i18n.language) {
      i18n.changeLanguage(localSettings.language);
    }
    onClose();
  };

  // Preview theme immediately on click (without saving)
  const handlePreviewTheme = (themeName: string, themeType: 'dark' | 'light') => {
    const theme = allThemes.find(t => t.name === themeName);
    if (theme) {
      onPreviewTheme?.(theme);
      // Update local settings for UI feedback
      setLocalSettings({
        ...localSettings,
        themeName,
        theme: themeType
      });
    }
  };

  // Check if theme with same name exists (reserved for future use)
  // const checkThemeExists = (name: string) => {
  //   return [...presets, ...localSettings.customThemes].some(t => t.name === name);
  // };

  const processThemeContent = async (content: string, source: string) => {
    try {
      let theme: ThemeSchema;

      // Try parsing as JSON first
      try {
        const rawTheme = JSON.parse(content);

        // Check if it's a Gogh theme (flat structure)
        if (rawTheme.name && rawTheme.background && (rawTheme.black || rawTheme.color_01)) {
          // Convert Gogh format to our ThemeSchema
          const isIndexed = !!rawTheme.color_01;

          theme = {
            name: rawTheme.name,
            type: rawTheme.type || 'dark', // Default to dark for Gogh themes
            colors: {
              background: rawTheme.background,
              foreground: rawTheme.foreground,
              cursor: rawTheme.cursor,
              cursorAccent: rawTheme.cursorAccent || rawTheme.background,
              selection: rawTheme.selection || 'rgba(255, 255, 255, 0.3)',

              black: isIndexed ? rawTheme.color_01 : rawTheme.black,
              red: isIndexed ? rawTheme.color_02 : rawTheme.red,
              green: isIndexed ? rawTheme.color_03 : rawTheme.green,
              yellow: isIndexed ? rawTheme.color_04 : rawTheme.yellow,
              blue: isIndexed ? rawTheme.color_05 : rawTheme.blue,
              magenta: isIndexed ? rawTheme.color_06 : rawTheme.magenta,
              cyan: isIndexed ? rawTheme.color_07 : rawTheme.cyan,
              white: isIndexed ? rawTheme.color_08 : rawTheme.white,

              brightBlack: isIndexed ? rawTheme.color_09 : rawTheme.brightBlack,
              brightRed: isIndexed ? rawTheme.color_10 : rawTheme.brightRed,
              brightGreen: isIndexed ? rawTheme.color_11 : rawTheme.brightGreen,
              brightYellow: isIndexed ? rawTheme.color_12 : rawTheme.brightYellow,
              brightBlue: isIndexed ? rawTheme.color_13 : rawTheme.brightBlue,
              brightMagenta: isIndexed ? rawTheme.color_14 : rawTheme.brightMagenta,
              brightCyan: isIndexed ? rawTheme.color_15 : rawTheme.brightCyan,
              brightWhite: isIndexed ? rawTheme.color_16 : rawTheme.brightWhite,
            }
          };
        } else if (rawTheme.colors && rawTheme.name) {
          // Our format
          theme = rawTheme;
        } else {
          throw new Error('Invalid theme JSON');
        }
      } catch (e) {
        // Check if content looks like HTML (common mistake with GitHub URLs)
        if (content.trim().toLowerCase().startsWith('<!doctype html') || content.includes('<html')) {
          throw new Error(t('settings.html_content_error', 'HTML content detected. Are you trying to import a raw JSON file?'));
        }

        // Only try backend parsing if it wasn't a JSON parse error (which we handled above)
        throw new Error(t('settings.invalid_format_error', 'Invalid theme format'));
      }

      // Check if theme with same name exists
      const exists = localSettings.customThemes.some(t => t.name === theme.name);
      if (exists) {
        throw new Error(t('settings.theme_exists', { name: theme.name }));
      }

      // Add to custom themes
      const newCustomThemes = [...localSettings.customThemes, theme];
      setLocalSettings({
        ...localSettings,
        customThemes: newCustomThemes,
        themeName: theme.name,
        theme: theme.type // Auto switch mode
      });
    } catch (err) {
      console.error(`Failed to process theme from ${source}:`, err);

      throw err;
    }
  };

  const handleImportFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Theme Files',
          extensions: ['json', 'itermcolors']
        }]
      });

      if (selected && typeof selected === 'string') {
        const content = await readTextFile(selected);
        await processThemeContent(content, 'file');
      }
    } catch (err) {
      console.error('Failed to import theme file:', err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error(t('settings.theme_import_failed', { error: (err as any).toString() }));
    }
  };

  const handleDeleteTheme = (themeName: string) => {
    const newCustomThemes = localSettings.customThemes.filter(t => t.name !== themeName);

    // If deleting currently selected theme, switch to default
    let newThemeName = localSettings.themeName;
    let newThemeType = localSettings.theme;

    if (localSettings.themeName === themeName) {
      newThemeName = presets[0].name; // Usually Nord
      newThemeType = presets[0].type;
    }

    setLocalSettings({
      ...localSettings,
      customThemes: newCustomThemes,
      themeName: newThemeName,
      theme: newThemeType
    });
  };

  const allThemes = [...presets, ...localSettings.customThemes];

  return (
    <div className="relative h-full w-full pointer-events-none">
      {/* Backdrop - covers content area below title bar, allows drag through title bar area */}
      {isOpen && (
        <div className="absolute top-10 right-0 bottom-0 left-0 bg-black/30 z-40 pointer-events-auto" onClick={onClose} />
      )}
      
      {/* Settings Panel - compact design, 420px width */}
      <div className={cn(
        "absolute top-10 right-0 h-[calc(100%-40px)] w-[420px] bg-term-bg border-l border-term-selection z-[51] transform transition-transform duration-300 ease-in-out pointer-events-auto",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Header - compact */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-term-selection flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-term-selection/50 rounded-md">
                <Settings className="w-4 h-4 text-term-fg" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-term-fg">{t('settings.title', 'Settings')}</h2>
                <p className="text-[10px] text-term-fg/40">v{appVersion}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-term-selection/50 transition-colors text-term-fg/60 hover:text-term-fg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content - compact spacing */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Language */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-term-fg/70" />
                <label className="text-xs font-medium text-term-fg">{t('common.language', 'Language')}</label>
              </div>
              <div className="flex gap-1 p-0.5 bg-term-selection/20 rounded-md">
                <button
                  onClick={() => setLocalSettings({ ...localSettings, language: 'en' })}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-sm text-xs font-medium transition-all',
                    localSettings.language === 'en'
                      ? 'bg-term-blue text-term-bg shadow-sm'
                      : 'text-term-fg/60 hover:text-term-fg hover:bg-term-selection/30'
                  )}
                >
                  English
                </button>
                <button
                  onClick={() => setLocalSettings({ ...localSettings, language: 'zh' })}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-sm text-xs font-medium transition-all',
                    localSettings.language === 'zh'
                      ? 'bg-term-blue text-term-bg shadow-sm'
                      : 'text-term-fg/60 hover:text-term-fg hover:bg-term-selection/30'
                  )}
                >
                  中文
                </button>
              </div>
            </div>

            {/* Theme Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-term-fg/70" />
                <label className="text-xs font-medium text-term-fg">{t('settings.theme_select', 'Theme')}</label>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                {allThemes.map((theme) => {
                  const isCustom = localSettings.customThemes.some(t => t.name === theme.name);
                  const isSelected = localSettings.themeName === theme.name;
                  return (
                    <button
                      key={theme.name}
                      onClick={() => handlePreviewTheme(theme.name, theme.type)}
                      className={cn(
                        "group flex items-center gap-1.5 p-2 rounded-md border transition-all text-left",
                        isSelected
                          ? 'border-term-blue bg-term-selection/20 ring-1 ring-term-blue'
                          : 'border-term-selection/50 hover:border-term-selection hover:bg-term-selection/10'
                      )}
                    >
                      <div className="flex gap-0.5">
                        <div 
                          className="w-1.5 h-1.5 rounded-full" 
                          style={{ backgroundColor: theme.colors.background }}
                        />
                        <div 
                          className="w-1.5 h-1.5 rounded-full" 
                          style={{ backgroundColor: theme.colors.foreground }}
                        />
                        <div 
                          className="w-1.5 h-1.5 rounded-full" 
                          style={{ backgroundColor: theme.colors.blue }}
                        />
                      </div>
                      <span className="text-xs text-term-fg flex-1 truncate">{theme.name}</span>
                      {isCustom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTheme(theme.name);
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-term-fg/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          title={t('common.delete', 'Delete')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Import Theme */}
            <div className="space-y-2">
              <label className="text-xs text-term-fg/70 block">{t('settings.import_theme', 'Import Theme')}</label>
              <div className="flex gap-1.5">
                <input
                  type="url"
                  placeholder={t('settings.url_placeholder', 'https://example.com/theme.json')}
                  className="flex-1 bg-term-selection border border-term-selection rounded-md px-2.5 py-1.5 text-xs text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue placeholder-term-fg/20"
                  onChange={async (e) => {
                    if (e.target.value) {
                      try {
                        const content = await invoke<string>('fetch_url', { url: e.target.value });
                        await processThemeContent(content, 'url');
                        e.target.value = '';
                      } catch (err) {
                        console.error('Import failed:', err);
                      }
                    }
                  }}
                />
                <button
                  onClick={handleImportFile}
                  className="px-3 py-1.5 bg-term-selection hover:bg-term-selection/80 rounded-md text-term-fg transition-colors text-xs"
                >
                  {t('common.browse', 'Browse')}
                </button>
              </div>
            </div>

            {/* Terminal Settings */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-term-selection/30 rounded-sm">
                  <Monitor className="w-3.5 h-3.5 text-term-fg/70" />
                </div>
                <label className="text-xs font-medium text-term-fg">{t('settings.terminal', 'Terminal')}</label>
              </div>
              
              <div className="space-y-2 pl-6">
                {/* Font Size */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-term-fg/70">{t('settings.font_size', 'Font Size')}</label>
                    <span className="text-xs font-mono text-term-fg/60">{localSettings.terminalFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="24"
                    step="1"
                    value={localSettings.terminalFontSize}
                    onChange={(e) => setLocalSettings({ ...localSettings, terminalFontSize: Number(e.target.value) })}
                    className="w-full accent-term-blue h-1 bg-term-selection/50 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Line Height */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-term-fg/70">{t('settings.line_height', 'Line Height')}</label>
                    <span className="text-xs font-mono text-term-fg/60">{localSettings.terminalLineHeight}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="2"
                    step="0.1"
                    value={localSettings.terminalLineHeight}
                    onChange={(e) => setLocalSettings({ ...localSettings, terminalLineHeight: Number(e.target.value) })}
                    className="w-full accent-term-blue h-1 bg-term-selection/50 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Mouse Settings */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-term-selection/30 rounded-sm">
                  <MousePointer2 className="w-3.5 h-3.5 text-term-fg/70" />
                </div>
                <label className="text-xs font-medium text-term-fg">{t('settings.mouse', 'Mouse')}</label>
              </div>
              
              <div className="space-y-1.5 pl-6">
                <label className="text-xs text-term-fg/70 block">{t('settings.right_click', 'Right Click')}</label>
                <div className="flex gap-1 p-0.5 bg-term-selection/20 rounded-md">
                  <button
                    onClick={() => setLocalSettings({ ...localSettings, rightClickBehavior: 'menu' })}
                    className={cn(
                      'flex-1 py-1.5 px-2 rounded-sm text-xs font-medium transition-all',
                      localSettings.rightClickBehavior === 'menu'
                        ? 'bg-term-blue text-term-bg shadow-sm'
                        : 'text-term-fg/60 hover:text-term-fg hover:bg-term-selection/30'
                    )}
                  >
                    {t('settings.behavior_menu', 'Menu')}
                  </button>
                  <button
                    onClick={() => setLocalSettings({ ...localSettings, rightClickBehavior: 'paste' })}
                    className={cn(
                      'flex-1 py-1.5 px-2 rounded-sm text-xs font-medium transition-all',
                      localSettings.rightClickBehavior === 'paste'
                        ? 'bg-term-blue text-term-bg shadow-sm'
                        : 'text-term-fg/60 hover:text-term-fg hover:bg-term-selection/30'
                    )}
                  >
                    {t('settings.behavior_paste', 'Paste')}
                  </button>
                </div>
              </div>
            </div>

            {/* Editor Options */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-term-selection/30 rounded-sm">
                  <Code2 className="w-3.5 h-3.5 text-term-fg/70" />
                </div>
                <label className="text-xs font-medium text-term-fg">{t('settings.editor', 'Editor')}</label>
              </div>
              
              <div className="space-y-1 pl-6">
                <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-md hover:bg-term-selection/20 transition-colors">
                  <input
                    type="checkbox"
                    checked={localSettings.editorMinimap}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, editorMinimap: e.target.checked })
                    }
                    className="w-3.5 h-3.5 accent-term-blue"
                  />
                  <span className="text-xs text-term-fg">{t('settings.minimap', 'Minimap')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-md hover:bg-term-selection/20 transition-colors">
                  <input
                    type="checkbox"
                    checked={localSettings.editorWordWrap}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, editorWordWrap: e.target.checked })
                    }
                    className="w-3.5 h-3.5 accent-term-blue"
                  />
                  <span className="text-xs text-term-fg">{t('settings.word_wrap', 'Word Wrap')}</span>
                </label>
              </div>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-term-selection/30 rounded-md">
                  <Keyboard className="w-4 h-4 text-term-fg/70" />
                </div>
                <label className="text-sm font-medium text-term-fg">{t('shortcuts.title', 'Keyboard Shortcuts')}</label>
              </div>
              <div className="mt-3 pl-7">
                <ShortcutsSettings />
              </div>
            </div>
          </div>

          {/* Footer - compact */}
          <div className="px-4 py-3 border-t border-term-selection flex-shrink-0">
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-3 py-2 bg-term-selection hover:bg-term-selection/80 rounded-md text-term-fg text-xs font-medium transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-3 py-2 bg-term-blue hover:bg-term-blue/80 rounded-md text-term-bg text-xs font-medium transition-colors shadow-sm"
              >
                {t('common.save', 'Save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}