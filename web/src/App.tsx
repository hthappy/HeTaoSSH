import { ServerList } from '@/components/ServerList';
import { TabBar } from '@/components/TabBar';
import { TerminalArea } from '@/components/TerminalArea';
import { RemoteFiles } from '@/components/RemoteFiles';
import { StatusBar } from '@/components/StatusBar';
import { SettingsDialog } from '@/components/SettingsDialog';
import { useSshStore } from '@/stores/ssh-store';
import { Terminal, FolderOpen, Settings } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

function App() {
  const { openTab, activeTabId } = useSshStore();
  const [activeView, setActiveView] = useState<'terminal' | 'files'>('terminal');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    theme: 'dark' as 'dark' | 'light',
    terminalFontSize: 14,
    terminalLineHeight: 1.5,
    editorMinimap: false,
    editorWordWrap: true,
  });

  const handleServerClick = (serverId: number) => {
    openTab(serverId);
  };

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Left Sidebar - Server List */}
      <ServerList onServerClick={handleServerClick} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="h-12 border-b border-zinc-800 flex items-center px-4 bg-zinc-900">
          <h1 className="text-lg font-semibold text-zinc-100">HetaoSSH</h1>
          
          {/* View Tabs */}
          <div className="ml-8 flex items-center gap-1">
            <button
              onClick={() => setActiveView('terminal')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                activeView === 'terminal'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              )}
            >
              <Terminal className="w-4 h-4" />
              Terminal
            </button>
            <button
              onClick={() => setActiveView('files')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                activeView === 'files'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              )}
            >
              <FolderOpen className="w-4 h-4" />
              Files
            </button>
          </div>

          {activeTabId && (
            <div className="ml-auto flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-sm text-zinc-400">Active session</span>
            </div>
          )}

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="ml-4 p-1.5 hover:bg-zinc-800 rounded-md transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Tab Bar */}
        {activeView === 'terminal' && <TabBar />}

        {/* Content Area */}
        {activeView === 'terminal' ? (
          <TerminalArea />
        ) : (
          <RemoteFiles isActive={true} />
        )}
      </div>

      {/* Status Bar */}
      <StatusBar
        isConnected={!!activeTabId}
        serverName={activeTabId ? 'Server Connected' : 'Not connected'}
        latency={45}
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
  );
}

export default App;
