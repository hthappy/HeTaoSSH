import { ServerList } from '@/components/ServerList';
import { TerminalArea } from '@/components/TerminalArea';
import { RemoteFiles } from '@/components/RemoteFiles';
import { FileTree } from '@/components/FileTree';
import { ResizeHandle } from '@/components/ResizeHandle';
import { StatusBar } from '@/components/StatusBar';
import { SettingsDialog, type AppSettings } from '@/components/SettingsDialog';
import { useSshStore } from '@/stores/ssh-store';
import { Terminal, Settings, X, FileCode2 } from 'lucide-react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ToastProvider } from '@/components/Toast';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { presets, nordTheme } from '@/themes/presets';

function App() {
  const { t, i18n } = useTranslation();
  const { 
    connectServer, 
    workspaceTabs, 
    activeTabId, 
    setActiveTab, 
    closeTab,
    connections,
    openFileTab
  } = useSshStore();
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarSplitY, setSidebarSplitY] = useState(200); // 左侧边栏上下分隔位置 (px)
  const [sidebarWidth, setSidebarWidth] = useState(240); // 左侧边栏宽度 (px)
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('hetaossh_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
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
    };
  });

  // Persist settings
  useEffect(() => {
    localStorage.setItem('hetaossh_settings', JSON.stringify(settings));
  }, [settings]);

  // Sync language on mount/change
  useEffect(() => {
    if (settings.language && settings.language !== i18n.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings.language, i18n]);

  // Resolve current theme object
  const currentTheme = useMemo(() => {
    return [...presets, ...settings.customThemes].find(t => t.name === settings.themeName) || nordTheme;
  }, [settings.themeName, settings.customThemes]);

  // Apply theme (inject CSS variables and get xterm theme)
  const xtermTheme = useTheme(currentTheme);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarSplitY(prev => Math.max(80, Math.min(prev + delta, 600)));
  }, []);

  const handleSidebarWidthResize = useCallback((delta: number) => {
    setSidebarWidth(prev => Math.max(150, Math.min(prev + delta, 500)));
  }, []);

  const handleServerClick = (serverId: number) => {
    connectServer(serverId);
  };

  const activeTab = workspaceTabs.find(t => t.id === activeTabId);
  const activeConnection = connections.find(c => c.serverId === activeTab?.serverId);

  const handleFileSelect = (path: string) => {
    if (activeTab?.serverId) {
       // extract filename from path for title
       const fileName = path.split('/').pop() || path;
       openFileTab(activeTab.serverId, path, fileName);
    }
  };

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen bg-term-bg overflow-hidden transition-colors duration-300">
        {/* Global Top Bar */}
        <div className="h-12 flex-shrink-0 border-b border-term-selection flex items-center px-4 bg-term-bg">
          <h1 className="text-lg font-semibold text-term-fg">HetaoSSH</h1>

          {/* Workspace Tabs */}
          <div className="ml-8 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {workspaceTabs.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'group flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer border',
                  activeTabId === tab.id
                    ? 'bg-term-selection text-term-fg border-term-selection'
                    : 'text-term-fg/60 hover:text-term-fg hover:bg-term-selection/50 border-transparent'
                )}
              >
                {tab.type === 'terminal' ? (
                  <Terminal className="w-4 h-4 text-term-blue" />
                ) : (
                  <FileCode2 className="w-4 h-4 text-term-yellow" />
                )}
                <span>{tab.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="ml-1 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-term-selection/80 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {activeConnection && (
            <div className="ml-auto flex items-center gap-2 px-4 border-l border-term-selection h-full">
              <div className={cn(
                "w-2 h-2 rounded-full",
                activeConnection.status === 'connected' ? "bg-term-green" :
                activeConnection.status === 'connecting' ? "bg-term-yellow animate-pulse" : "bg-term-red"
              )} />
              <span className="text-sm text-term-fg/60 capitalize">{t(`status.${activeConnection.status}`)}</span>
            </div>
          )}

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="ml-auto md:ml-4 p-1.5 hover:bg-term-selection rounded-md transition-colors"
            title={t('common.settings')}
          >
            <Settings className="w-4 h-4 text-term-fg/60" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Server List & File Explorer context */}
          <div 
            className="flex flex-col border-r border-term-selection flex-shrink-0 bg-term-bg"
            style={{ width: sidebarWidth }}
          >
            {/* Servers Panel - resizable height */}
            <div style={{ height: activeConnection ? sidebarSplitY : '100%' }} className="overflow-hidden flex flex-col flex-shrink-0">
              <ServerList onServerClick={handleServerClick} />
            </div>
            {activeConnection && (
              <>
                <ResizeHandle direction="vertical" onResize={handleSidebarResize} />
                <div className="flex-1 flex flex-col overflow-hidden bg-term-bg">
                  <div className="px-4 py-2 text-xs font-semibold text-term-fg/40 uppercase tracking-wider bg-term-bg border-b border-term-selection flex-shrink-0">
                    {t('file.explorer')}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <FileTree
                      tabId={`conn-${activeConnection.serverId}`}
                      onFileSelect={handleFileSelect}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sidebar Resizer */}
          <ResizeHandle direction="horizontal" onResize={handleSidebarWidthResize} />

          {/* Middle Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-term-bg transition-colors duration-300">
            {!activeTabId ? (
              <div className="flex-1 flex items-center justify-center text-term-fg opacity-50">
                <div className="text-center">
                  <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">{t('terminal.welcome')}</p>
                  <p className="text-sm mt-2">{t('terminal.start_tip')}</p>
                </div>
              </div>
            ) : (
              <>
                {/* Persistent Terminal Panes - One per connected server */}
                {connections.map(conn => (
                  <div 
                    key={`term-pane-${conn.serverId}`}
                    // visually hide unselected terminals to keep Xterm mounted
                    className={cn(
                      "flex-1 flex flex-col h-full overflow-hidden",
                      (activeTab?.type !== 'terminal' || activeTab.serverId !== conn.serverId) && "hidden"
                    )}
                  >
                    <TerminalArea 
                      serverId={conn.serverId} 
                      theme={xtermTheme}
                      fontSize={settings.terminalFontSize}
                      lineHeight={settings.terminalLineHeight}
                    />
                  </div>
                ))}

                {/* File Editor Pane - Rendered strictly when activetab is file */}
                {activeTab?.type === 'file' && activeTab.filePath && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <RemoteFiles 
                       isActive={true} 
                       tabId={`conn-${activeTab.serverId}`}
                       filePath={activeTab.filePath}
                       theme={xtermTheme}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Status Bar */}
        <StatusBar
          isConnected={!!activeConnection && activeConnection.status === 'connected'}
          serverName={activeTab ? activeTab.title : t('terminal.disconnected')}
          tabId={activeConnection ? `conn-${activeConnection.serverId}` : undefined}
          latency={0}
          encoding="UTF-8"
          permissions="rw-r--r--"
        />

        {/* Settings Dialog */}
        <SettingsDialog
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          onSave={setSettings}
        />
      </div>
    </ToastProvider>
  );
}

export default App;
