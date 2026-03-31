import { useState } from 'react';
import { Palette, Download, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ThemeSchema } from '@/types/theme';

interface ThemeMarketProps {
  customThemes: ThemeSchema[];
  onImportTheme: (theme: ThemeSchema) => void;
  onExportTheme?: (theme: ThemeSchema) => void;
}

export function ThemeMarket({ customThemes, onImportTheme }: ThemeMarketProps) {
  const { t } = useTranslation();
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

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

        {customThemes.length === 0 && (
          <div className="text-center py-6 text-term-fg/40">
            <p className="text-sm">{t('settings.theme_market.no_custom', 'No custom themes yet')}</p>
            <p className="text-xs mt-1">{t('settings.theme_market.import_hint', 'Import a theme file to get started')}</p>
          </div>
        )}

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
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  handleExport(theme);
                  setSelectedTheme(theme.name);
                  setTimeout(() => setSelectedTheme(null), 2000);
                }}
                className="p-2 rounded hover:bg-term-blue/20 text-term-blue"
                title={t('common.export', 'Export')}
              >
                <Download className="w-4 h-4" />
              </button>
              {selectedTheme === theme.name && (
                <span className="text-xs text-term-green">{t('common.exported', 'Exported!')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
