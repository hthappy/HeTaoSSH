import { useState, useRef, useCallback } from 'react';
import { Terminal as TerminalComponent } from '@/components/Terminal';
import { ResourcePanel } from '@/components/ResourcePanel';
import { useSshStore } from '@/stores/ssh-store';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

export function TerminalArea() {
  const { tabs, activeTabId, sendToTerminal } = useSshStore();
  const [showPanel, setShowPanel] = useState(true);
  const terminalRef = useRef<any>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleTerminalData = useCallback((data: string) => {
    if (activeTabId) {
      sendToTerminal(activeTabId, data);
    }
  }, [activeTabId, sendToTerminal]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    console.log('Terminal resize:', cols, rows);
    // TODO: Send resize to SSH backend
  }, []);

  const handleExecuteCommand = (command: string) => {
    console.log('Execute command:', command);
    // TODO: Send command to terminal
  };

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center text-zinc-500">
          <p className="text-lg mb-2">Welcome to HetaoSSH</p>
          <p className="text-sm">Select a server from the left sidebar to connect</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
      {activeTab.status === 'connecting' ? (
        <div className="flex-1 flex items-center justify-center text-zinc-400">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mx-auto mb-4" />
            <p>Connecting to {activeTab.serverName}...</p>
          </div>
        </div>
      ) : activeTab.status === 'connected' ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <TerminalComponent
              ref={terminalRef}
              onData={handleTerminalData}
              onResize={handleTerminalResize}
              disconnected={false}
            />
          </div>
          {showPanel && (
            <ResourcePanel onExecuteCommand={handleExecuteCommand} />
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-400">
          <div className="text-center">
            <p className="text-lg mb-2 text-red-400">Connection failed</p>
            <p>{activeTab.error}</p>
          </div>
        </div>
      )}

      {/* Panel Toggle Button */}
      {activeTab.status === 'connected' && (
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="absolute top-2 right-2 z-10 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
          title={showPanel ? 'Hide panel' : 'Show panel'}
        >
          {showPanel ? (
            <PanelRightClose className="w-4 h-4 text-zinc-400" />
          ) : (
            <PanelRightOpen className="w-4 h-4 text-zinc-400" />
          )}
        </button>
      )}
    </div>
  );
}
