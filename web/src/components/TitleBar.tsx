import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { Monitor, Minus, Square, X } from 'lucide-react';

export interface TitleBarProps {
  children?: React.ReactNode;
}

export function TitleBar({ children }: TitleBarProps) {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsMac(userAgent.includes('mac'));
  }, []);

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

  const handleDoubleClick = async () => {
    // Double click to maximize/restore
    await handleMaximize();
  };

  return (
    <div 
      data-tauri-drag-region
      className="h-10 flex-shrink-0 flex items-center justify-between bg-term-bg border-b border-term-selection select-none drag"
    >
      {/* Left: App Icon + Title */}
      <div 
        data-tauri-drag-region
        onDoubleClick={handleDoubleClick}
        className="flex items-center gap-2 px-3 h-full flex-shrink-0 drag"
      >
        <Monitor className="w-4 h-4 text-term-blue flex-shrink-0" />
        <span className="text-xs font-medium text-term-fg/80 flex-shrink-0">HeTaoSSH</span>
      </div>

      {/* Center: Tabs - Container is draggable, only tab elements are not */}
      <div className="flex-1 min-w-0 px-2 h-full flex items-center overflow-hidden drag-region">
        {children}
      </div>

      {/* Right: Window Controls */}
      <div className="flex h-full flex-shrink-0 no-drag">
        {isMac ? (
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
        ) : (
          <div className="flex h-full">
            <button 
              onClick={() => appWindow.minimize()}
              className="w-11 h-full hover:bg-term-selection flex items-center justify-center text-term-fg transition-colors"
              title={t('common.minimize')}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button 
              onClick={handleMaximize}
              className="w-11 h-full hover:bg-term-selection flex items-center justify-center text-term-fg transition-colors"
              title={isMaximized ? t('common.restore') : t('common.maximize')}
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => appWindow.close()}
              className="w-11 h-full hover:bg-red-500 hover:text-white flex items-center justify-center text-term-fg transition-colors"
              title={t('common.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
