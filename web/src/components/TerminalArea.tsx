import { useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ITheme } from 'xterm';
import { Terminal as TerminalComponent, type TerminalHandle } from '@/components/Terminal';
import { useSshStore } from '@/stores/ssh-store';
import { useTranslation } from 'react-i18next';

interface TerminalAreaProps {
  serverId: number;
  theme?: ITheme;
  fontSize?: number;
  lineHeight?: number;
  rightClickBehavior?: 'menu' | 'paste';
  isActive?: boolean;
}

export function TerminalArea({ serverId, theme, fontSize, lineHeight, rightClickBehavior, isActive = false }: TerminalAreaProps) {
  const { t } = useTranslation();
  const { connections, sendToTerminal } = useSshStore();
  const terminalRef = useRef<TerminalHandle | null>(null);
  const localTermCreated = useRef(false);

  const activeConnection = connections.find((c) => c.serverId === serverId);
  const isLocal = activeConnection?.isLocal;
  const connectionStatus = activeConnection?.status;
  const tabId = isLocal ? serverId.toString() : `conn-${serverId}`;

  const handleTerminalData = useCallback((data: string) => {
    sendToTerminal(serverId, data);
  }, [serverId, sendToTerminal]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    // Only resize if dimensions are valid
    if (cols <= 0 || rows <= 0) {
      return;
    }
    
    if (isLocal) {
      if (!localTermCreated.current) {
        localTermCreated.current = true;
        invoke('open_local_terminal', { id: serverId.toString(), rows, cols })
          .catch(err => console.error('Failed to start local terminal:', err));
      } else {
        invoke('local_term_resize', { id: serverId.toString(), cols, rows })
          .catch(err => console.error('Failed to resize terminal:', err));
      }
    } else {
      // For SSH, ensure tabId is correct format
      invoke('ssh_resize', { tabId, cols, rows })
        .catch(err => console.error('Failed to resize SSH terminal:', err));
    }
  }, [tabId, isLocal, serverId]);

  const handleTerminalEnter = useCallback(() => {
    // Dispatch event for FileTree to pick up
    // We use window dispatch for simplicity across components
    window.dispatchEvent(new CustomEvent('ssh-terminal-enter', { 
        detail: { tabId } 
    }));
  }, [tabId]);

  useEffect(() => {
    if (!activeConnection || activeConnection.status !== 'connected') {
      return;
    }
    
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    const setupListener = async () => {
      const eventName = isLocal ? `terminal-data-${serverId}` : `ssh-data-${tabId}`;
      
      const unlistenFn = await listen<number[]>(eventName, (event) => {
        if (terminalRef.current) {
          // Always write directly, don't buffer
          terminalRef.current.write(new Uint8Array(event.payload));
        }
      });
      
      // Also listen for exit if local
      let unlistenExit: (() => void) | undefined;
      if (isLocal) {
          unlistenExit = await listen(`terminal-exit-${serverId}`, () => {
              if (terminalRef.current) {
                  terminalRef.current.write('\r\n[Process exited]\r\n');
              }
          });
      }

      if (!isMounted) {
        unlistenFn();
        if (unlistenExit) unlistenExit();
      } else {
        unlisten = () => {
            unlistenFn();
            if (unlistenExit) unlistenExit();
        };
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
      // CRITICAL: Only close backend on actual unmount, NOT on tab switch
      // Don't close based on isActive - that would kill the connection
    };
  }, [serverId, isLocal, tabId, activeConnection, connectionStatus]);  // Removed isActive from deps

  // Focus terminal when tab becomes active
  useEffect(() => {
    if (!isActive || !terminalRef.current) return;
    const timer = setTimeout(() => terminalRef.current!.focus(), 50);
    return () => clearTimeout(timer);
  }, [isActive, serverId]);

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
    <div className="w-full h-full flex flex-col overflow-hidden bg-term-bg" style={{ backgroundColor: theme?.background }}>
      {activeConnection.status === 'connecting' ? (
        <div className="flex-1 flex items-center justify-center text-term-fg opacity-60">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-term-fg/30 border-t-term-fg rounded-full animate-spin mx-auto mb-4" />
            <p>{t('terminal.connecting')}</p>
          </div>
        </div>
      ) : activeConnection.status === 'connected' ? (
        <div className="flex-1 relative w-full h-full overflow-hidden" id={`terminal-container-${serverId}`}>
          <TerminalComponent
            ref={terminalRef}
            className="absolute inset-0"
            onData={handleTerminalData}
            onResize={handleTerminalResize}
            onEnter={handleTerminalEnter}
            disconnected={activeConnection?.status !== 'connected'}
            theme={theme}
            fontSize={fontSize}
            lineHeight={lineHeight}
            rightClickBehavior={rightClickBehavior}
            isActive={isActive}
          />
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
