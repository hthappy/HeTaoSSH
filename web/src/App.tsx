import { ServerList } from '@/components/ServerList';
import { TerminalArea } from '@/components/TerminalArea';
import { RemoteFiles } from '@/components/RemoteFiles';
import { FileTree } from '@/components/FileTree';
import { ResizeHandle } from '@/components/ResizeHandle';
import { StatusBar } from '@/components/StatusBar';
import { SettingsDialog } from '@/components/SettingsDialog';
import { useSshStore } from '@/stores/ssh-store';
import { Terminal, Settings, X, FileCode2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ToastProvider } from '@/components/Toast';

function App() {
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
  const [settings, setSettings] = useState({
    theme: 'dark' as 'dark' | 'light',
    terminalFontSize: 14,
    terminalLineHeight: 1.5,
    editorMinimap: false,
    editorWordWrap: true,
  });

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarSplitY(prev => Math.max(80, Math.min(prev + delta, 600)));
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
      <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
        {/* Global Top Bar */}
        <div className="h-12 flex-shrink-0 border-b border-zinc-800 flex items-center px-4 bg-zinc-900">
          <h1 className="text-lg font-semibold text-zinc-100">HetaoSSH</h1>

          {/* Workspace Tabs */}
          <div className="ml-8 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {workspaceTabs.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'group flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer border',
                  activeTabId === tab.id
                    ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border-transparent'
                )}
              >
                {tab.type === 'terminal' ? (
                  <Terminal className="w-4 h-4 text-blue-400" />
                ) : (
                  <FileCode2 className="w-4 h-4 text-yellow-500" />
                )}
                <span>{tab.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="ml-1 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {activeConnection && (
            <div className="ml-auto flex items-center gap-2 px-4 border-l border-zinc-800 h-full">
              <div className={cn(
                "w-2 h-2 rounded-full",
                activeConnection.status === 'connected' ? "bg-green-500" :
                activeConnection.status === 'connecting' ? "bg-yellow-500 animate-pulse" : "bg-red-500"
              )} />
              <span className="text-sm text-zinc-400 capitalize">{activeConnection.status}</span>
            </div>
          )}

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="ml-auto md:ml-4 p-1.5 hover:bg-zinc-800 rounded-md transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Server List & File Explorer context */}
          <div className="flex flex-col border-r border-zinc-800 w-[240px] flex-shrink-0">
            {/* Servers Panel - resizable height */}
            <div style={{ height: activeConnection ? sidebarSplitY : '100%' }} className="overflow-hidden flex flex-col flex-shrink-0">
              <ServerList onServerClick={handleServerClick} />
            </div>
            {activeConnection && (
              <>
                <ResizeHandle direction="vertical" onResize={handleSidebarResize} />
                <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900">
                  <div className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
                    Explorer
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

          {/* Middle Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
            {!activeTabId ? (
              <div className="flex-1 flex items-center justify-center text-zinc-500">
                <div className="text-center">
                  <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Welcome to HetaoSSH</p>
                  <p className="text-sm mt-2">Connect to a server from the left sidebar to start.</p>
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
                    <TerminalArea serverId={conn.serverId} />
                  </div>
                ))}

                {/* File Editor Pane - Rendered strictly when activetab is file */}
                {activeTab?.type === 'file' && activeTab.filePath && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <RemoteFiles 
                       isActive={true} 
                       tabId={`conn-${activeTab.serverId}`}
                       filePath={activeTab.filePath}
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
          serverName={activeTab ? activeTab.title : 'Not connected'}
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
