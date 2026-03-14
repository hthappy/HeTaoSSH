import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { ServerConfig } from '@/types/config'
import i18n from '@/i18n'

// Input buffering to prevent IPC flooding and key loss
// Accumulates keystrokes for a short window (5ms) before sending
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
  }, 5); // 5ms latency is imperceptible but allows batching rapid inputs
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
  createLocalTerminal: () => Promise<void>;
  updateConnectionStatus: (serverId: number, status: Partial<ConnectionStatus>) => void;

  // Tab Management
  openTerminalTab: (serverId: number) => void;
  openFileTab: (serverId: number, filePath: string, fileName: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Terminal API
  sendToTerminal: (serverId: number, data: string) => Promise<void>;
}

export const useSshStore = create<SshState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,
  connections: [],
  workspaceTabs: [],
  activeTabId: null,

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

    try {
      // Backend expects a stable string identifier for the connection
      await invoke('ssh_connect', { tabId: `conn-${serverId}`, config: server });
      get().updateConnectionStatus(serverId, { status: 'connected' });
    } catch (err) {
      get().updateConnectionStatus(serverId, { 
        status: 'disconnected', 
        error: i18n.t('store.connect_failed', { error: err })
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

  updateConnectionStatus: (serverId: number, status: Partial<ConnectionStatus>) => {
    set({
      connections: get().connections.map(c => (c.serverId === serverId ? { ...c, ...status } : c)),
    });
  },

  sendToTerminal: async (serverId: number, data: string) => {
    // Check if it's a local terminal
    const conn = get().connections.find(c => c.serverId === serverId);
    if (conn?.isLocal) {
       // For local terminal, we might want to send directly or buffer differently
       // For now, let's just invoke directly to avoid mixing with SSH buffer logic which uses 'ssh_send'
       // But wait, the buffer uses 'ssh_send'. We need 'local_term_write'.
       try {
         // Convert string to byte array for Rust
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
}));
