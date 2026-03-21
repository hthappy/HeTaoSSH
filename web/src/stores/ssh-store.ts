import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ServerConfig } from '@/types/config'
import i18n from '@/i18n'
import { IPC_DEBOUNCE_MS } from '@/constants/ipc'

// Input buffering to prevent IPC flooding and key loss
// Accumulates keystrokes for a short window before sending
const inputBuffers: Record<number, string> = {};
const inputTimers: Record<number, NodeJS.Timeout> = {};

const sendBuffered = (serverId: number, data: string) => {
  // If buffer doesn't exist, init it
  if (!inputBuffers[serverId]) {
    inputBuffers[serverId] = '';
  }
  
  inputBuffers[serverId] += data;

  // If timer already running, just return (data is added to buffer)
  if (inputTimers[serverId]) {
    return;
  }

  // Start a new timer
  inputTimers[serverId] = setTimeout(async () => {
    const payload = inputBuffers[serverId];
    // Clear buffer and timer immediately
    inputBuffers[serverId] = '';
    delete inputTimers[serverId];
    
    if (!payload) return;

    try {
      await invoke('ssh_send', { tabId: `conn-${serverId}`, data: payload });
    } catch (err) {
      console.error(i18n.t('store.send_data_failed', { error: err }));
    }
  }, IPC_DEBOUNCE_MS);
};

export interface WorkspaceTab {
  id: string; // Unique ID for this tab (e.g., 'term-1', 'file-123')
  serverId?: number; // The backend connection it belongs to (optional for local terminal)
  type: 'terminal' | 'file' | 'local';
  title: string;
  filePath?: string; // Only valid if type === 'file'
  isLocal?: boolean;
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

  // Terminal API
  sendToTerminal: (serverId: number, data: string) => Promise<void>;
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
      sendBuffered(serverId, data);
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
