import { useRef, useCallback, useEffect, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ITheme } from 'xterm';
import { Terminal as TerminalComponent, type TerminalHandle } from '@/components/Terminal';
import { SplitPane } from '@/components/SplitPane';
import { useSshStore, type PaneGroup, type TerminalPane } from '@/stores/ssh-store';
import { useTranslation } from 'react-i18next';

interface SingleTerminalProps {
  pane: TerminalPane;
  theme?: ITheme;
  fontSize?: number;
  lineHeight?: number;
  rightClickBehavior?: 'menu' | 'paste';
  isPaneActive: boolean;
  onPaneClick: () => void;
}

// Single terminal instance component
const SingleTerminal = memo(function SingleTerminal({
  pane,
  theme,
  fontSize,
  lineHeight,
  rightClickBehavior,
  isPaneActive,
  onPaneClick,
}: SingleTerminalProps) {
  const { t } = useTranslation();
  const { connections, sendToTerminalBackend } = useSshStore();
  const terminalRef = useRef<TerminalHandle | null>(null);
  const localTermCreated = useRef(false);

  const serverId = pane.serverId;
  const backendId = pane.backendId;
  const isLocal = pane.isLocal;
  const activeConnection = connections.find((c) => c.serverId === serverId);
  const connectionStatus = activeConnection?.status;

  const handleTerminalData = useCallback((data: string) => {
    // Only send data if this pane is active
    if (isPaneActive) {
      sendToTerminalBackend(backendId, !!isLocal, data);
    }
  }, [backendId, isLocal, sendToTerminalBackend, isPaneActive, pane.id]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    if (cols <= 0 || rows <= 0) return;
    
    if (isLocal) {
      if (!localTermCreated.current) {
        localTermCreated.current = true;
        invoke('open_local_terminal', { id: backendId, rows, cols })
          .catch(err => console.error('Failed to start local terminal:', err));
      } else {
        invoke('local_term_resize', { id: backendId, cols, rows })
          .catch(err => console.error('Failed to resize terminal:', err));
      }
    } else {
      invoke('ssh_resize', { tabId: backendId, cols, rows })
        .catch(err => console.error('Failed to resize SSH terminal:', err));
    }
  }, [backendId, isLocal, pane.id]);

  const handleTerminalEnter = useCallback(() => {
    window.dispatchEvent(new CustomEvent('ssh-terminal-enter', { 
      detail: { tabId: backendId } 
    }));
  }, [backendId]);

  useEffect(() => {
    if (!activeConnection || activeConnection.status !== 'connected') return;
    
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    const setupListener = async () => {
      const eventName = isLocal ? `terminal-data-${backendId}` : `ssh-data-${backendId}`;
      
      const unlistenFn = await listen<number[]>(eventName, (event) => {
        if (terminalRef.current) {
          terminalRef.current.write(new Uint8Array(event.payload));
        }
      });
      
      let unlistenExit: (() => void) | undefined;
      if (isLocal) {
        unlistenExit = await listen(`terminal-exit-${backendId}`, () => {
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
      if (unlisten) unlisten();
    };
  }, [backendId, isLocal, activeConnection, connectionStatus]);

  useEffect(() => {
    if (!isPaneActive || !terminalRef.current) return;
    const timer = setTimeout(() => terminalRef.current!.focus(), 50);
    return () => clearTimeout(timer);
  }, [isPaneActive, backendId]);

  if (!activeConnection) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--term-bg)' }}>
        <div className="text-center text-term-fg opacity-50">
          <p className="text-sm">{t('terminal.disconnected')}</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="w-full h-full flex flex-col overflow-hidden relative"
      style={{ backgroundColor: 'var(--term-bg)' }}
      onClick={onPaneClick}
    >
      {activeConnection.status === 'connecting' ? (
        <div className="flex-1 flex items-center justify-center text-term-fg opacity-60" style={{ backgroundColor: 'var(--term-bg)' }}>
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-term-fg/30 border-t-term-fg rounded-full animate-spin mx-auto mb-4" />
            <p>{t('terminal.connecting')}</p>
          </div>
        </div>
      ) : activeConnection.status === 'connected' ? (
        <div className="flex-1 relative w-full h-full overflow-hidden" style={{ backgroundColor: 'var(--term-bg)' }}>
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
            isActive={isPaneActive}
            serverId={serverId}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-term-fg opacity-60" style={{ backgroundColor: 'var(--term-bg)' }}>
          <div className="text-center">
            <p className="text-lg mb-2 text-term-red">{t('server.test_failed')}</p>
            <p className="text-sm">{activeConnection.error}</p>
          </div>
        </div>
      )}
    </div>
  );
});

// Recursive pane renderer
interface PaneRendererProps {
  group: PaneGroup;
  theme?: ITheme;
  fontSize?: number;
  lineHeight?: number;
  rightClickBehavior?: 'menu' | 'paste';
  activePaneId: string | null;
  onPaneClick: (paneId: string) => void;
}

function PaneRenderer({ group, theme, fontSize, lineHeight, rightClickBehavior, activePaneId, onPaneClick }: PaneRendererProps) {
  const children = group.panes.map((pane) => {
    if ('serverId' in pane) {
      // TerminalPane
      return (
        <SingleTerminal
          key={pane.id}
          pane={pane}
          theme={theme}
          fontSize={fontSize}
          lineHeight={lineHeight}
          rightClickBehavior={rightClickBehavior}
          isPaneActive={activePaneId === pane.id}
          onPaneClick={() => onPaneClick(pane.id)}
        />
      );
    } else {
      // Nested PaneGroup
      return (
        <PaneRenderer
          key={pane.id}
          group={pane}
          theme={theme}
          fontSize={fontSize}
          lineHeight={lineHeight}
          rightClickBehavior={rightClickBehavior}
          activePaneId={activePaneId}
          onPaneClick={onPaneClick}
        />
      );
    }
  });

  return (
    <SplitPane direction={group.direction}>
      {children}
    </SplitPane>
  );
}

interface TerminalAreaProps {
  tabId: string;
  serverId: number;
  theme?: ITheme;
  fontSize?: number;
  lineHeight?: number;
  rightClickBehavior?: 'menu' | 'paste';
  isActive?: boolean;
}

export function TerminalArea({ tabId, serverId, theme, fontSize, lineHeight, rightClickBehavior, isActive = false }: TerminalAreaProps) {
  const { t } = useTranslation();
  const { connections, paneGroups, setActivePane, getActivePaneId } = useSshStore();
  
  const paneGroup = paneGroups[tabId];
  const activePaneId = getActivePaneId(tabId);
  
  const activeConnection = connections.find((c) => c.serverId === serverId);
  const isLocal = activeConnection?.isLocal;

  const handlePaneClick = useCallback((paneId: string) => {
    setActivePane(tabId, paneId);
  }, [tabId, setActivePane]);

  // If we have a pane group, render split panes
  if (paneGroup) {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--term-bg)' }}>
        <PaneRenderer
          group={paneGroup}
          theme={theme}
          fontSize={fontSize}
          lineHeight={lineHeight}
          rightClickBehavior={rightClickBehavior}
          activePaneId={activePaneId}
          onPaneClick={handlePaneClick}
        />
      </div>
    );
  }

  // Single pane (no split)
  const singlePane: TerminalPane = {
    id: `pane-single-${serverId}`,
    serverId,
    isLocal,
    backendId: isLocal ? serverId.toString() : `conn-${serverId}`
  };

  if (!activeConnection) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: theme?.background }}>
        <div className="text-center text-term-fg opacity-50">
          <p className="text-lg mb-2">{t('terminal.welcome')}</p>
          <p className="text-sm">{t('terminal.start_tip')}</p>
        </div>
      </div>
    );
  }

  return (
    <SingleTerminal
      pane={singlePane}
      theme={theme}
      fontSize={fontSize}
      lineHeight={lineHeight}
      rightClickBehavior={rightClickBehavior}
      isPaneActive={isActive}
      onPaneClick={() => {}}
    />
  );
}
