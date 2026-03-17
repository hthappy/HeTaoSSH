import { ServerList, type ServerListHandle } from '@/components/ServerList';
import { TerminalArea } from '@/components/TerminalArea';
import { RemoteFiles } from '@/components/RemoteFiles';
import { FileTree } from '@/components/FileTree';
import { ResizeHandle } from '@/components/ResizeHandle';
import { StatusBar } from '@/components/StatusBar';
import { SettingsDialog, type AppSettings } from '@/components/SettingsDialog';
import { ActivityBar, type Activity } from '@/components/ActivityBar';
import { CommandSnippets } from '@/components/CommandSnippets';
import { useSshStore } from '@/stores/ssh-store';
import { Terminal, X, FileCode2, Plus, Loader2 } from 'lucide-react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import { cn } from '@/lib/utils';
import { ToastProvider } from '@/components/Toast';
import { UpdateDialog } from '@/components/UpdateDialog';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { presets, nordTheme } from '@/themes/presets';
import { TitleBar } from '@/components/TitleBar';
import logo from '@/assets/logo.png';

import { ThemeSchema } from '@/types/theme';

function App() {
  const { t, i18n } = useTranslation();
  const { 
    servers,
    connectServer, 
    workspaceTabs, 
    activeTabId, 
    setActiveTab, 
    closeTab,
    connections,
    openFileTab,
    sendToTerminal,
    createLocalTerminal
  } = useSshStore();
  
  const [showSettings, setShowSettings] = useState(false);
  const [activeActivity, setActiveActivity] = useState<Activity>('hosts');
  const [sidebarWidth, setSidebarWidth] = useState(240); // Sidebar width (px)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [previewTheme, setPreviewTheme] = useState<ThemeSchema | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const serverListRef = useRef<ServerListHandle>(null);
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Check for updates on startup
  useEffect(() => {
    // Disable global context menu
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener('contextmenu', handleGlobalContextMenu);
    
    return () => {
      window.removeEventListener('contextmenu', handleGlobalContextMenu);
    };
  }, []);

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update?.available) {
          setUpdateAvailable(update);
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    checkForUpdates();
  }, [t]);
  
  // Check window maximized state for border removal
  useEffect(() => {
    const win = getCurrentWindow();
    const checkMaximized = async () => {
      try {
        setIsMaximized(await win.isMaximized());
      } catch (e) {
        console.error('Failed to check window state', e);
      }
    };
    
    checkMaximized();
    // Poll for state changes as resize event might not be reliable for maximize toggle
    const interval = setInterval(checkMaximized, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('HeTaoSSH_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          rightClickBehavior: parsed.rightClickBehavior || 'menu',
        };
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }
    return {
      language: i18n.language || 'en',
      theme: 'dark',
      themeName: nordTheme.name,
      customThemes: [],
      terminalFontSize: 14,
      terminalLineHeight: 1.2,
      editorMinimap: false,
      editorWordWrap: true,
      rightClickBehavior: 'menu',
    };
  });

  // Persist settings
  useEffect(() => {
    localStorage.setItem('HeTaoSSH_settings', JSON.stringify(settings));
  }, [settings]);

  // Sync language on mount/change
  useEffect(() => {
    if (settings.language && settings.language !== i18n.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings.language, i18n]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent F5 and Ctrl+R/Cmd+R (Reload)
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
        e.preventDefault();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        createLocalTerminal().catch(console.error);
        return;
      }

      // Ctrl+N: New Connection
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setActiveActivity('hosts');
        setIsSidebarOpen(true);
        setTimeout(() => serverListRef.current?.openAddDialog(), 50);
      }
      // Ctrl+,: Settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Resolve current theme object
  const currentTheme = useMemo(() => {
    if (previewTheme) return previewTheme;
    return [...presets, ...settings.customThemes].find(t => t.name === settings.themeName) || nordTheme;
  }, [settings.themeName, settings.customThemes, previewTheme]);

  // Apply theme (inject CSS variables and get xterm theme)
  const xtermTheme = useTheme(currentTheme);

  const handleSidebarWidthResize = useCallback((delta: number) => {
    setSidebarWidth(prev => {
      const next = prev + delta;
      // If dragged too small (< 100px), close sidebar
      if (next < 50) {
        // Use setTimeout to avoid state update during render phase
        setTimeout(() => {
          setIsSidebarOpen(false);
          setSidebarWidth(240); // Reset to default width
        }, 0);
        return 240;
      }
      return Math.min(next, 500);
    });
  }, []);

  const handleServerClick = (serverId: number) => {
    connectServer(serverId);
  };

  const activeTab = workspaceTabs.find(t => t.id === activeTabId);
  const activeConnection = connections.find(c => c.serverId === activeTab?.serverId);
  const activeServer = servers.find(s => s.id === activeTab?.serverId);

  const displayServerName = useMemo(() => {
    if (!activeTab) return t('terminal.disconnected');
    
    // 如果是本地终端或本地文件
    if (activeTab.type === 'local' || activeTab.isLocal) {
      return t('common.new_local_terminal').replace('新建', ''); // 或直接返回 'Local Terminal' / 本地终端
    }
    
    // 如果是远程服务器，返回服务器名称
    if (activeServer) {
      return activeServer.name;
    }
    
    // 默认回退（如未匹配到 server）
    return activeTab.title;
  }, [activeTab, activeServer, t]);

  const handleFileSelect = (path: string) => {
    if (activeTab?.serverId) {
       const fileName = path.split('/').pop() || path;
       openFileTab(activeTab.serverId, path, fileName);
    }
  };

  const handleActivityChange = (activity: Activity) => {
    if (activeActivity === activity) {
      setIsSidebarOpen(!isSidebarOpen);
    } else {
      setActiveActivity(activity);
      setIsSidebarOpen(true);
    }
  };

  return (
    <ToastProvider>
      <div className={cn(
        "flex flex-col h-screen bg-term-bg overflow-hidden transition-colors duration-300",
        !isMaximized && "border border-term-selection rounded-lg"
      )}>
        <div className="flex-1 flex overflow-hidden">
          {/* Activity Bar */}
          <ActivityBar 
            activeActivity={activeActivity} 
            onActivityChange={handleActivityChange} 
            onSettingsClick={() => setShowSettings(true)}
          />

          {/* Sidebar Area */}
          <div 
            className={cn(
              "flex flex-col border-r border-term-selection flex-shrink-0 bg-term-bg relative",
              !isResizingSidebar && "transition-[width] duration-300 ease-in-out",
              !isSidebarOpen && "w-0 border-r-0 overflow-hidden"
            )}
            style={{ width: isSidebarOpen ? sidebarWidth : 0 }}
          >
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {activeActivity === 'hosts' && (
                <ServerList 
                  ref={serverListRef} 
                  onServerClick={handleServerClick}
                  // Removed collapsed/onToggle props to keep it full view
                />
              )}
              {activeActivity === 'sftp' && (
                activeConnection ? (
                  <div className="flex flex-col h-full">
                    <div className="h-10 flex items-center px-3 text-sm font-semibold text-term-fg bg-term-bg flex-shrink-0">
                      {t('file.explorer')}
                    </div>
                    <div className="flex-1 overflow-auto">
                      {activeConnection.status === 'connected' ? (
                        <FileTree
                          tabId={activeConnection.isLocal 
                            ? `local-${activeConnection.serverId}` 
                            : `conn-${activeConnection.serverId}`}
                          onFileSelect={handleFileSelect}
                        />
                      ) : activeConnection.status === 'connecting' ? (
                        <div className="flex flex-col items-center justify-center h-full text-term-fg/40 p-4">
                          <Loader2 className="w-6 h-6 animate-spin mb-2" />
                          <p className="text-sm">{t('terminal.connecting', 'Connecting...')}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-term-fg/40 p-4 text-center">
                          <p className="mb-2 text-lg">⚠️</p>
                          <p>{t('terminal.disconnected', 'Disconnected')}</p>
                          {activeConnection.error && (
                            <p className="text-xs mt-2 text-red-400 max-w-[200px] break-words">
                              {activeConnection.error}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-term-fg/40 p-4 text-center">
                    <p className="mb-2 text-lg">🔌</p>
                    <p>{t('common.no_active_connection', 'No active connection')}</p>
                    <p className="text-xs mt-2 opacity-60">{t('common.select_server_first', 'Select a server to connect first')}</p>
                  </div>
                )
              )}
              {activeActivity === 'snippets' && (
                 <CommandSnippets onExecute={(cmd) => {
                    if (activeConnection) {
                        sendToTerminal(activeConnection.serverId, cmd);
                        // Maybe focus terminal?
                    } else {
                        // Show toast?
                        console.warn('No active connection to execute snippet');
                    }
                 }} />
              )}
            </div>
          </div>
            
          {/* Sidebar Resizer */}
          {isSidebarOpen && (
            <ResizeHandle 
              direction="horizontal" 
              onResize={handleSidebarWidthResize} 
              onResizeStart={() => setIsResizingSidebar(true)}
              onResizeEnd={() => {
                setIsResizingSidebar(false);
                // Snap back to min width if not closed
                setSidebarWidth(w => Math.max(180, w));
              }}
            />
          )}

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-term-bg relative">
            {/* Custom Title Bar with Tabs & Actions */}
            <TitleBar>
              {/* Workspace Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar px-2 flex-1 min-w-0">
                {workspaceTabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'group flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer border select-none min-w-0 flex-shrink',
                      activeTabId === tab.id
                        ? 'bg-term-selection text-term-fg border-term-selection'
                        : 'text-term-fg/60 hover:text-term-fg hover:bg-term-selection/50 border-transparent'
                    )}
                  >
                    {tab.type === 'terminal' ? (
                      <Terminal className="w-4 h-4 text-term-blue flex-shrink-0" />
                    ) : (
                      <FileCode2 className="w-4 h-4 text-term-yellow flex-shrink-0" />
                    )}
                    <span className="max-w-none truncate flex-1 min-w-0">{tab.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="flex-shrink-0 ml-1 p-0.5 rounded-sm text-foreground opacity-100 hover:text-white transition-all"
                      style={{ opacity: 1 }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                
                <button
                  onClick={() => createLocalTerminal().catch(console.error)}
                  className="p-1.5 ml-1 rounded-md text-term-fg/60 hover:text-term-fg hover:bg-term-selection/50 transition-colors flex-shrink-0"
                  title={t('common.new_local_terminal', 'Open Local Terminal')}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </TitleBar>

            {/* Tab Content */}
            <div className="flex-1 relative bg-term-bg">
              {workspaceTabs.map(tab => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    className={cn("absolute inset-0", !isActive && "hidden")}
                  >
                    {tab.type === 'terminal' || tab.type === 'local' ? (
                      <TerminalArea
                        serverId={tab.serverId!}
                        theme={xtermTheme}
                        fontSize={settings.terminalFontSize}
                        lineHeight={settings.terminalLineHeight}
                        rightClickBehavior={settings.rightClickBehavior}
                        isActive={isActive}
                      />
                    ) : (
                      <RemoteFiles
                        isActive={isActive}
                        tabId={tab.isLocal || (tab.serverId && tab.serverId < 0) ? `local-${tab.serverId}` : `conn-${tab.serverId}`}
                        filePath={tab.filePath!}
                        theme={xtermTheme}
                      />
                    )}
                  </div>
                );
              })}
              
              {workspaceTabs.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-term-fg/20 select-none">
                  <div className="w-16 h-16 mb-4 rounded-xl bg-term-selection/20 flex items-center justify-center">
                    <img src={logo} alt="Logo" className="w-10 h-10 opacity-20 grayscale" />
                  </div>
                  <p className="text-sm font-bold">HeTaoSSH</p>
                  <p className="text-xs mt-2">Press Ctrl+N to connect</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status Bar - Moved to bottom full width */}
        <StatusBar
          isConnected={!!activeConnection && activeConnection.status === 'connected'}
          serverName={displayServerName}
          tabId={activeConnection ? (activeConnection.isLocal ? `local-${activeConnection.serverId}` : `conn-${activeConnection.serverId}`) : undefined}
          latency={0}
        />

        <div className="absolute inset-0 pointer-events-none z-50">
          <div className={cn(
            "absolute inset-0 pointer-events-auto",
            showSettings ? "opacity-100" : "opacity-0 pointer-events-none"
          )}>
            <SettingsDialog
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
              settings={settings}
              onSave={setSettings}
              onPreviewTheme={setPreviewTheme}
            />
          </div>
        </div>

          <UpdateDialog
            isOpen={!!updateAvailable}
            version={updateAvailable?.version || ''}
            isUpdating={isUpdating}
            onUpdate={async () => {
              if (!updateAvailable) return;
              setIsUpdating(true);
              try {
                await updateAvailable.downloadAndInstall();
                await relaunch();
              } catch (e) {
                console.error(e);
                await message(
                  t('update.error', { error: String(e) }), 
                  { title: t('update.title'), kind: 'error' }
                );
                setIsUpdating(false);
              }
            }}
            onClose={() => setUpdateAvailable(null)}
          />
      </div>
    </ToastProvider>
  );
}

export default App;
