import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ServerConfig } from '@/types/config';

export interface ConnectionTab {
  id: string;
  serverId: number;
  serverName: string;
  status: 'connected' | 'connecting' | 'disconnected';
  error?: string;
}

interface SshState {
  servers: ServerConfig[];
  loading: boolean;
  error: string | null;
  tabs: ConnectionTab[];
  activeTabId: string | null;

  loadServers: () => Promise<void>;
  saveServer: (config: ServerConfig) => Promise<void>;
  deleteServer: (id: number) => Promise<void>;
  testConnection: (config: ServerConfig) => Promise<boolean>;
  openTab: (serverId: number) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabStatus: (tabId: string, status: Partial<ConnectionTab>) => void;
  sendToTerminal: (tabId: string, data: string) => Promise<void>;
}

export const useSshStore = create<SshState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,
  tabs: [],
  activeTabId: null,

  loadServers: async () => {
    set({ loading: true, error: null });
    try {
      const servers = await invoke<ServerConfig[]>('list_servers');
      set({ servers, loading: false });
    } catch (err) {
      set({ error: `Failed to load servers: ${err}`, loading: false });
    }
  },

  saveServer: async (config: ServerConfig) => {
    set({ loading: true, error: null });
    try {
      await invoke<number>('save_server', { config });
      await get().loadServers();
    } catch (err) {
      set({ error: `Failed to save server: ${err}`, loading: false });
      throw err;
    }
  },

  deleteServer: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await invoke('delete_server', { id });
      await get().loadServers();
    } catch (err) {
      set({ error: `Failed to delete server: ${err}`, loading: false });
      throw err;
    }
  },

  testConnection: async (config: ServerConfig) => {
    try {
      const result = await invoke<string>('test_connection', { config });
      return result === 'Connection successful';
    } catch (err) {
      set({ error: `Connection test failed: ${err}` });
      return false;
    }
  },

  openTab: async (serverId: number) => {
    const server = get().servers.find(s => s.id === serverId);
    if (!server) {
      console.error('Server not found:', serverId);
      return;
    }

    const tabId = `tab-${Date.now()}-${serverId}`;
    const newTab: ConnectionTab = {
      id: tabId,
      serverId,
      serverName: server.name,
      status: 'connecting',
    };

    set({ tabs: [...get().tabs, newTab], activeTabId: tabId });

    try {
      await invoke('ssh_connect', { tabId, config: server });
      get().updateTabStatus(tabId, { status: 'connected' });
    } catch (err) {
      get().updateTabStatus(tabId, { 
        status: 'disconnected', 
        error: `Failed to connect: ${err}` 
      });
    }
  },

  closeTab: (tabId: string) => {
    const newTabs = get().tabs.filter(t => t.id !== tabId);
    let newActiveTabId = get().activeTabId;

    if (newActiveTabId === tabId) {
      newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }

    set({ tabs: newTabs, activeTabId: newActiveTabId });
  },

  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  updateTabStatus: (tabId: string, status: Partial<ConnectionTab>) => {
    set({
      tabs: get().tabs.map(t => (t.id === tabId ? { ...t, ...status } : t)),
    });
  },

  sendToTerminal: async (tabId: string, data: string) => {
    try {
      await invoke('ssh_send', { tabId, data });
    } catch (err) {
      console.error('Failed to send data:', err);
    }
  },
}));
