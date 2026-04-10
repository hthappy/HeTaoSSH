import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ServerConfig } from '@/types/config'
import i18n from '@/i18n'
import { IPC_DEBOUNCE_MS } from '@/constants/ipc'
import { terminalPool } from '@/lib/terminalPool'

// Input buffering to prevent IPC flooding and key loss
// Accumulates keystrokes for a short window before sending
const inputBuffers: Record<string, string> = {};
const inputTimers: Record<string, NodeJS.Timeout> = {};

// Control characters that should be sent immediately without buffering
const CONTROL_CHARS = [
  '\x03', // Ctrl+C (ETX - End of Text)
  '\x04', // Ctrl+D (EOT - End of Transmission)
  '\x1a', // Ctrl+Z (SUB - Suspend)
  '\x1c', // Ctrl+\ (FS - Quit)
];

const sendBufferedBackend = (backendId: string, data: string) => {
  if (CONTROL_CHARS.includes(data)) {
    if (inputTimers[backendId]) {
      clearTimeout(inputTimers[backendId]);
      delete inputTimers[backendId];
    }
    const bufferedData = inputBuffers[backendId] || '';
    inputBuffers[backendId] = '';
    const payload = bufferedData + data;
    invoke('ssh_send', { tabId: backendId, data: payload }).catch(err => {
      console.error(i18n.t('store.send_data_failed', { error: err }));
    });
    return;
  }
  
  if (!inputBuffers[backendId]) {
    inputBuffers[backendId] = '';
  }
  inputBuffers[backendId] += data;

  if (inputTimers[backendId]) {
    return;
  }

  inputTimers[backendId] = setTimeout(async () => {
    const payload = inputBuffers[backendId];
    inputBuffers[backendId] = '';
    delete inputTimers[backendId];
    
    if (!payload) return;

    try {
      await invoke('ssh_send', { tabId: backendId, data: payload });
    } catch (err) {
      console.error(i18n.t('store.send_data_failed', { error: err }));
    }
  }, IPC_DEBOUNCE_MS);
};

// Helper functions for pane tree operations
const findPaneInGroup = (group: PaneGroup, paneId: string): TerminalPane | null => {
  for (const pane of group.panes) {
    if ('serverId' in pane && pane.id === paneId) {
      return pane;
    }
    if ('direction' in pane) {
      const found = findPaneInGroup(pane, paneId);
      if (found) return found;
    }
  }
  return null;
};

export interface WorkspaceTab {
  id: string; // Unique ID for this tab (e.g., 'term-1', 'file-123')
  serverId?: number; // The backend connection it belongs to (optional for local terminal)
  type: 'terminal' | 'file' | 'local';
  title: string;
  filePath?: string; // Only valid if type === 'file'
  isLocal?: boolean;
}

// Split pane types
export type SplitDirection = 'horizontal' | 'vertical';

export interface TerminalPane {
  id: string;
  serverId: number;
  isLocal?: boolean;
  backendId: string;
}

export interface PaneGroup {
  id: string;
  direction: SplitDirection;
  panes: (TerminalPane | PaneGroup)[];
  activePaneId: string | null;
}

export interface ConnectionStatus {
  serverId: number; // or string for local terminal ID
  status: 'connected' | 'connecting' | 'disconnected';
  error?: string;
  isLocal?: boolean;
}

interface SshState {
  servers: ServerConfig[];
  loading: boolean;
  error: string | null;

  // Track connections separately from UI Tabs
  connections: ConnectionStatus[];
  
  // UI IDE Workspace Tabs
  workspaceTabs: WorkspaceTab[];
  activeTabId: string | null;
  
  // Split panes per tab (keyed by tabId)
  paneGroups: Record<string, PaneGroup>;
  
  // File manager paths per connection (keyed by serverId, negative for local)
  sftpPaths: Record<number, string>;

  loadServers: () => Promise<void>;
  saveServer: (config: ServerConfig) => Promise<void>;
  deleteServer: (id: number) => Promise<void>;
  testConnection: (config: ServerConfig) => Promise<boolean>;

  // Connection Management
  connectServer: (serverId: number) => Promise<void>;
  reconnectServer: (serverId: number) => Promise<void>; // Added for manual reconnect capability
  createLocalTerminal: () => Promise<void>;
  updateConnectionStatus: (serverId: number, status: Partial<ConnectionStatus>) => void;

  // Tab Management
  openTerminalTab: (serverId: number) => void;
  openFileTab: (serverId: number, filePath: string, fileName: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  
  // Pane Management
  splitPane: (tabId: string, direction: SplitDirection) => Promise<void>;
  closePane: (tabId: string, paneId: string) => void;
  setActivePane: (tabId: string, paneId: string) => void;
  getActivePaneId: (tabId: string) => string | null;
  getPaneGroup: (tabId: string) => PaneGroup | null;
  
  // SFTP Path Management
  setSftpPath: (serverId: number, path: string) => void;
  getSftpPath: (serverId: number) => string | undefined;

  // Terminal API
  sendToTerminal: (serverId: number, data: string) => Promise<void>;
  sendToTerminalBackend: (backendId: string, isLocal: boolean, data: string) => Promise<void>;
  handleTerminalKeyPress: (serverId: number) => Promise<void>;
  
  // Session Management
  saveSession: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useSshStore = create<SshState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,
  connections: [],
  workspaceTabs: [],
  activeTabId: null,
  paneGroups: {},
  sftpPaths: {},
  
  // We need a separate function to setup the listeners, typically called at app level
  // This is just the initial store structure

  loadServers: async () => {
    set({ loading: true, error: null });
    try {
      const servers = await invoke<ServerConfig[]>('list_servers');
      set({ servers, loading: false });
    } catch (err) {
      set({ error: i18n.t('store.load_servers_failed', { error: err }), loading: false });
    }
  },

  saveServer: async (config: ServerConfig) => {
    set({ loading: true, error: null });
    try {
      await invoke<number>('save_server', { config });
      await get().loadServers();
    } catch (err) {
      set({ error: i18n.t('store.save_server_failed', { error: err }), loading: false });
      throw err;
    }
  },

  deleteServer: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await invoke('delete_server', { id });
      await get().loadServers();
    } catch (err) {
      set({ error: i18n.t('store.delete_server_failed', { error: err }), loading: false });
      throw err;
    }
  },

  testConnection: async (config: ServerConfig) => {
    try {
      const result = await invoke<string>('test_connection', { config });
      return result === 'Connection successful';
    } catch (err) {
      set({ error: i18n.t('store.connection_test_failed', { error: err }) });
      return false;
    }
  },

  connectServer: async (serverId: number) => {
    const server = get().servers.find(s => s.id === serverId);
    if (!server) {
      console.error(i18n.t('store.server_not_found', { id: serverId }));
      return;
    }

    // 如果该服务器已经处于连接状态，直接聚焦到它的终端标签
    const existing = get().connections.find(c => c.serverId === serverId);
    if (existing && existing.status === 'connected') {
      get().openTerminalTab(serverId);
      return;
    }

    // Initialize Connection State
    if (!get().connections.find(c => c.serverId === serverId)) {
      set({
        connections: [
          ...get().connections,
          { serverId, status: 'connecting' }
        ]
      });
    } else {
      get().updateConnectionStatus(serverId, { status: 'connecting' });
    }

    // Always ensure a Terminal Tab is spawned when a connection starts
    get().openTerminalTab(serverId);

    // Start event listeners for this serverId 
    try {
      // Listen for reconnection events
      listen('ssh-reconnected', (event) => {
        const id = event.payload as string;
        const serverIdFromEvent = parseInt(id.split('-')[1]);
        get().updateConnectionStatus(serverIdFromEvent, { status: 'connected', error: undefined });
      });
      
      listen('ssh-disconnected', (event) => {
        const id = event.payload as string;
        const serverIdFromEvent = parseInt(id.split('-')[1]);
        get().updateConnectionStatus(serverIdFromEvent, { status: 'disconnected', error: 'Connection lost' });
      });

      await invoke('ssh_connect', { tabId: `conn-${serverId}`, config: server });
      // Update single default pane's backendId when connected (for tracking)
      const tabs = get().workspaceTabs;
      for (const tab of tabs) {
        if (tab.serverId === serverId && tab.type === 'terminal') {
           // TerminalArea initializes with 'conn-{serverId}' implicitly before splitting
        }
      }
      get().updateConnectionStatus(serverId, { status: 'connected' });
    } catch (err) {
      // Extract detailed error message
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      console.error('SSH Connection failed:', {
        serverId,
        host: server.host,
        username: server.username,
        authMethod: server.private_key_path ? 'key' : 'password',
        keyPath: server.private_key_path,
        error: err,
        errorMessage
      });
      
      // Parse structured error from backend (format: "auth_failed|username|host|port")
      let userFriendlyError = i18n.t('store.connect_failed', { error: errorMessage });
      
      if (errorMessage.startsWith('auth_failed|')) {
        const parts = errorMessage.split('|');
        if (parts.length >= 4) {
          const [, username, host, port] = parts;
          userFriendlyError = i18n.t('store.auth_failed', { username, host, port });
        }
      }
      
      get().updateConnectionStatus(serverId, { 
        status: 'disconnected', 
        error: userFriendlyError
      });
    }
  },

  openTerminalTab: (serverId: number) => {
    const server = get().servers.find(s => s.id === serverId);
    if (!server) return;

    // Check if terminal already exists for this server
    const existingTerm = get().workspaceTabs.find(t => t.serverId === serverId && t.type === 'terminal');
    if (existingTerm) {
      set({ activeTabId: existingTerm.id });
      return;
    }

    const newTab: WorkspaceTab = {
      id: `term-${Date.now()}-${serverId}`,
      serverId,
      type: 'terminal',
      title: `${server.name}`,
    };

    set({ workspaceTabs: [...get().workspaceTabs, newTab], activeTabId: newTab.id });
  },

  openFileTab: (serverId: number, filePath: string, fileName: string) => {
    // Check if file is already open
    const existingFile = get().workspaceTabs.find(t => t.serverId === serverId && t.type === 'file' && t.filePath === filePath);
    if (existingFile) {
      set({ activeTabId: existingFile.id });
      return;
    }

    const newTab: WorkspaceTab = {
      id: `file-${Date.now()}`,
      serverId,
      type: 'file',
      title: fileName,
      filePath,
      isLocal: serverId < 0,
    };

    set({ workspaceTabs: [...get().workspaceTabs, newTab], activeTabId: newTab.id });
  },

  closeTab: (tabId: string) => {
    const tab = get().workspaceTabs.find(t => t.id === tabId);
    
    // Dispose all terminal instances for this tab
    const paneGroup = get().paneGroups[tabId];
    if (paneGroup) {
      const disposePanes = (group: PaneGroup) => {
        for (const pane of group.panes) {
          if ('serverId' in pane) {
            // Dispose terminal instance from pool
            terminalPool.dispose(pane.id);
          } else if ('direction' in pane) {
            disposePanes(pane);
          }
        }
      };
      disposePanes(paneGroup);
    } else if (tab) {
      // Single pane (no split) - dispose using the single pane ID
      const singlePaneId = `pane-single-${tab.serverId}`;
      terminalPool.dispose(singlePaneId);
    }
    
    // If closing terminal tab or local terminal tab, disconnect
    if (tab?.type === 'terminal' || tab?.type === 'local') {
      const serverId = tab.serverId!;
      const backendClosed = get().connections.find(c => c.serverId === serverId);
      
      // If it's a local terminal
      if (tab.type === 'local') {
          invoke('local_term_close', { id: serverId.toString() }).catch(err => {
              console.error('Failed to close local terminal:', err);
          });
          // Remove from connections
          set({
              connections: get().connections.filter(c => c.serverId !== serverId)
          });
      } else if (backendClosed && backendClosed.status === 'connected') {
        // SSH connection
        invoke('ssh_disconnect', { tabId: `conn-${serverId}` }).catch(err => {
          console.error('Failed to disconnect:', err);
        });
        get().updateConnectionStatus(serverId, { status: 'disconnected' });
      }
    }
    
    const newTabs = get().workspaceTabs.filter(t => t.id !== tabId);
    let newActiveTabId = get().activeTabId;

    if (newActiveTabId === tabId) {
      newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }

    set({ workspaceTabs: newTabs, activeTabId: newActiveTabId });
  },

  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  // Get pane group for a tab
  getPaneGroup: (tabId: string) => {
    return get().paneGroups[tabId] || null;
  },

  // Get active pane ID for a tab
  getActivePaneId: (tabId: string) => {
    const group = get().paneGroups[tabId];
    return group?.activePaneId || null;
  },

  // Set active pane
  setActivePane: (tabId: string, paneId: string) => {
    set((state) => {
      const group = state.paneGroups[tabId];
      if (!group) return state;
      
      const updateActivePane = (g: PaneGroup): PaneGroup => ({
        ...g,
        activePaneId: g.panes.some(p => 
          ('id' in p && p.id === paneId) || 
          ('direction' in p && findPaneInGroup(p, paneId))
        ) ? paneId : g.activePaneId,
        panes: g.panes.map(p => 
          'direction' in p ? updateActivePane(p) : p
        )
      });
      
      return {
        paneGroups: {
          ...state.paneGroups,
          [tabId]: updateActivePane(group)
        }
      };
    });
  },

  // Split pane - add a new terminal pane to the active tab
  splitPane: async (tabId: string, direction: SplitDirection) => {
    const tab = get().workspaceTabs.find(t => t.id === tabId);
    if (!tab || (tab.type !== 'terminal' && tab.type !== 'local')) return;
    
    const existingGroup = get().paneGroups[tabId];
    const newPaneId = `pane-${Date.now()}`;
    const newBackendId = tab.type === 'local' ? `local-pane-${Date.now()}` : `conn-pane-${Date.now()}`;
    
    const newPane: TerminalPane = {
      id: newPaneId,
      serverId: tab.serverId!,
      isLocal: tab.type === 'local',
      backendId: newBackendId
    };

    // Before updating state, if it's not local, we need to connect!
    if (!tab.isLocal && tab.type !== 'local') {
      const server = get().servers.find(s => s.id === tab.serverId);
      if (server) {
        try {
          await invoke('ssh_connect', { tabId: newBackendId, config: server });
        } catch (err) {
          console.error('Failed to connect new pane:', err);
        }
      }
    } else {
       // Local terminal: we need to create a new local terminal
       try {
           await invoke('open_local_terminal', { id: newBackendId, rows: 24, cols: 80 });
       } catch (err) {
           console.error('Failed to open local terminal:', err);
       }
    }
    
    if (!existingGroup) {
      // Create initial group with the existing terminal and new one
      // CRITICAL: Use the same paneId as single pane mode to preserve terminal instance
      const existingPaneId = `pane-single-${tab.serverId}`;
      const existingPane: TerminalPane = {
        id: existingPaneId,
        serverId: tab.serverId!,
        isLocal: tab.type === 'local',
        backendId: tab.type === 'local' ? tab.serverId!.toString() : `conn-${tab.serverId}`
      };
      
      const newGroup: PaneGroup = {
        id: `group-${Date.now()}`,
        direction,
        panes: [existingPane, newPane],
        activePaneId: newPaneId
      };
      
      set((state) => ({
        paneGroups: {
          ...state.paneGroups,
          [tabId]: newGroup
        }
      }));
    } else {
      // Add new pane to existing group
      const addPaneToGroup = (group: PaneGroup): PaneGroup => {
        // If this is the active group and has room, add here
        if (group.direction === direction) {
          return {
            ...group,
            panes: [...group.panes, newPane],
            activePaneId: newPaneId
          };
        }
        // Otherwise, wrap in new group with correct direction
        return {
          id: `group-${Date.now()}`,
          direction,
          panes: [group, newPane],
          activePaneId: newPaneId
        };
      };
      
      set((state) => ({
        paneGroups: {
          ...state.paneGroups,
          [tabId]: addPaneToGroup(existingGroup)
        }
      }));
    }
    
    // Focus the new pane
    get().setActivePane(tabId, newPaneId);
  },

  // Close a pane
  closePane: (tabId: string, paneId: string) => {
    const group = get().paneGroups[tabId];
    const tab = get().workspaceTabs.find(t => t.id === tabId);
    if (!group || !tab) return;
    
    const removePaneFromGroup = (g: PaneGroup): PaneGroup | null => {
      const newPanes: (TerminalPane | PaneGroup)[] = [];
      
      for (const pane of g.panes) {
        if ('id' in pane && pane.id === paneId) {
          // Found the pane to disconnect
          const backendId = (pane as TerminalPane).backendId;
          const isPrimary = backendId === `conn-${tab.serverId}` || backendId === tab.serverId!.toString();
          
          // Dispose terminal instance from pool
          terminalPool.dispose(paneId);
          
          // Don't kill primary connection via closePane, handled by closeTab
          if (!isPrimary && tab.type !== 'local') {
             invoke('ssh_disconnect', { tabId: backendId }).catch(console.error);
          } else if (tab.type === 'local' && !isPrimary) {
             invoke('local_term_close', { id: backendId }).catch(console.error);
          }
          continue; // Remove this pane
        }
        if ('direction' in pane) {
          const subGroup = removePaneFromGroup(pane);
          if (subGroup) {
            newPanes.push(subGroup);
          }
        } else {
          newPanes.push(pane);
        }
      }
      
      if (newPanes.length === 0) {
        return null;
      }
      
      if (newPanes.length === 1 && 'serverId' in newPanes[0]) {
        // Only one terminal left, flatten
        return {
          ...g,
          panes: newPanes,
          activePaneId: newPanes[0].id
        };
      }
      
      return {
        ...g,
        panes: newPanes,
        activePaneId: g.activePaneId === paneId 
          ? (newPanes.find(p => 'id' in p) as TerminalPane)?.id || null
          : g.activePaneId
      };
    };
    
    const newGroup = removePaneFromGroup(group);
    
    if (newGroup) {
      set((state) => ({
        paneGroups: {
          ...state.paneGroups,
          [tabId]: newGroup!
        }
      }));
    } else {
      // No panes left, remove the group
      set((state) => {
        const { [tabId]: _, ...rest } = state.paneGroups;
        return { paneGroups: rest };
      });
    }
  },

  setSftpPath: (serverId: number, path: string) => {
    set((state) => ({
      sftpPaths: { ...state.sftpPaths, [serverId]: path }
    }));
  },

  getSftpPath: (serverId: number) => {
    return get().sftpPaths[serverId];
  },

  createLocalTerminal: async () => {
    // Generate a unique ID for the local terminal
    // We use negative numbers for local terminal IDs to avoid conflict with server IDs (which are usually positive DB IDs)
    // Or just use a timestamp-based ID
    const localId = -Date.now(); 
    const tabId = `local-${localId}`;

    // Add connection status
    set((state) => ({
      connections: [...state.connections, { 
        serverId: localId, 
        status: 'connected', // Local terminal connects immediately (or very fast)
        isLocal: true 
      }],
      workspaceTabs: [
        ...state.workspaceTabs,
        {
          id: tabId,
          serverId: localId,
          type: 'local',
          title: 'Local Terminal',
          isLocal: true,
        }
      ],
      activeTabId: tabId
    }));
  },

  // Added function to handle reconnect on keypress
  handleTerminalKeyPress: async (serverId: number) => {
    const conn = get().connections.find(c => c.serverId === serverId && !c.isLocal);
    if (conn && conn.status === 'disconnected') {
      // Server is in disconnected state, try to reconnect
      await get().reconnectServer(serverId);
    }
  },

  reconnectServer: async (serverId: number) => {
    const server = get().servers.find(s => s.id === serverId);
    if (!server) {
      console.error(i18n.t('store.server_not_found', { id: serverId }));
      return;
    }
    
    const connectionKey = `conn-${serverId}`;
    get().updateConnectionStatus(serverId, { status: 'connecting', error: undefined });
    
    try {
      await invoke('ssh_connect', { tabId: connectionKey, config: server });
      get().updateConnectionStatus(serverId, { status: 'connected', error: undefined });
      // If we had a terminal tab, make sure it becomes active
      const existingTerm = get().workspaceTabs.find(t => t.serverId === serverId && t.type === 'terminal');
      if (existingTerm) {
        get().setActiveTab(existingTerm.id);
      }
    } catch (err) {
      get().updateConnectionStatus(serverId, { 
        status: 'disconnected', 
        error: i18n.t('store.connect_failed', { error: err })
      });
    }
  },

  updateConnectionStatus: (serverId: number, status: Partial<ConnectionStatus>) => {
    set({
      connections: get().connections.map(c => (c.serverId === serverId ? { ...c, ...status } : c)),
    });
  },

  sendToTerminal: async (serverId: number, data: string) => {
    const conn = get().connections.find(c => c.serverId === serverId);
    if (conn?.isLocal) {
       try {
         const encoder = new TextEncoder();
         const bytes = Array.from(encoder.encode(data));
         await invoke('local_term_write', { id: serverId.toString(), data: bytes });
       } catch (err) {
         console.error('Failed to write to local terminal', err);
       }
    } else {
      sendBufferedBackend(`conn-${serverId}`, data);
    }
  },
  
  // Expose backend sending for explicit pane IDs
  sendToTerminalBackend: async (backendId: string, isLocal: boolean, data: string) => {
    if (isLocal) {
       try {
         const encoder = new TextEncoder();
         const bytes = Array.from(encoder.encode(data));
         await invoke('local_term_write', { id: backendId, data: bytes });
       } catch (err) {
         console.error('Failed to write to local terminal', err);
       }
    } else {
       sendBufferedBackend(backendId, data);
    }
  },
  
  saveSession: async () => {
    try {
      const serverIds = get().connections
        .filter(c => c.status === 'connected' && !c.isLocal)
        .map(c => c.serverId);
      
      if (serverIds.length > 0) {
        await invoke('save_session', { serverIds });
      }
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  },
  
  restoreSession: async () => {
    try {
      const session = await invoke<{ server_ids: number[] } | null>('get_session');
      
      if (session && session.server_ids.length > 0) {
        for (const serverId of session.server_ids) {
          const server = get().servers.find(s => s.id === serverId);
          if (server) {
            get().connectServer(serverId);
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore session:', err);
    }
  },
}));
