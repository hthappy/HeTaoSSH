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
}

export function TerminalArea({ serverId, theme, fontSize, lineHeight, rightClickBehavior }: TerminalAreaProps) {
  const { t } = useTranslation();
  const { connections, sendToTerminal } = useSshStore();
  const terminalRef = useRef<TerminalHandle | null>(null);

  const activeConnection = connections.find((c) => c.serverId === serverId);
  const isLocal = activeConnection?.isLocal;
  const tabId = isLocal ? serverId.toString() : `conn-${serverId}`;

  const handleTerminalData = useCallback((data: string) => {
    sendToTerminal(serverId, data);
  }, [serverId, sendToTerminal]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    const cmd = isLocal ? 'local_term_resize' : 'ssh_resize';
    const payload = isLocal ? { id: serverId.toString(), cols, rows } : { tabId, cols, rows };
    
    // For local terminal, we also need to trigger creation if it's the first resize (initialization)
    // But better to separate creation.
    // However, xterm 'onResize' fires early.
    // Let's just call resize.
    
    invoke(cmd, payload).catch(err => {
      console.error('Failed to resize terminal:', err);
    });
  }, [tabId, isLocal, serverId]);

  const handleTerminalEnter = useCallback(() => {
    // Dispatch event for FileTree to pick up
    // We use window dispatch for simplicity across components
    window.dispatchEvent(new CustomEvent('ssh-terminal-enter', { 
        detail: { tabId } 
    }));
  }, [tabId]);

  useEffect(() => {
    if (!activeConnection || activeConnection.status !== 'connected') return;
    
    // If local, create the terminal session
    if (isLocal) {
       // Default size, will be resized by xterm
       invoke('open_local_terminal', { id: serverId.toString(), rows: 24, cols: 80 })
         .catch(err => console.error('Failed to start local terminal:', err));
    }

    let unlisten: (() => void) | undefined;
    let isMounted = true;

    const setupListener = async () => {
      const eventName = isLocal ? `terminal-data-${serverId}` : `ssh-data-${tabId}`;
      const unlistenFn = await listen<number[]>(eventName, (event) => {
        if (terminalRef.current) {
          // Xterm accepts Uint8Array directly, avoiding JS UTF-8 string conversion issues
          terminalRef.current.write(new Uint8Array(event.payload));
        }
      });
      
      // Also listen for exit if local
      let unlistenExit: (() => void) | undefined;
      if (isLocal) {
          unlistenExit = await listen(`terminal-exit-${serverId}`, () => {
              // Handle exit? Maybe close tab?
              // For now just print
              console.log('Local terminal exited');
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
      // If local, maybe close backend?
      if (isLocal) {
          invoke('local_term_close', { id: serverId.toString() }).catch(console.error);
      }
    };
  }, [tabId, activeConnection, isLocal, serverId]);

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
        <div className="flex-1 flex overflow-hidden relative">
          <TerminalComponent
            ref={terminalRef}
            onData={handleTerminalData}
            onResize={handleTerminalResize}
            onEnter={handleTerminalEnter}
            disconnected={false}
            theme={theme}
            fontSize={fontSize}
            lineHeight={lineHeight}
            rightClickBehavior={rightClickBehavior}
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
