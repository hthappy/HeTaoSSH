import { useState, useEffect } from 'react';
import { Palette, Download, Upload, Cloud, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ThemeSchema } from '@/types/theme';

interface ThemeMarketProps {
  customThemes: ThemeSchema[];
  onImportTheme: (theme: ThemeSchema) => void;
  onExportTheme?: (theme: ThemeSchema) => void;
}

interface RemoteTheme {
  id: string;
  name: string;
  author: string;
  downloads: number;
  theme: ThemeSchema;
}

export function ThemeMarket({ customThemes, onImportTheme }: ThemeMarketProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('local');
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [remoteThemes, setRemoteThemes] = useState<RemoteTheme[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'cloud') {
      loadRemoteThemes();
    }
  }, [activeTab]);

  const loadRemoteThemes = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://api.example.com/themes');
      if (response.ok) {
        const data = await response.json();
        setRemoteThemes(data);
      }
    } catch (e) {
      console.error('Failed to load remote themes:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        try {
          const theme = JSON.parse(text) as ThemeSchema;
          if (theme.name && theme.colors) {
            onImportTheme(theme);
          }
        } catch (err) {
          console.error('Invalid theme file:', err);
        }
      }
    };
    input.click();
  };

  const handleExport = (theme: ThemeSchema) => {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${theme.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-term-fg mb-4">
        <Palette className="w-5 h-5" />
        <h3 className="text-lg font-semibold">{t('settings.theme_market.title', 'Theme Market')}</h3>
      </div>

      <div className="flex gap-2 border-b border-term-selection">
        <button
          onClick={() => setActiveTab('local')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'local'
              ? 'text-term-blue border-b-2 border-term-blue'
              : 'text-term-fg/60 hover:text-term-fg'
          )}
        >
          {t('settings.theme_market.local', 'Local Themes')} ({customThemes.length})
        </button>
        <button
          onClick={() => setActiveTab('cloud')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'cloud'
              ? 'text-term-blue border-b-2 border-term-blue'
              : 'text-term-fg/60 hover:text-term-fg'
          )}
        >
          {t('settings.theme_market.cloud', 'Cloud Themes')}
        </button>
      </div>

      {activeTab === 'local' ? (
        <div className="space-y-3">
          <button
            onClick={handleImport}
            className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-term-selection/50 rounded-lg hover:border-term-blue/50 hover:bg-term-blue/5 transition-colors"
          >
            <Upload className="w-5 h-5 text-term-fg/60" />
            <span className="text-sm text-term-fg/60">
              {t('settings.theme_market.import', 'Import Theme')}
            </span>
          </button>

          {customThemes.map((theme) => (
            <div
              key={theme.name}
              className="flex items-center justify-between p-3 bg-term-selection/10 rounded-lg border border-term-selection/30"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-8 rounded border border-term-selection"
                  style={{
                    background: `linear-gradient(135deg, ${theme.colors.background} 50%, ${theme.colors.foreground} 50%)`,
                  }}
                />
                <div>
                  <div className="text-sm text-term-fg font-medium">{theme.name}</div>
                  <div className="text-xs text-term-fg/40">
                    {t('settings.theme_market.custom', 'Custom Theme')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleExport(theme)}
                className="p-2 rounded hover:bg-term-blue/20 text-term-blue"
                title={t('common.export', 'Export')}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-term-fg/40">
              <Cloud className="w-8 h-8 animate-pulse mx-auto mb-2" />
              <p className="text-sm">{t('settings.theme_market.loading', 'Loading themes...')}</p>
            </div>
          ) : remoteThemes.length === 0 ? (
            <div className="text-center py-8 text-term-fg/40">
              <Cloud className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">{t('settings.theme_market.no_cloud', 'No cloud themes available')}</p>
            </div>
          ) : (
            remoteThemes.map((remote) => (
              <div
                key={remote.id}
                className="flex items-center justify-between p-3 bg-term-selection/10 rounded-lg border border-term-selection/30"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="w-12 h-8 rounded border border-term-selection"
                    style={{
                      background: `linear-gradient(135deg, ${remote.theme.colors.background} 50%, ${remote.theme.colors.foreground} 50%)`,
                    }}
                  />
                  <div className="flex-1">
                    <div className="text-sm text-term-fg font-medium">{remote.name}</div>
                    <div className="text-xs text-term-fg/40">
                      {t('settings.theme_market.by', 'by')} {remote.author} • {remote.downloads} {t('settings.theme_market.downloads', 'downloads')}
                    </div>
                  </div>
                </div>
                {selectedTheme === remote.id ? (
                  <button className="p-2 rounded bg-term-green/20 text-term-green">
                    <Check className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onImportTheme(remote.theme);
                      setSelectedTheme(remote.id);
                    }}
                    className="p-2 rounded hover:bg-term-blue/20 text-term-blue"
                    title={t('common.download', 'Download')}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
