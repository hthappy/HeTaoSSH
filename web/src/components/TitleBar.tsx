import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TitleBarProps {
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export function TitleBar({ children, actions }: TitleBarProps) {
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
  }, []);

  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };

  return (
    <div className="h-10 flex-shrink-0 flex items-center justify-between bg-term-bg border-b border-term-selection select-none">
      {/* Left Area: Logo & Title (Drag Region) */}
      <div data-tauri-drag-region className="flex items-center gap-2 px-3 h-full flex-shrink-0">
        <Monitor className="w-4 h-4 text-term-blue" />
        <span className="text-xs font-medium text-term-fg/80 hidden sm:inline">HeTaoSSH</span>
      </div>

      {/* Center Area: Tabs (Not Drag Region) */}
      <div className="flex items-center h-full overflow-hidden max-w-[calc(100vw-300px)]">
        {children}
      </div>

      {/* Spacer (Drag Region) */}
      <div data-tauri-drag-region className="flex-1 h-full min-w-[20px]" />

      {/* Right Area: Actions & Window Controls */}
      <div className="flex h-full relative z-50">
        {/* Custom Actions (Settings, etc.) */}
        {actions && (
          <div className="flex items-center h-full mr-2">
            {actions}
          </div>
        )}
        
        {/* Window Controls */}
        <button 
          onClick={() => appWindow.minimize()}
          className="inline-flex items-center justify-center w-10 h-full hover:bg-term-selection text-term-fg transition-colors"
          title="Minimize"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button 
          onClick={handleMaximize}
          className="inline-flex items-center justify-center w-10 h-full hover:bg-term-selection text-term-fg transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          <Square className={cn("w-3.5 h-3.5", isMaximized && "fill-current opacity-50")} />
        </button>
        <button 
          onClick={() => appWindow.close()}
          className="inline-flex items-center justify-center w-10 h-full hover:bg-red-500 hover:text-white text-term-fg transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
