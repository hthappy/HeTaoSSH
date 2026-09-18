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
import { useShortcutsStore, matchesShortcut } from '@/stores/shortcuts-store';
import { Terminal, X, FileCode2, Plus, Loader2, ChevronDown } from 'lucide-react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import { cn } from '@/lib/utils';
import { ToastProvider, useToast } from '@/components/Toast';
import { UpdateDialog } from '@/components/UpdateDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { presets, nordTheme } from '@/themes/presets';
import { TitleBar } from '@/components/TitleBar';
import logo from '@/assets/logo.png';

import { ThemeSchema } from '@/types/theme';

function App() {
  const { t, i18n } = useTranslation();
  const { getKeys } = useShortcutsStore();
  const {
    servers,
    connectServer,
    workspaceTabs,
    activeTabId,
    setActiveTab,
    closeTab,
    connections,
    dirtyFiles,
    openFileTab,
    sendToTerminal,
    createLocalTerminal,
    splitPane,
    closePane,
    getActivePaneId
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
  // 待确认关闭的标签页（文件有未保存修改时先弹确认）
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);

  // 关闭标签页入口：文件标签有未保存修改时先弹确认框
  const requestCloseTab = useCallback((tabId: string) => {
    const tab = workspaceTabs.find((t) => t.id === tabId);
    if (tab?.type === 'file' && tab.filePath) {
      const connId = (tab.isLocal || (tab.serverId && tab.serverId < 0))
        ? `local-${tab.serverId}`
        : `conn-${tab.serverId}`;
      if (dirtyFiles[`${connId}|${tab.filePath}`]) {
        setPendingCloseTabId(tabId);
        return;
      }
    }
    closeTab(tabId);
  }, [workspaceTabs, dirtyFiles, closeTab]);

  const pendingCloseTab = pendingCloseTabId
    ? workspaceTabs.find((t) => t.id === pendingCloseTabId)
    : undefined;

  // Local terminal shell selection (Windows Terminal style dropdown)
  const [localShells, setLocalShells] = useState<{ id: string; name: string; available: boolean }[]>([]);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [shellMenuPos, setShellMenuPos] = useState<{ left: number; top: number } | null>(null);
  const shellMenuRef = useRef<HTMLDivElement>(null);
  const shellDropdownRef = useRef<HTMLDivElement>(null);
  const [defaultShell, setDefaultShell] = useState<string>(() => {
    try {
      return localStorage.getItem('hetaossh-default-shell') || 'powershell';
    } catch {
      return 'powershell';
    }
  });

  // Fetch available local shells once
  useEffect(() => {
    invoke<{ id: string; name: string; available: boolean }[]>('list_local_shells')
      .then(setLocalShells)
      .catch(() => setLocalShells([
        { id: 'powershell', name: 'Windows PowerShell', available: true },
        { id: 'cmd', name: 'Command Prompt', available: true },
      ]));
  }, []);

  // Close shell dropdown on outside click (check both the trigger area and the portaled menu)
  useEffect(() => {
    if (!shellMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = shellMenuRef.current?.contains(target);
      const inMenu = shellDropdownRef.current?.contains(target);
      if (!inTrigger && !inMenu) {
        setShellMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [shellMenuOpen]);

  const toggleShellMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    setShellMenuOpen(v => {
      if (!v) {
        const r = e.currentTarget.getBoundingClientRect();
        // Menu is portaled to body (titlebar has overflow-hidden which would clip it);
        // keep it inside the window horizontally
        setShellMenuPos({
          left: Math.max(8, Math.min(r.left, window.innerWidth - 176)),
          top: r.bottom + 4,
        });
      }
      return !v;
    });
  }, []);

  const openLocalTerminal = useCallback((shell?: string) => {
    const chosen = shell || defaultShell;
    createLocalTerminal(chosen).catch(console.error);
  }, [createLocalTerminal, defaultShell]);

  const selectShell = useCallback((shellId: string) => {
    setShellMenuOpen(false);
    setDefaultShell(shellId);
    try {
      localStorage.setItem('hetaossh-default-shell', shellId);
    } catch { /* ignore */ }
    createLocalTerminal(shellId).catch(console.error);
  }, [createLocalTerminal]);

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

  // Keyboard shortcuts - use capture phase to intercept before terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent F5 and Ctrl+R/Cmd+R (Reload)
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
        e.preventDefault();
        return;
      }

      // Close Tab
      const closeTabKeys = getKeys('close-tab');
      if (closeTabKeys && matchesShortcut(e, closeTabKeys)) {
        e.preventDefault();
        e.stopPropagation();
        if (activeTabId) {
          requestCloseTab(activeTabId);
        }
        return;
      }

      // Toggle Sidebar
      const toggleSidebarKeys = getKeys('toggle-sidebar');
      if (toggleSidebarKeys && matchesShortcut(e, toggleSidebarKeys)) {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
        return;
      }

      // New Local Terminal
      const newTerminalKeys = getKeys('new-local-terminal');
      if (newTerminalKeys && matchesShortcut(e, newTerminalKeys)) {
        e.preventDefault();
        openLocalTerminal();
        return;
      }

      // New Connection
      const newConnectionKeys = getKeys('new-connection');
      if (newConnectionKeys && matchesShortcut(e, newConnectionKeys)) {
        e.preventDefault();
        setActiveActivity('hosts');
        setIsSidebarOpen(true);
        setTimeout(() => serverListRef.current?.openAddDialog(), 50);
        return;
      }

      // Settings
      const settingsKeys = getKeys('settings');
      if (settingsKeys && matchesShortcut(e, settingsKeys)) {
        e.preventDefault();
        setShowSettings(true);
        return;
      }

      // Terminal Search
      const searchKeys = getKeys('terminal-search');
      if (searchKeys && matchesShortcut(e, searchKeys)) {
        e.preventDefault();
        // Terminal search is handled by Terminal component
        return;
      }

      // Split Horizontal
      const splitHKeys = getKeys('split-horizontal');
      if (splitHKeys && matchesShortcut(e, splitHKeys)) {
        e.preventDefault();
        if (activeTabId) {
          splitPane(activeTabId, 'horizontal');
        }
        return;
      }

      // Split Vertical
      const splitVKeys = getKeys('split-vertical');
      if (splitVKeys && matchesShortcut(e, splitVKeys)) {
        e.preventDefault();
        if (activeTabId) {
          splitPane(activeTabId, 'vertical');
        }
        return;
      }

      // Close Pane
      const closePaneKeys = getKeys('close-pane');
      if (closePaneKeys && matchesShortcut(e, closePaneKeys)) {
        e.preventDefault();
        if (activeTabId) {
          const activePaneId = getActivePaneId(activeTabId);
          if (activePaneId) {
            closePane(activeTabId, activePaneId);
          } else {
            requestCloseTab(activeTabId);
          }
        }
        return;
      }
    };

    // Use capture phase to intercept before terminal handles it
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeTabId, requestCloseTab, splitPane, closePane, getActivePaneId, getKeys, openLocalTerminal]);

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
      return t('common.local_terminal', 'Local Terminal');
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
      <FileDropListener />
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
                          key={activeConnection.serverId}
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
                        // Send command without auto-executing (no \r)
                        // User can review the command and press Enter to execute
                        sendToTerminal(activeConnection.serverId, cmd);
                        
                        // Focus terminal after a short delay to ensure command is rendered
                        setTimeout(() => {
                            // Find and focus the terminal
                            const terminalElement = document.querySelector('.xterm') as HTMLElement;
                            if (terminalElement) {
                                terminalElement.focus();
                            }
                        }, 50);
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
          <div className="flex-1 flex flex-col min-w-0 relative" style={{ backgroundColor: 'var(--term-bg)' }}>
            {/* Custom Title Bar with Tabs & Actions */}
            <TitleBar>
              {/* Workspace Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden no-scrollbar w-full">
                {workspaceTabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'group flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer border select-none flex-shrink min-w-0 no-drag',
                      activeTabId === tab.id
                        ? 'bg-term-selection text-term-fg border-term-selection'
                        : 'text-term-fg/60 hover:text-term-fg hover:bg-term-selection/50 border-transparent'
                    )}
                    style={{ maxWidth: '25%' }}
                  >
                    {tab.type === 'terminal' ? (
                      <Terminal className="w-3.5 h-3.5 text-term-blue flex-shrink-0" />
                    ) : (
                      <FileCode2 className="w-3.5 h-3.5 text-term-yellow flex-shrink-0" />
                    )}
                    <span className="truncate min-w-0">{tab.title}</span>
                    {/* 未保存修改标记（仅文件标签） */}
                    {tab.type === 'file' && tab.filePath && dirtyFiles[`${(tab.isLocal || (tab.serverId && tab.serverId < 0)) ? `local-${tab.serverId}` : `conn-${tab.serverId}`}|${tab.filePath}`] && (
                      <span className="w-1.5 h-1.5 rounded-full bg-term-yellow flex-shrink-0" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        requestCloseTab(tab.id);
                      }}
                      className="flex-shrink-0 ml-1 p-0.5 rounded-sm text-foreground opacity-100 hover:text-white transition-all"
                      style={{ opacity: 1 }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                {/* New local terminal: "+" opens default shell, chevron opens shell picker (Windows Terminal style) */}
                <div ref={shellMenuRef} className="flex items-center ml-1 flex-shrink-0 no-drag">
                  <button
                    onClick={() => openLocalTerminal()}
                    className="p-1.5 rounded-l-md text-term-fg/60 hover:text-term-fg hover:bg-term-selection/50 transition-colors"
                    title={t('common.new_local_terminal', 'Open Local Terminal')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={toggleShellMenu}
                    className="p-1.5 pl-0.5 pr-1 rounded-r-md text-term-fg/60 hover:text-term-fg hover:bg-term-selection/50 transition-colors"
                    title={t('common.select_shell', 'Select shell')}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                {/* Portaled to body: the titlebar container has overflow-hidden and would clip the menu */}
                {shellMenuOpen && shellMenuPos && createPortal(
                  <div
                    ref={shellDropdownRef}
                    className="fixed z-[9999] min-w-[160px] rounded-md border border-term-selection bg-term-bg shadow-lg py-1"
                    style={{ left: shellMenuPos.left, top: shellMenuPos.top }}
                  >
                    {localShells.map(shell => (
                      <button
                        key={shell.id}
                        disabled={!shell.available}
                        onClick={() => selectShell(shell.id)}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors',
                          shell.available
                            ? 'text-term-fg hover:bg-term-selection/50 cursor-pointer'
                            : 'text-term-fg/30 cursor-not-allowed'
                        )}
                      >
                        <span>{shell.name}</span>
                        {shell.id === defaultShell && (
                          <span className="text-term-blue text-[10px]">{t('common.default', 'Default')}</span>
                        )}
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              </div>
            </TitleBar>

            {/* Tab Content - Each tab has its own Terminal instance */}
            <div className="flex-1 relative" style={{ backgroundColor: 'var(--term-bg)' }}>
              {workspaceTabs.map(tab => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    style={{
                      // CRITICAL: Use visibility instead of display:none
                      // display:none removes Canvas from render tree, breaking xterm.js
                      // visibility:hidden keeps Canvas in render tree but hides it
                      visibility: isActive ? 'visible' : 'hidden',
                      position: isActive ? 'relative' : 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      // Prevent interaction with hidden tabs
                      pointerEvents: isActive ? 'auto' : 'none',
                      // Optimize rendering for hidden tabs
                      opacity: isActive ? 1 : 0
                    }}
                  >
                    {tab.type === 'terminal' || tab.type === 'local' ? (
                      <TerminalArea
                        tabId={tab.id}
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
                        editorMinimap={settings.editorMinimap}
                        editorWordWrap={settings.editorWordWrap}
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
                  <p className="text-xs mt-2">{t('common.press_key_to_connect', { keys: getKeys('new-connection') || 'Ctrl+N' })}</p>
                </div>
              )}
            </div>
            
            {/* 未保存文件关闭确认 */}
          {pendingCloseTab && (
            <ConfirmDialog
              title={t('common.close_tab', 'Close Tab')}
              message={t('file.unsaved_close_confirm', { name: pendingCloseTab.title })}
              isDanger
              confirmText={t('common.close', 'Close')}
              onConfirm={() => {
                closeTab(pendingCloseTab.id);
                setPendingCloseTabId(null);
              }}
              onCancel={() => setPendingCloseTabId(null)}
            />
          )}

          {/* Settings Dialog - Inside Tab Content area, below title bar */}
            {showSettings && (
              <div className="absolute top-10 right-0 bottom-0 left-0 z-40">
                <SettingsDialog
                  isOpen={showSettings}
                  // 关闭时清除主题预览：Save 路径下预览主题已被写入 settings，
                  // currentTheme 会解析到同一主题；Cancel 路径则正确还原
                  onClose={() => {
                    setPreviewTheme(null);
                    setShowSettings(false);
                  }}
                  settings={settings}
                  onSave={setSettings}
                  onPreviewTheme={setPreviewTheme}
                />
              </div>
            )}
          </div>
        </div>

        {/* Status Bar - Moved to bottom full width */}
        <StatusBar
          isConnected={!!activeConnection && activeConnection.status === 'connected'}
          serverName={displayServerName}
          tabId={activeConnection ? (activeConnection.isLocal ? `local-${activeConnection.serverId}` : `conn-${activeConnection.serverId}`) : undefined}
        />

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

/**
 * 监听操作系统文件拖放：
 * - 活动标签是已连接的 SSH 远程终端 → 上传文件到远程当前目录
 *   （目标目录 = SFTP 文件浏览器当前路径，未打开过文件浏览器则用远程主目录）
 * - 其他情况 → 在内置编辑器标签页中打开本地文件
 * 目录会被跳过并提示。同一个本地文件重复拖入会复用已打开的标签页。
 */
function FileDropListener() {
  const { showToast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;

    getCurrentWindow()
      .onDragDropEvent(async (event) => {
        if (event.payload.type !== 'drop') return;

        // 通过 getState() 读取最新状态，避免监听器闭包捕获旧值
        const { workspaceTabs, activeTabId, connections, getSftpPath, openFileTab } =
          useSshStore.getState();
        const activeTab = workspaceTabs.find((tab) => tab.id === activeTabId);
        const activeConn =
          activeTab?.serverId != null
            ? connections.find((c) => c.serverId === activeTab.serverId)
            : undefined;
        const isRemoteActive =
          !!activeConn && !activeConn.isLocal && activeConn.status === 'connected';

        if (isRemoteActive) {
          // ---- 远程终端：上传 ----
          const serverId = activeConn.serverId;
          const connTabId = `conn-${serverId}`;

          let remoteDir = getSftpPath(serverId);
          if (!remoteDir) {
            try {
              remoteDir = await invoke<string>('sftp_get_home_dir', { tabId: connTabId });
            } catch (err) {
              showToast(t('file.upload_failed', { name: '', error: `${err}` }), 'error');
              return;
            }
          }

          for (const path of event.payload.paths) {
            const fileName = path.split(/[\\/]/).pop() || path;
            try {
              if (await invoke<boolean>('local_is_dir', { path })) {
                showToast(t('file.drop_dir_skipped', { name: path }), 'info');
                continue;
              }
              const remotePath = remoteDir.endsWith('/')
                ? `${remoteDir}${fileName}`
                : `${remoteDir}/${fileName}`;
              showToast(t('file.uploading', { name: fileName }), 'info');
              await invoke('sftp_upload_file_with_progress', {
                tabId: connTabId,
                localPath: path,
                remotePath,
              });
              showToast(t('file.upload_success', { name: fileName }), 'success');
            } catch (err) {
              console.error('Failed to upload dropped file:', err);
              showToast(t('file.upload_failed', { name: fileName, error: `${err}` }), 'error');
            }
          }
          return;
        }

        // ---- 本地：编辑器打开 ----
        for (const path of event.payload.paths) {
          try {
            const isDir = await invoke<boolean>('local_is_dir', { path });
            if (isDir) {
              showToast(t('file.drop_dir_skipped', { name: path }), 'info');
              continue;
            }

            // 由路径哈希生成稳定的负数 ID：同一文件重复拖入时复用标签页
            // （openFileTab 按 serverId + filePath 去重）
            let hash = 0;
            for (let i = 0; i < path.length; i++) {
              hash = (hash * 31 + path.charCodeAt(i)) | 0;
            }
            const localId = -(Math.abs(hash) + 1);
            const fileName = path.split(/[\\/]/).pop() || path;
            openFileTab(localId, path, fileName);
          } catch (err) {
            console.error('Failed to open dropped file:', err);
            showToast(t('file.load_failed', { error: `${err}` }), 'error');
          }
        }
      })
      .then((f) => {
        if (mounted) unlisten = f;
        else f();
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [showToast, t]);

  return null;
}

export default App;
