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
    const MAX = 12;
    const rows = usage.disk_usage.slice(0, MAX);
    return { rows, more: Math.max(0, usage.disk_usage.length - rows.length) };
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

      {/* Center: Mini Monitor (compact), 真正居中（左右各 flex-1 占位） */}
      {isConnected && tabId && (
        <div
          className="hidden md:flex items-center gap-3 text-[11px] text-term-fg opacity-80 relative mx-auto"
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
            <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 pointer-events-none">
              <div className="rounded-md border border-term-selection bg-term-bg/95 backdrop-blur-sm shadow-xl w-[520px] max-w-[80vw]">
                <div className="px-3 py-2 border-b border-term-selection flex items-center justify-between">
                  <span className="text-[11px] text-term-fg font-medium">{t('status.monitor')}</span>
                  <span className="text-[10px] text-term-brightBlack">{t('status.refresh_rate')}</span>
                </div>
                <div className="px-3 py-2 text-[11px] leading-5 text-term-fg">
                  {!usage ? (
                    <div className="text-term-brightBlack">{usageError ? t('status.fetch_failed', { error: usageError }) : t('status.loading')}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-term-brightBlack">{t('status.cpu')}</span>
                          <span className="font-mono">{usage.cpu_usage.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-term-brightBlack">{t('status.memory')}</span>
                          <span className="font-mono">{usage.memory_usage.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 col-span-2">
                          <span className="text-term-brightBlack">{t('status.network')}</span>
                          <span className="font-mono">↓{formatBytes(usage.network_rx)} ↑{formatBytes(usage.network_tx)}</span>
                        </div>
                      </div>

                      <div className="pt-1">
                        <div className="text-term-brightBlack mb-1">{t('status.disk')}</div>
                        {diskTooltipRows.rows.length === 0 ? (
                          <div className="text-term-brightBlack">{t('status.no_data')}</div>
                        ) : (
                          <div className="max-h-64 overflow-auto pr-1 no-scrollbar">
                            <div className="space-y-1">
                              {diskTooltipRows.rows.map((d) => (
                                <div key={d.mount_point} className="flex items-center gap-2">
                                  <span className="flex-1 min-w-0 truncate text-term-fg" title={d.mount_point}>
                                    {d.mount_point}
                                  </span>
                                  <span className="w-10 text-right font-mono text-term-fg opacity-80">
                                    {d.usage_percent.toFixed(0)}%
                                  </span>
                                </div>
                              ))}
                              {diskTooltipRows.more > 0 && (
                                <div className="text-term-brightBlack pt-1">
                                  {t('status.disk_more', { count: diskTooltipRows.more })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="w-2 h-2 bg-term-bg/95 border-r border-b border-term-selection rotate-45 ml-3 -mt-1" />
            </div>
          )}
        </div>
      )}

      {/* Right: version info */}
      <div className="flex items-center gap-4 flex-1 justify-end min-w-0">
        <span className="text-term-brightBlack">HetaoSSH v0.1.0</span>
      </div>
    </div>
  );
}
