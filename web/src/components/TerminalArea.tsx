import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ITheme } from 'xterm';
import { Terminal as TerminalComponent, type TerminalHandle } from '@/components/Terminal';
import { ResourcePanel } from '@/components/ResourcePanel';
import { ResizeHandle } from '@/components/ResizeHandle';
import { useSshStore } from '@/stores/ssh-store';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TerminalAreaProps {
  serverId: number;
  theme?: ITheme;
  fontSize?: number;
  lineHeight?: number;
}

export function TerminalArea({ serverId, theme, fontSize, lineHeight }: TerminalAreaProps) {
  const { t } = useTranslation();
  const { connections, sendToTerminal } = useSshStore();
  const [showPanel, setShowPanel] = useState(true);
  const [panelWidth, setPanelWidth] = useState(300); // 右侧监控面板宽度 (px)
  const terminalRef = useRef<TerminalHandle | null>(null);

  const activeConnection = connections.find((c) => c.serverId === serverId);
  const tabId = `conn-${serverId}`;

  const handleTerminalData = useCallback((data: string) => {
    sendToTerminal(serverId, data);
  }, [serverId, sendToTerminal]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    invoke('ssh_resize', { tabId, cols, rows }).catch(err => {
      console.error('Failed to resize terminal:', err);
    });
  }, [tabId]);

  useEffect(() => {
    if (!activeConnection || activeConnection.status !== 'connected') return;

    let unlisten: (() => void) | undefined;
    let isMounted = true;

    const setupListener = async () => {
      const unlistenFn = await listen<number[]>(`ssh-data-${tabId}`, (event) => {
        if (terminalRef.current) {
          // Xterm accepts Uint8Array directly, avoiding JS UTF-8 string conversion issues
          terminalRef.current.write(new Uint8Array(event.payload));
        }
      });
      if (!isMounted) {
        unlistenFn();
      } else {
        unlisten = unlistenFn;
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [tabId, activeConnection]);

  const handleExecuteCommand = (command: string) => {
    sendToTerminal(serverId, command + '\n');
  };

  if (!activeConnection) {
    return (
      <div className="flex-1 flex items-center justify-center bg-term-bg">
        <div className="text-center text-term-fg opacity-50">
          <p className="text-lg mb-2">{t('terminal.welcome')}</p>
          <p className="text-sm">{t('terminal.start_tip')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-term-bg" style={{ backgroundColor: theme?.background }}>
      {activeConnection.status === 'connecting' ? (
        <div className="flex-1 flex items-center justify-center text-term-fg opacity-60">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-term-fg/30 border-t-term-fg rounded-full animate-spin mx-auto mb-4" />
            <p>{t('terminal.connecting')}</p>
          </div>
        </div>
      ) : activeConnection.status === 'connected' ? (
        <div className="flex-1 flex overflow-hidden relative">
          <div className="relative flex-1 flex flex-col overflow-hidden min-w-0">
            <TerminalComponent
              ref={terminalRef}
              onData={handleTerminalData}
              onResize={handleTerminalResize}
              disconnected={false}
              theme={theme}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
            {/* 展开按钮：面板隐藏时，贴在终端右侧边缘，向外凸出 */}
            {!showPanel && (
              <button
                onClick={() => setShowPanel(true)}
                className="absolute top-3 -right-3 z-20 p-1.5 bg-term-selection hover:opacity-80 rounded-l-md rounded-r-none border border-term-selection border-r-0 shadow-md"
                title={t('terminal.show_panel')}
              >
                <PanelRightOpen className="w-4 h-4 text-term-fg" />
              </button>
            )}
          </div>
          {showPanel && (
            <>
              <div className="relative flex-shrink-0 flex items-stretch">
                {/* 隐藏按钮：贴在 Snippets 窗口外左侧，向终端区域凸出 */}
                <button
                  onClick={() => setShowPanel(false)}
                  className="absolute top-3 -left-3 z-20 p-1.5 bg-term-selection hover:opacity-80 rounded-r-md rounded-l-none border border-term-selection border-l-0 shadow-md"
                  title={t('terminal.hide_panel')}
                >
                  <PanelRightClose className="w-4 h-4 text-term-fg" />
                </button>
                <ResizeHandle
                  direction="horizontal"
                  onResize={(delta) => setPanelWidth(prev => Math.max(180, Math.min(prev - delta, 600)))}
                  className="bg-transparent hover:bg-term-blue/40"
                />
              </div>
              <div style={{ width: panelWidth }} className="flex-shrink-0 h-full overflow-hidden">
                <ResourcePanel onExecuteCommand={handleExecuteCommand} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-term-fg opacity-60">
          <div className="text-center">
            <p className="text-lg mb-2 text-term-red">{t('server.test_failed')}</p>
            <p>{activeConnection.error}</p>
          </div>
        </div>
      )}

    </div>
  );
}
