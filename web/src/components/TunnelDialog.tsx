import { useState, useCallback } from 'react';
import { X, Plus, Trash2, Activity } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { TunnelInfo, TunnelConfig, TunnelMode } from '@/types/tunnel';

interface TunnelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: number;
}

export function TunnelDialog({ isOpen, onClose, serverId }: TunnelDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TunnelMode>('local');
  const [localPort, setLocalPort] = useState<number>(8080);
  const [remoteHost, setRemoteHost] = useState<string>('localhost');
  const [remotePort, setRemotePort] = useState<number>(80);
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartTunnel = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const config: TunnelConfig = {
        mode,
        local_port: localPort,
        server_id: serverId,
      };
      
      if (mode === 'local') {
        config.remote_host = remoteHost;
        config.remote_port = remotePort;
      }
      
      const port = await invoke<number>('start_tunnel', {
        mode: config.mode,
        localPort: config.local_port,
        remoteHost: config.remote_host,
        remotePort: config.remote_port,
        serverId: config.server_id,
      });
      
      setTunnels(prev => [...prev, { local_port: port, mode: config.mode }]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [mode, localPort, remoteHost, remotePort, serverId]);

  const handleStopTunnel = useCallback(async (localPort: number) => {
    try {
      await invoke('stop_tunnel', { localPort });
      setTunnels(prev => prev.filter(t => t.local_port !== localPort));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const handleListTunnels = useCallback(async () => {
    try {
      const list = await invoke<TunnelInfo[]>('list_tunnels');
      setTunnels(list);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-term-bg border border-term-selection rounded-lg w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-term-blue" />
            <h2 className="text-lg font-semibold text-term-fg">{t('tunnel.title', 'Port Forwarding')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-term-selection/50 text-term-fg/60 hover:text-term-fg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-term-fg mb-2">
              {t('tunnel.mode', 'Mode')}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('local')}
                className={cn(
                  'flex-1 px-3 py-2 rounded text-sm transition-colors',
                  mode === 'local'
                    ? 'bg-term-blue text-white'
                    : 'bg-term-selection/30 text-term-fg hover:bg-term-selection/50'
                )}
              >
                {t('tunnel.local', 'Local Forward')}
              </button>
              <button
                onClick={() => setMode('dynamic')}
                className={cn(
                  'flex-1 px-3 py-2 rounded text-sm transition-colors',
                  mode === 'dynamic'
                    ? 'bg-term-blue text-white'
                    : 'bg-term-selection/30 text-term-fg hover:bg-term-selection/50'
                )}
              >
                {t('tunnel.dynamic', 'SOCKS Proxy')}
              </button>
            </div>
          </div>

          {/* Local Port */}
          <div>
            <label className="block text-sm font-medium text-term-fg mb-2">
              {t('tunnel.local_port', 'Local Port')}
            </label>
            <input
              type="number"
              value={localPort}
              onChange={(e) => setLocalPort(Number(e.target.value))}
              className="w-full px-3 py-2 bg-term-bg border border-term-selection rounded text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
              min={1}
              max={65535}
            />
          </div>

          {/* Remote Host/Port (only for local forwarding) */}
          {mode === 'local' && (
            <>
              <div>
                <label className="block text-sm font-medium text-term-fg mb-2">
                  {t('tunnel.remote_host', 'Remote Host')}
                </label>
                <input
                  type="text"
                  value={remoteHost}
                  onChange={(e) => setRemoteHost(e.target.value)}
                  className="w-full px-3 py-2 bg-term-bg border border-term-selection rounded text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
                  placeholder="localhost"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-term-fg mb-2">
                  {t('tunnel.remote_port', 'Remote Port')}
                </label>
                <input
                  type="number"
                  value={remotePort}
                  onChange={(e) => setRemotePort(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-term-bg border border-term-selection rounded text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue"
                  min={1}
                  max={65535}
                />
              </div>
            </>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStartTunnel}
            disabled={loading}
            className={cn(
              'w-full px-4 py-2 rounded font-medium transition-colors flex items-center justify-center gap-2',
              loading
                ? 'bg-term-selection/50 text-term-fg/50 cursor-not-allowed'
                : 'bg-term-blue text-white hover:bg-term-blue/80'
            )}
          >
            <Plus className="w-4 h-4" />
            {loading ? t('common.starting', 'Starting...') : t('tunnel.start', 'Start Tunnel')}
          </button>

          {/* List Tunnels Button */}
          <button
            onClick={handleListTunnels}
            className="w-full px-4 py-2 rounded font-medium bg-term-selection/30 text-term-fg hover:bg-term-selection/50 transition-colors"
          >
            {t('tunnel.list', 'List Active Tunnels')}
          </button>

          {/* Active Tunnels List */}
          {tunnels.length > 0 && (
            <div className="mt-4 border-t border-term-selection pt-4">
              <h3 className="text-sm font-medium text-term-fg mb-2">
                {t('tunnel.active', 'Active Tunnels')}
              </h3>
              <div className="space-y-2">
                {tunnels.map((tunnel) => (
                  <div
                    key={tunnel.local_port}
                    className="flex items-center justify-between p-3 bg-term-bg border border-term-selection rounded"
                  >
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-term-green" />
                      <span className="text-sm text-term-fg">
                        {tunnel.mode === 'local'
                          ? `127.0.0.1:${tunnel.local_port}`
                          : `SOCKS 127.0.0.1:${tunnel.local_port}`}
                      </span>
                    </div>
                    <button
                      onClick={() => handleStopTunnel(tunnel.local_port)}
                      className="p-1 rounded hover:bg-red-500/20 text-term-fg/60 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Usage Tips */}
        <div className="mt-4 p-3 bg-term-selection/20 rounded text-xs text-term-fg/60">
          <p className="font-medium mb-1">{t('tunnel.usage', 'Usage:')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('tunnel.tip_local', 'Local: Access remote service via localhost')}</li>
            <li>{t('tunnel.tip_socks', 'SOCKS: Use as proxy in browser/terminal')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
