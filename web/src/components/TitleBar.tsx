import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';

export interface TitleBarProps {
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export function TitleBar({ children, actions }: TitleBarProps) {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const updateState = async () => {
      try {
        setIsMaximized(await appWindow.isMaximized());
      } catch (e) {
        console.error('Failed to get window state', e);
      }
    };
    updateState();

    // Listen for resize events to update maximized state
    // Note: Tauri v2 might handle listeners differently, checking docs/patterns
    // For now we just check on mount and click. Real-time resize listener might need setup.
    const checkInterval = setInterval(updateState, 1000);
    return () => clearInterval(checkInterval);
  }, [appWindow]);

  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };

  return (
    <div className="h-10 flex-shrink-0 flex items-center justify-between bg-term-bg border-b border-term-selection select-none">
      <div className="flex items-center gap-1 px-3 h-full">
        <button 
          onClick={() => appWindow.minimize()}
          className="w-3 h-3 rounded-full bg-term-yellow hover:bg-yellow-500 transition-colors"
          title={t('common.minimize')}
        />
        <button 
          onClick={handleMaximize}
          className="w-3 h-3 rounded-full bg-term-green hover:bg-green-500 transition-colors"
          title={isMaximized ? t('common.restore') : t('common.maximize')}
        />
        <button 
          onClick={() => appWindow.close()}
          className="w-3 h-3 rounded-full bg-term-red hover:bg-red-500 transition-colors"
          title={t('common.close')}
        />
      </div>

      <div data-tauri-drag-region className="flex items-center gap-2 h-full overflow-hidden flex-1 mx-4">
        <Monitor className="w-4 h-4 text-term-blue flex-shrink-0" />
        <span className="text-xs font-medium text-term-fg/80 flex-shrink-0">HeTaoSSH</span>
        {children}
      </div>

      <div className="flex h-full relative z-50 mr-2">
        {actions}
      </div>
    </div>
  );
}
