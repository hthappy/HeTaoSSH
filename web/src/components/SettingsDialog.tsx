import { useState, useEffect } from 'react';
import { Globe, Palette, Upload, Trash2, Keyboard, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { presets } from '../themes/presets';
import { ThemeSchema } from '../types/theme';
import { ShortcutsSettings, type ShortcutConfig } from './ShortcutsSettings';

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
  shortcuts?: ShortcutConfig[];
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
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(console.error);
  }, []);

  // Sync local settings when settings prop changes or dialog opens
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  // Preview theme when selection changes
  useEffect(() => {
    if (isOpen && onPreviewTheme) {
      const allThemes = [...presets, ...localSettings.customThemes];
      const selectedTheme = allThemes.find(t => t.name === localSettings.themeName);
      if (selectedTheme) {
        onPreviewTheme(selectedTheme);
      }
    }
  }, [localSettings.themeName, localSettings.customThemes, isOpen, onPreviewTheme]);

  // Clear messages when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setImportError(null);
      setImportSuccess(null);
      setImportUrl('');
      setIsImporting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    // Change language immediately if changed
    if (localSettings.language !== i18n.language) {
      i18n.changeLanguage(localSettings.language);
    }
    onClose();
  };

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
            type: 'dark', // Default to dark for Gogh themes
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
          throw new Error(t('settings.html_content_error'));
        }
        
        // Only try backend parsing if it wasn't a JSON parse error (which we handled above)
        // or if we explicitly threw 'Invalid theme JSON'
        if (e instanceof Error && e.message === 'Invalid theme JSON') {
             // If JSON fails, try iTerm2 via backend
             theme = await invoke<ThemeSchema>('parse_theme', { content });
        } else {
             // If it was a syntax error in JSON.parse, it might be an iTerm2 XML file
             theme = await invoke<ThemeSchema>('parse_theme', { content });
        }
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
      setImportSuccess(t('settings.theme_imported'));
      setImportUrl('');
    } catch (err) {
      console.error(`Failed to process theme from ${source}:`, err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setImportError(t('settings.theme_import_failed', { error: (err as any).toString() }));
    }
  };

  const convertGithubUrl = (url: string): string => {
    // Handle refs/heads in raw URLs (common mistake)
    // e.g. https://raw.githubusercontent.com/user/repo/refs/heads/branch/path -> https://raw.githubusercontent.com/user/repo/branch/path
    if (url.startsWith('https://raw.githubusercontent.com/') && url.includes('/refs/heads/')) {
      return url.replace('/refs/heads/', '/');
    }

    // Convert github.com/user/repo/blob/... to raw.githubusercontent.com/user/repo/...
    const githubRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/;
    const match = url.match(githubRegex);
    if (match) {
      const [, user, repo, branch, path] = match;
      return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`;
    }
    return url;
  };

  const handleImportUrl = async () => {
    if (!importUrl) return;
    
    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const finalUrl = convertGithubUrl(importUrl);
      const content = await invoke<string>('fetch_url', { url: finalUrl });
      await processThemeContent(content, 'URL');
    } catch (err) {
      console.error('Failed to fetch theme:', err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setImportError(t('settings.url_import_failed', { error: (err as any).toString() }));
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFile = async () => {
    try {
      setImportError(null);
      setImportSuccess(null);
      
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
      setImportError(t('settings.theme_import_failed', { error: (err as any).toString() }));
    }
  };

  const handleDeleteTheme = (themeName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t('settings.delete_theme_confirm', { name: themeName }))) {
      return;
    }

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-term-bg rounded-lg border border-term-selection w-full max-w-lg p-6 flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-2 mb-6 flex-shrink-0 justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-term-fg/60" />
            <h2 className="text-lg font-semibold text-term-fg">{t('settings.title')}</h2>
          </div>
          <span className="text-xs text-term-fg/40">v{appVersion}</span>
        </div>

        <div className="space-y-6 overflow-y-auto pr-2 flex-1">
          {/* Language */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-term-fg/60" />
              <label className="text-sm font-medium text-term-fg">{t('common.language')}</label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setLocalSettings({ ...localSettings, language: 'en' })}
                className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
                  localSettings.language === 'en'
                    ? 'bg-term-blue text-term-bg font-medium'
                    : 'bg-term-selection text-term-fg/60 hover:text-term-fg'
                }`}
              >
                English
              </button>
              <button
                onClick={() => setLocalSettings({ ...localSettings, language: 'zh' })}
                className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
                  localSettings.language === 'zh'
                    ? 'bg-term-blue text-term-bg font-medium'
                    : 'bg-term-selection text-term-fg/60 hover:text-term-fg'
                }`}
              >
                中文
              </button>
            </div>
          </div>

          {/* Theme Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-term-fg/60" />
                <label className="text-sm font-medium text-term-fg">{t('settings.theme_select')}</label>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {allThemes.map((theme) => {
                const isCustom = localSettings.customThemes.some(t => t.name === theme.name);
                return (
                  <button
                    key={theme.name}
                    onClick={() => setLocalSettings({ 
                      ...localSettings, 
                      themeName: theme.name,
                      theme: theme.type 
                    })}
                    className={`
                      relative p-3 rounded-lg border text-left transition-all group
                      ${localSettings.themeName === theme.name 
                        ? 'border-term-selection bg-term-selection/20 ring-1 ring-term-selection' 
                        : 'border-term-selection/50 hover:border-term-selection hover:bg-term-selection/10'}
                    `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm text-term-fg">{theme.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.colors.background }} />
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.colors.foreground }} />
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.colors.blue }} />
                        </div>
                        {isCustom && (
                          <div
                            onClick={(e) => handleDeleteTheme(theme.name, e)}
                            className="p-1 rounded hover:bg-term-red/20 text-term-fg/40 hover:text-term-red transition-colors opacity-0 group-hover:opacity-100"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            
            <div className="mt-4 pt-4 border-t border-term-selection/50">
              <label className="text-xs font-medium text-term-fg/70 mb-2 block">{t('settings.import_theme')}</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder={t('settings.url_placeholder')}
                  className="flex-1 bg-term-bg border border-term-selection rounded px-3 py-1.5 text-sm text-term-fg focus:outline-none focus:border-term-blue"
                />
                <button
                  onClick={handleImportUrl}
                  disabled={!importUrl || isImporting}
                  className="px-3 py-1.5 bg-term-selection hover:bg-term-selection/80 text-term-fg rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isImporting ? (
                    <div className="w-4 h-4 border-2 border-term-fg/30 border-t-term-fg rounded-full animate-spin" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                  {t('settings.import_url')}
                </button>
              </div>
              <button
                onClick={handleImportFile}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-term-selection rounded-lg hover:bg-term-selection/10 text-term-fg/70 hover:text-term-fg transition-colors text-sm"
              >
                <Upload className="w-4 h-4" />
                {t('settings.import_placeholder')}
              </button>
            </div>

            {importSuccess && (
              <p className="mt-2 text-xs text-term-green">{importSuccess}</p>
            )}
            {importError && (
              <p className="mt-2 text-xs text-term-red">{importError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Font Size */}
            <div>
              <label className="text-xs text-term-fg/60 mb-1.5 block">{t('settings.font_size')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="10"
                  max="24"
                  step="1"
                  value={localSettings.terminalFontSize}
                  onChange={(e) => setLocalSettings({ ...localSettings, terminalFontSize: Number(e.target.value) })}
                  className="flex-1 accent-term-blue h-1 bg-term-selection rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-mono w-8 text-right text-term-fg">{localSettings.terminalFontSize}px</span>
              </div>
            </div>

            {/* Line Height */}
            <div>
              <label className="text-xs text-term-fg/60 mb-1.5 block">{t('settings.line_height')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="2"
                  step="0.1"
                  value={localSettings.terminalLineHeight}
                  onChange={(e) => setLocalSettings({ ...localSettings, terminalLineHeight: Number(e.target.value) })}
                  className="flex-1 accent-term-blue h-1 bg-term-selection rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-mono w-8 text-right text-term-fg">{localSettings.terminalLineHeight}</span>
              </div>
            </div>
          </div>

          {/* Right Click Behavior */}
          <div className="pt-2">
             <label className="text-xs text-term-fg/60 mb-1.5 block">{t('settings.right_click')}</label>
             <div className="flex gap-2 bg-term-bg border border-term-selection p-1 rounded-lg">
                <button
                  onClick={() => setLocalSettings({ ...localSettings, rightClickBehavior: 'menu' })}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs transition-all ${
                    localSettings.rightClickBehavior === 'menu'
                      ? 'bg-term-selection text-term-fg font-medium shadow-sm'
                      : 'text-term-fg/40 hover:text-term-fg/70'
                  }`}
                >
                  {t('settings.behavior_menu')}
                </button>
                <button
                  onClick={() => setLocalSettings({ ...localSettings, rightClickBehavior: 'paste' })}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs transition-all ${
                    localSettings.rightClickBehavior === 'paste'
                      ? 'bg-term-selection text-term-fg font-medium shadow-sm'
                      : 'text-term-fg/40 hover:text-term-fg/70'
                  }`}
                >
                  {t('settings.behavior_paste')}
                </button>
             </div>
             <p className="text-[10px] text-term-fg/40 mt-1.5 px-1">
                {localSettings.rightClickBehavior === 'paste' 
                  ? t('settings.smart_behavior') 
                  : t('settings.standard_behavior')}
              </p>
          </div>

          {/* Editor Options */}
          <div>
            <label className="text-sm font-medium text-term-fg mb-3 block">{t('settings.editor')}</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.editorMinimap}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, editorMinimap: e.target.checked })
                  }
                  className="accent-term-blue"
                />
                <span className="text-sm text-term-fg">{t('settings.minimap')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.editorWordWrap}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, editorWordWrap: e.target.checked })
                  }
                  className="accent-term-blue"
                />
                <span className="text-sm text-term-fg">{t('settings.word_wrap')}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-term-selection">
          <div className="flex items-center gap-2 mb-3">
            <Keyboard className="w-4 h-4 text-term-fg/60" />
            <label className="text-sm font-medium text-term-fg">{t('settings.shortcuts_title', 'Keyboard Shortcuts')}</label>
          </div>
          <ShortcutsSettings
            shortcuts={localSettings.shortcuts || []}
            onSave={(shortcuts) => setLocalSettings({ ...localSettings, shortcuts })}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-term-selection flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-term-selection hover:bg-term-selection/80 rounded-md text-term-fg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-term-blue hover:bg-term-blue/80 rounded-md text-term-bg font-medium transition-colors"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
