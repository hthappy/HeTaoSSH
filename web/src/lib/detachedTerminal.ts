import type { ConnectionStatus, PaneGroup, TerminalPane, WorkspaceTab } from '@/stores/ssh-store';

export const DETACHED_TERMINAL_STORAGE_PREFIX = 'hetaossh-detached-terminal:';

export interface DetachedTerminalPayload {
  tab: WorkspaceTab;
  paneGroup: PaneGroup;
  connection: ConnectionStatus;
  histories: Record<string, string>;
}

export function collectTerminalPanes(group: PaneGroup): TerminalPane[] {
  return group.panes.flatMap((pane) =>
    'serverId' in pane ? [pane] : collectTerminalPanes(pane),
  );
}

export function readDetachedTerminalPayload(token: string): DetachedTerminalPayload | null {
  const key = `${DETACHED_TERMINAL_STORAGE_PREFIX}${token}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as DetachedTerminalPayload;
  } finally {
    localStorage.removeItem(key);
  }
}
