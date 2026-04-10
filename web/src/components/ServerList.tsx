import { useState, useEffect, forwardRef, useImperativeHandle, Ref } from 'react';
import { Plus, Trash2, Edit2, Plug, PlugZap, CheckCircle2, Search } from 'lucide-react';
import { useSshStore } from '@/stores/ssh-store';
import type { ServerConfig } from '@/types/config';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '@/components/ContextMenu';

export interface ServerListHandle {
  openAddDialog: () => void;
}

import { ServerFormDialog } from './ServerFormDialog';
import { ConfirmDialog } from './ConfirmDialog';

interface ServerListProps {
  onServerClick: (serverId: number) => void;
}

export const ServerList = forwardRef(({ onServerClick }: ServerListProps, ref: Ref<ServerListHandle>) => {
  const { t } = useTranslation();
  const {
    servers,
    loading,
    error,
    connections,
    loadServers,
    saveServer,
    deleteServer,
  } = useSshStore();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);
  const [deletingServerId, setDeletingServerId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    server?: ServerConfig;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    openAddDialog: () => {
      setEditingServer(null);
      setShowAddDialog(true);
    }
  }), []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const filteredServers = servers.filter(server =>
    server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    server.host.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddServer = () => {
    setEditingServer(null);
    setShowAddDialog(true);
  };

  const handleEditServer = (server: ServerConfig) => {
    setEditingServer(server);
    setShowAddDialog(true);
  };

  const handleDeleteServer = (id: number) => {
    setDeletingServerId(id);
  };

  const confirmDeleteServer = async () => {
    if (deletingServerId !== null) {
      await deleteServer(deletingServerId);
      setDeletingServerId(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, server: ServerConfig) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      server
    });
  };

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY
    });
  };

  const handleConnect = (server: ServerConfig) => {
    onServerClick(server.id!);
    setContextMenu(null);
  };

  return (
    <div
      className="w-full flex-shrink-0 h-full bg-term-bg flex flex-col border-r border-term-selection"
      onContextMenu={handleBackgroundContextMenu}
    >
      {/* Context Menu - Duplicate removed */}

      {/* Header with Title (Aligned with TitleBar) */}
      <div className="h-10 flex items-center justify-between px-3 flex-shrink-0 bg-term-bg">
        <h2 className="text-sm font-semibold text-term-fg">{t('server.list')}</h2>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAddServer();
          }}
          className="p-1.5 hover:bg-term-selection rounded-md transition-colors"
          title={t('server.add')}
        >
          <Plus className="w-4 h-4 text-term-fg/60" />
        </button>
      </div>

      {/* Search Input Area */}
      <div className="p-2 border-b border-term-selection flex-shrink-0 bg-term-bg">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-term-fg/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.search', 'Search...')}
            className="w-full bg-term-selection/30 text-term-fg text-xs pl-8 pr-2 py-1.5 rounded border border-transparent focus:border-term-blue focus:bg-term-selection/50 focus:outline-none transition-all placeholder-term-fg/40"
          />
        </div>
      </div>

      {/* Server List */}
      <div className={cn(
        "flex-1 overflow-y-auto p-2 transition-opacity duration-200 scroll-smooth",
        "scrollbar-thin scrollbar-thumb-term-selection/50 scrollbar-track-transparent hover:scrollbar-thumb-term-selection"
      )}>
        {loading && !servers.length ? (
          <div className="text-center text-term-fg/40 text-sm py-8">{t('common.loading')}</div>
        ) : error ? (
          <div className="text-center text-term-red text-sm py-8">{error}</div>
        ) : !servers.length ? (
          <div className="text-center text-term-fg/40 text-sm py-8">{t('server.no_servers')}</div>
        ) : filteredServers.length === 0 ? (
          <div className="text-center text-term-fg/40 text-sm py-8">{t('common.no_results', 'No results found')}</div>
        ) : (
          <div className="space-y-1">
            {filteredServers.map((server) => {
              const isConnected = connections.some(
                (c: { serverId: number; status: string }) => c.serverId === server.id && c.status === 'connected'
              );

              return (
                <div
                  key={server.id}
                  onContextMenu={(e) => handleContextMenu(e, server)}
                  className={cn(
                    'group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all duration-200',
                    'hover:bg-term-selection border border-transparent'
                  )}
                  onClick={() => onServerClick(server.id!)}
                >
                  {/* Connection Status Icon */}
                  <div className="flex-shrink-0">
                    {isConnected ? (
                      <Plug className="w-4 h-4 text-term-green" />
                    ) : (
                      <PlugZap className="w-4 h-4 text-term-fg/30" />
                    )}
                  </div>

                  {/* Server Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-term-fg truncate">
                      {server.name}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
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

      {/* Delete Confirmation Dialog */}
      {deletingServerId !== null && (
        <ConfirmDialog
          title={t('common.delete', 'Delete')}
          message={t('server.delete_confirm', 'Are you sure you want to delete this server?')}
          onConfirm={confirmDeleteServer}
          onCancel={() => setDeletingServerId(null)}
          isDanger={true}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          {contextMenu.server ? (
            <div className="flex flex-col gap-0.5 p-1 min-w-[160px]">
              <ContextMenuItem
                label={t('common.connect', 'Connect')}
                icon={<CheckCircle2 className="w-4 h-4" />}
                onClick={() => handleConnect(contextMenu.server!)}
              />
              <ContextMenuSeparator />
              <ContextMenuItem
                label={t('common.edit', 'Edit')}
                icon={<Edit2 className="w-4 h-4" />}
                onClick={() => {
                  handleEditServer(contextMenu.server!);
                  setContextMenu(null);
                }}
              />
              <ContextMenuItem
                label={t('common.delete', 'Delete')}
                icon={<Trash2 className="w-4 h-4" />}
                danger
                onClick={() => {
                  handleDeleteServer(contextMenu.server!.id!);
                  setContextMenu(null);
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 p-1 min-w-[160px]">
              <ContextMenuItem
                label={t('server.add', 'Add Server')}
                icon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  handleAddServer();
                  setContextMenu(null);
                }}
              />
            </div>
          )}
        </ContextMenu>
      )}
    </div>
  );
});
