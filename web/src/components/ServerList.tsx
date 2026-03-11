import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Plug, CheckCircle2 } from 'lucide-react';
import { useSshStore } from '@/stores/ssh-store';
import type { ServerConfig } from '@/types/config';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';

interface ServerListProps {
  onServerClick: (serverId: number) => void;
}

export function ServerList({ onServerClick }: ServerListProps) {
  const {
    servers,
    loading,
    error,
    connections,
    loadServers,
    saveServer,
    deleteServer,
    testConnection,
  } = useSshStore();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);
  const [testingServerId, setTestingServerId] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleAddServer = () => {
    setEditingServer(null);
    setShowAddDialog(true);
  };

  const handleEditServer = (server: ServerConfig) => {
    setEditingServer(server);
    setShowAddDialog(true);
  };

  const handleDeleteServer = async (id: number) => {
    if (confirm('Are you sure you want to delete this server?')) {
      await deleteServer(id);
    }
  };

  const handleTestConnection = async (server: ServerConfig) => {
    setTestingServerId(server.id ?? null);
    const success = await testConnection(server);
    if (success) {
      showToast('Connection successful!', 'success');
    } else {
      showToast('Connection failed or rejected.', 'error');
    }
    setTestingServerId(null);
  };

  return (
    <div className="w-full flex-shrink-0 h-full bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Servers</h2>
        <button
          onClick={handleAddServer}
          className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors"
          title="Add Server"
        >
          <Plus className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Server List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && !servers.length ? (
          <div className="text-center text-zinc-500 text-sm py-8">Loading...</div>
        ) : error ? (
          <div className="text-center text-red-400 text-sm py-8">{error}</div>
        ) : !servers.length ? (
          <div className="text-center text-zinc-500 text-sm py-8">No servers yet</div>
        ) : (
          <div className="space-y-1">
            {servers.map((server) => {
              const isConnected = connections.some(
                (c: { serverId: number; status: string }) => c.serverId === server.id && c.status === 'connected'
              );
              const isTesting = testingServerId === server.id;

              return (
                <div
                  key={server.id}
                  className={cn(
                    'group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
                    isConnected
                      ? 'bg-green-900/30 border border-green-800'
                      : 'hover:bg-zinc-800'
                  )}
                  onClick={() => onServerClick(server.id!)}
                >
                  {/* Connection Status Icon */}
                  <div className="flex-shrink-0">
                    {isConnected ? (
                      <Plug className="w-4 h-4 text-green-400" />
                    ) : (
                      <Plug className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>

                  {/* Server Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200 truncate">
                      {server.name}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      {server.username}@{server.host}:{server.port}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isTesting ? (
                      <div className="w-4 h-4 flex items-center justify-center">
                        <div className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestConnection(server);
                        }}
                        className="p-1 hover:bg-zinc-700 rounded"
                        title="Test Connection"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditServer(server);
                      }}
                      className="p-1 hover:bg-zinc-700 rounded"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteServer(server.id!);
                      }}
                      className="p-1 hover:bg-zinc-700 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Server Dialog */}
      {showAddDialog && (
        <ServerFormDialog
          server={editingServer}
          onClose={() => setShowAddDialog(false)}
          onSave={async (config) => {
            await saveServer(config);
            setShowAddDialog(false);
          }}
        />
      )}
    </div>
  );
}

interface ServerFormDialogProps {
  server: ServerConfig | null;
  onClose: () => void;
  onSave: (config: ServerConfig) => Promise<void>;
}

function ServerFormDialog({ server, onClose, onSave }: ServerFormDialogProps) {
  const [formData, setFormData] = useState<ServerConfig>(
    server ?? {
      name: '',
      host: '',
      port: 22,
      username: '',
      password: '',
      private_key_path: '',
      passphrase: '',
    }
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-zinc-100 mb-4">
          {server ? 'Edit Server' : 'Add Server'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-zinc-400 mb-1">Host</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Port</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={1}
                max={65535}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Password (optional)</label>
            <input
              type="password"
              value={formData.password || ''}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Leave empty for key auth"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Private Key Path (optional)</label>
            <input
              type="text"
              value={formData.private_key_path || ''}
              onChange={(e) => setFormData({ ...formData, private_key_path: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="~/.ssh/id_ed25519"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Passphrase (optional)</label>
            <input
              type="password"
              value={formData.passphrase || ''}
              onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-md text-white transition-colors"
            >
              {saving ? 'Saving...' : server ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
