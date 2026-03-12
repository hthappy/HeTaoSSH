import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Plug, CheckCircle2 } from 'lucide-react';
import { useSshStore } from '@/stores/ssh-store';
import type { ServerConfig } from '@/types/config';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { useTranslation } from 'react-i18next';

interface ServerListProps {
  onServerClick: (serverId: number) => void;
}

export function ServerList({ onServerClick }: ServerListProps) {
  const { t } = useTranslation();
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
    if (confirm(t('server.delete_confirm'))) {
      await deleteServer(id);
    }
  };

  const handleTestConnection = async (server: ServerConfig) => {
    setTestingServerId(server.id ?? null);
    const success = await testConnection(server);
    if (success) {
      showToast(t('server.test_success'), 'success');
    } else {
      showToast(t('server.test_failed'), 'error');
    }
    setTestingServerId(null);
  };

  return (
    <div className="w-full flex-shrink-0 h-full bg-term-bg flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-term-selection flex items-center justify-between">
        <h2 className="text-sm font-semibold text-term-fg">{t('server.list')}</h2>
        <button
          onClick={handleAddServer}
          className="p-1.5 hover:bg-term-selection rounded-md transition-colors"
          title={t('server.add')}
        >
          <Plus className="w-4 h-4 text-term-fg/60" />
        </button>
      </div>

      {/* Server List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && !servers.length ? (
          <div className="text-center text-term-fg/40 text-sm py-8">{t('common.loading')}</div>
        ) : error ? (
          <div className="text-center text-term-red text-sm py-8">{error}</div>
        ) : !servers.length ? (
          <div className="text-center text-term-fg/40 text-sm py-8">{t('server.no_servers')}</div>
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
                      ? 'bg-term-green/20 border border-term-green/50'
                      : 'hover:bg-term-selection'
                  )}
                  onClick={() => onServerClick(server.id!)}
                >
                  {/* Connection Status Icon */}
                  <div className="flex-shrink-0">
                    {isConnected ? (
                      <Plug className="w-4 h-4 text-term-green" />
                    ) : (
                      <Plug className="w-4 h-4 text-term-fg/40" />
                    )}
                  </div>

                  {/* Server Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-term-fg truncate">
                      {server.name}
                    </div>
                    <div className="text-xs text-term-fg/40 truncate">
                      {server.username}@{server.host}:{server.port}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isTesting ? (
                      <div className="w-4 h-4 flex items-center justify-center">
                        <div className="w-3 h-3 border-2 border-term-fg/40 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestConnection(server);
                        }}
                        className="p-1 hover:bg-term-selection rounded"
                        title={t('common.connect')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-term-fg/60" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditServer(server);
                      }}
                      className="p-1 hover:bg-term-selection rounded"
                      title={t('common.edit')}
                    >
                      <Edit2 className="w-3.5 h-3.5 text-term-fg/60" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteServer(server.id!);
                      }}
                      className="p-1 hover:bg-term-selection rounded"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-term-fg/60" />
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
  const { t } = useTranslation();
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
      <div className="bg-term-bg rounded-lg border border-term-selection w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-term-fg mb-4">
          {server ? t('server.edit') : t('server.add')}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.name')}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-term-fg/60 mb-1">{t('server.host')}</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
                placeholder="example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-term-fg/60 mb-1">{t('server.port')}</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
                min={1}
                max={65535}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.username')}</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.password_optional')}</label>
            <input
              type="password"
              value={formData.password || ''}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
              placeholder={t('server.password_placeholder')}
            />
          </div>

          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.private_key_path')}</label>
            <input
              type="text"
              value={formData.private_key_path || ''}
              onChange={(e) => setFormData({ ...formData, private_key_path: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
              placeholder="~/.ssh/id_ed25519"
            />
          </div>

          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.passphrase')}</label>
            <input
              type="password"
              value={formData.passphrase || ''}
              onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-term-selection hover:bg-term-selection/80 rounded-md text-term-fg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-term-blue hover:bg-term-blue/80 disabled:bg-term-blue/50 rounded-md text-term-bg font-medium transition-colors"
            >
              {saving ? t('common.saving') : server ? t('common.update') : t('common.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
