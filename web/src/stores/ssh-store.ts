import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { ServerConfig } from '@/types/config'
import { debounce } from 'lodash-es'
import i18n from '@/i18n'

// IPC 防抖函数：防止高频调用后端
// 防抖窗口 50ms，最多等待 150ms
const sendToTerminalDebounced = debounce(
  async (serverId: number, data: string) => {
    try {
      await invoke('ssh_send', { tabId: `conn-${serverId}`, data })
    } catch (err) {
      console.error(i18n.t('store.send_data_failed', { error: err }))
    }
  },
  50, // 50ms 防抖窗口
  {
    leading: false,
    trailing: true,
    maxWait: 150 // 最多等待 150ms
  }
)

export interface WorkspaceTab {
  id: string; // Unique ID for this tab (e.g., 'term-1', 'file-123')
  serverId: number; // The backend connection it belongs to
  type: 'terminal' | 'file';
  title: string;
  filePath?: string; // Only valid if type === 'file'
}

export interface ConnectionStatus {
  serverId: number;
  status: 'connected' | 'connecting' | 'disconnected';
  error?: string;
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
    };

    set({ workspaceTabs: [...get().workspaceTabs, newTab], activeTabId: newTab.id });
  },

  closeTab: (tabId: string) => {
    const tab = get().workspaceTabs.find(t => t.id === tabId);
    
    // 如果关闭的是 terminal tab，同时断开连接
    if (tab?.type === 'terminal') {
      const serverId = tab.serverId;
      const backendClosed = get().connections.find(c => c.serverId === serverId);
      if (backendClosed && backendClosed.status === 'connected') {
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

  updateConnectionStatus: (serverId: number, status: Partial<ConnectionStatus>) => {
    set({
      connections: get().connections.map(c => (c.serverId === serverId ? { ...c, ...status } : c)),
    });
  },

  sendToTerminal: async (serverId: number, data: string) => {
    // 使用防抖版本，防止高频调用后端
    sendToTerminalDebounced(serverId, data)
  },
}));
