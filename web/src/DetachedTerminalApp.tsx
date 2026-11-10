import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TerminalArea } from '@/components/TerminalArea';
import { TitleBar } from '@/components/TitleBar';
import { ToastProvider } from '@/components/Toast';
import type { AppSettings } from '@/components/SettingsDialog';
import { useTheme } from '@/hooks/useTheme';
import { collectTerminalPanes, type DetachedTerminalPayload } from '@/lib/detachedTerminal';
import { useSshStore } from '@/stores/ssh-store';
import { nordTheme, presets } from '@/themes/presets';

interface DetachedTerminalAppProps {
  payload: DetachedTerminalPayload | null;
}

function getSettings(): AppSettings {
  const fallback: AppSettings = {
    language: 'en',
    theme: 'dark',
    themeName: nordTheme.name,
    customThemes: [],
    terminalFontSize: 14,
    terminalLineHeight: 1.2,
    editorMinimap: false,
    editorWordWrap: true,
    rightClickBehavior: 'menu',
  };

  try {
    const saved = localStorage.getItem('HeTaoSSH_settings');
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

export default function DetachedTerminalApp({ payload }: DetachedTerminalAppProps) {
  const { t, i18n } = useTranslation();
  const initializedRef = useRef(false);
  const closingRef = useRef(false);
  const settings = useMemo(getSettings, []);
  const currentTheme = useMemo(
    () => [...presets, ...settings.customThemes].find((theme) => theme.name === settings.themeName) || nordTheme,
    [settings.customThemes, settings.themeName],
  );
  const xtermTheme = useTheme(currentTheme);

  useEffect(() => {
    if (settings.language && settings.language !== i18n.language) {
      void i18n.changeLanguage(settings.language);
    }
  }, [i18n, settings.language]);

  if (payload && !initializedRef.current) {
    initializedRef.current = true;
    useSshStore.setState({
      connections: [{ ...payload.connection, status: 'connected' }],
      workspaceTabs: [payload.tab],
      activeTabId: payload.tab.id,
      paneGroups: { [payload.tab.id]: payload.paneGroup },
    });
  }

  useEffect(() => {
    if (!payload) return;
    const backendIds = new Set(collectTerminalPanes(payload.paneGroup).map((pane) => pane.backendId));
    const listeners = Promise.all([
      listen<string>('ssh-disconnected', (event) => {
        if (!backendIds.has(event.payload)) return;
        useSshStore.getState().updateConnectionStatus(payload.connection.serverId, {
          status: 'disconnected',
          error: t('terminal.disconnected'),
        });
      }),
      listen<string>('ssh-reconnected', (event) => {
        if (!backendIds.has(event.payload)) return;
        useSshStore.getState().updateConnectionStatus(payload.connection.serverId, {
          status: 'connected',
          error: undefined,
        });
      }),
    ]);

    return () => {
      void listeners.then((disposeListeners) => disposeListeners.forEach((dispose) => dispose()));
    };
  }, [payload, t]);

  useEffect(() => {
    if (!payload) return;
    let unlisten: (() => void) | undefined;
    let mounted = true;

    getCurrentWindow().onCloseRequested(async (event) => {
      if (closingRef.current) return;
      event.preventDefault();
      closingRef.current = true;

      const backendIds = [...new Set(collectTerminalPanes(payload.paneGroup).map((pane) => pane.backendId))];
      await Promise.allSettled(
        backendIds.map((backendId) => invoke('ssh_disconnect', { tabId: backendId })),
      );
      await emit('detached-terminal-closed', payload.connection.serverId).catch((error) => {
        console.warn('Failed to notify the main window about detached terminal close:', error);
      });
      await getCurrentWindow().close();
    }).then((dispose) => {
      if (mounted) unlisten = dispose;
      else dispose();
    });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [payload]);

  if (!payload) {
    return (
      <div className="flex h-screen items-center justify-center bg-term-bg text-sm text-term-red">
        {t('terminal.detached_session_missing')}
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-term-bg text-term-fg">
        <TitleBar>
          <div data-tauri-drag-region className="min-w-0 flex-1 truncate px-2 text-xs text-term-fg/75">
            {payload.tab.title}
          </div>
        </TitleBar>
        <div className="min-h-0 flex-1">
          <TerminalArea
            tabId={payload.tab.id}
            serverId={payload.tab.serverId!}
            theme={xtermTheme}
            fontSize={settings.terminalFontSize}
            lineHeight={settings.terminalLineHeight}
            rightClickBehavior={settings.rightClickBehavior}
            isActive
            initialContents={payload.histories}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
