import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, Cpu, HardDrive, MemoryStick, Network, Wifi, FileType, Lock, Clock, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StatusBarProps {
  latency?: number;
  encoding?: string;
  permissions?: string;
  serverName?: string;
  isConnected?: boolean;
  tabId?: string;
}

interface SystemUsage {
  cpu_usage: number;
  memory_usage: number;
  network_rx: number;
  network_tx: number;
  disk_usage: Array<{
    mount_point: string;
    usage_percent: number;
  }>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const ProgressBar = ({ value, colorClass }: { value: number, colorClass: string }) => (
  <div className="h-1.5 w-full bg-term-selection/30 rounded-full overflow-hidden">
    <div 
      className={`h-full ${colorClass} transition-all duration-500`} 
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }} 
    />
  </div>
);

export function StatusBar({
  latency = 45,
  encoding = 'UTF-8',
  permissions = 'rw-r--r--',
  serverName,
  isConnected = false,
  tabId,
}: StatusBarProps) {
  const { t } = useTranslation();

  const getLatencyColor = (ms: number) => {
    if (ms < 50) return 'text-[var(--term-green)]';
    if (ms < 100) return 'text-[var(--term-yellow)]';
    return 'text-[var(--term-red)]';
  };

  const formatPermissions = (perm: string) => {
    // Simple formatter for demonstration
    return perm;
  };

  const [usage, setUsage] = useState<SystemUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [monitorHover, setMonitorHover] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!tabId || !isConnected) return;
    try {
      const data = await invoke<SystemUsage>('get_system_usage', { tabId });
      setUsage(data);
      setUsageError(null);
    } catch (e) {
      setUsageError(`${e}`);
    }
  }, [isConnected, tabId]);

  useEffect(() => {
    if (!tabId || !isConnected) {
      setUsage(null);
      setUsageError(null);
      return;
    }
    fetchUsage();
    const interval = window.setInterval(fetchUsage, 5000);
    return () => window.clearInterval(interval);
  }, [fetchUsage, isConnected, tabId]);

  const rootDisk = useMemo(() => {
    if (!usage?.disk_usage?.length) return null;
    return usage.disk_usage.find((d) => d.mount_point === '/') ?? usage.disk_usage[0];
  }, [usage]);

  const diskTooltipRows = useMemo(() => {
    if (!usage?.disk_usage?.length) return { rows: [], more: 0 };
    
    // Filter out noisy mounts (docker overlays, tmpfs, etc.)
    const filtered = usage.disk_usage.filter(d => {
      const mp = d.mount_point;
      return !mp.startsWith('/var/lib/docker/overlay') && 
             !mp.startsWith('/run') && 
             !mp.startsWith('/sys') && 
             !mp.startsWith('/proc') && 
             !mp.startsWith('/dev');
    });

    const MAX = 8;
    const rows = filtered.slice(0, MAX);
    return { rows, more: Math.max(0, filtered.length - rows.length) };
  }, [usage]);

  return (
    <div className="h-6 bg-[var(--term-bg)] border-t border-[var(--term-selection)] flex items-center px-3 text-xs text-[var(--term-fg)] opacity-80">
      {/* Left: connection info */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Server Status */}
        <div className="flex items-center gap-1.5">
          <Server className="w-3 h-3" />
          <span className={isConnected ? 'text-[var(--term-green)]' : 'text-[var(--term-fg)] opacity-50'}>
            {serverName || t('status.not_connected')}
          </span>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          <Wifi className="w-3 h-3" />
          <span className={isConnected ? 'text-term-green' : 'text-term-brightBlack'}>
            {isConnected ? t('status.connected') : t('status.disconnected')}
          </span>
        </div>

        {/* Latency */}
        {isConnected && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span className={getLatencyColor(latency)}>
              {latency}ms
            </span>
          </div>
        )}

        {/* Encoding */}
        <div className="flex items-center gap-1.5">
          <FileType className="w-3 h-3" />
          <span>{encoding}</span>
        </div>

        {/* Permissions */}
        <div className="flex items-center gap-1.5">
          <Lock className="w-3 h-3" />
          <span className="font-mono text-term-brightBlack">{formatPermissions(permissions)}</span>
        </div>
      </div>

      {/* Monitor (moved to right) */}
      {isConnected && tabId && (
        <div
          className="flex items-center gap-3 text-[11px] text-term-fg opacity-80 relative ml-4"
          onMouseEnter={() => setMonitorHover(true)}
          onMouseLeave={() => setMonitorHover(false)}
        >
          <div className="flex items-center gap-1 text-term-brightBlack">
            <Activity className="w-3 h-3" />
            <span>{t('status.monitor')}</span>
          </div>
          {usage ? (
            <>
              <div className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-term-blue" />
                <span className="text-term-fg opacity-80">{usage.cpu_usage.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <MemoryStick className="w-3 h-3 text-term-green" />
                <span className="text-term-fg opacity-80">{usage.memory_usage.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <Network className="w-3 h-3 text-term-magenta" />
                <span className="text-term-fg opacity-80">
                  ↓{formatBytes(usage.network_rx)} ↑{formatBytes(usage.network_tx)}
                </span>
              </div>
              {rootDisk && (
                <div className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-term-yellow" />
                  <span className="text-term-fg opacity-80">/{rootDisk.usage_percent.toFixed(0)}%</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-term-brightBlack">{usageError ? t('common.error') : t('status.loading')}</span>
          )}

          {/* Themed tooltip */}
          {monitorHover && (
            <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 pointer-events-none">
              <div className="rounded-lg border border-term-selection bg-term-bg/95 backdrop-blur-sm shadow-xl w-[320px] p-3">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-term-selection/50">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-term-blue" />
                    <span className="text-xs font-semibold text-term-fg">{t('status.monitor')}</span>
                  </div>
                  <span className="text-[10px] text-term-brightBlack bg-term-selection/20 px-1.5 py-0.5 rounded">{t('status.refresh_rate')}</span>
                </div>

                {!usage ? (
                  <div className="text-term-brightBlack text-xs py-2">{usageError ? t('status.fetch_failed', { error: usageError }) : t('status.loading')}</div>
                ) : (
                  <div className="space-y-4">
                    {/* CPU & Memory Cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-term-selection/10 rounded-md p-2.5 border border-term-selection/20">
                        <div className="flex items-center gap-1.5 text-term-brightBlack mb-1">
                          <Cpu className="w-3 h-3" />
                          <span className="text-[10px]">{t('status.cpu')}</span>
                        </div>
                        <div className="flex items-end justify-between mb-1.5">
                          <span className="text-lg font-mono font-medium text-term-fg leading-none">{usage.cpu_usage.toFixed(0)}<span className="text-xs text-term-fg/50">%</span></span>
                        </div>
                        <ProgressBar value={usage.cpu_usage} colorClass="bg-term-blue" />
                      </div>

                      <div className="bg-term-selection/10 rounded-md p-2.5 border border-term-selection/20">
                        <div className="flex items-center gap-1.5 text-term-brightBlack mb-1">
                          <MemoryStick className="w-3 h-3" />
                          <span className="text-[10px]">{t('status.memory')}</span>
                        </div>
                        <div className="flex items-end justify-between mb-1.5">
                          <span className="text-lg font-mono font-medium text-term-fg leading-none">{usage.memory_usage.toFixed(0)}<span className="text-xs text-term-fg/50">%</span></span>
                        </div>
                        <ProgressBar value={usage.memory_usage} colorClass="bg-term-green" />
                      </div>
                    </div>

                    {/* Network */}
                    <div className="bg-term-selection/10 rounded-md p-2.5 border border-term-selection/20">
                      <div className="flex items-center gap-1.5 text-term-brightBlack mb-2">
                        <Network className="w-3 h-3" />
                        <span className="text-[10px]">{t('status.network')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-term-fg/50">Download</span>
                          <span className="font-mono text-xs text-term-fg">↓ {formatBytes(usage.network_rx)}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-term-fg/50">Upload</span>
                          <span className="font-mono text-xs text-term-fg">↑ {formatBytes(usage.network_tx)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Disk Usage */}
                    <div>
                      <div className="flex items-center gap-1.5 text-term-brightBlack mb-2 px-1">
                        <HardDrive className="w-3 h-3" />
                        <span className="text-[10px]">{t('status.disk')}</span>
                      </div>
                      {diskTooltipRows.rows.length === 0 ? (
                        <div className="text-term-brightBlack text-xs px-1">{t('status.no_data')}</div>
                      ) : (
                        <div className="space-y-2.5 px-1">
                          {diskTooltipRows.rows.map((d) => (
                            <div key={d.mount_point}>
                              <div className="flex items-center justify-between mb-1 text-xs">
                                <span className="text-term-fg/80 truncate max-w-[150px]" title={d.mount_point}>
                                  {d.mount_point}
                                </span>
                                <span className="font-mono text-term-fg">{d.usage_percent.toFixed(0)}%</span>
                              </div>
                              <ProgressBar value={d.usage_percent} colorClass="bg-term-yellow" />
                            </div>
                          ))}
                          {diskTooltipRows.more > 0 && (
                            <div className="text-[10px] text-term-brightBlack text-center pt-1">
                              {t('status.disk_more', { count: diskTooltipRows.more })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
