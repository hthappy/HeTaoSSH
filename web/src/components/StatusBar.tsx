import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, Cpu, HardDrive, MemoryStick, Network, Wifi, FileType, Lock, Clock, Server } from 'lucide-react';

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
  serverName = 'Not connected',
  isConnected = false,
  tabId,
}: StatusBarProps) {
  const getLatencyColor = (ms: number) => {
    if (ms < 50) return 'text-green-400';
    if (ms < 100) return 'text-yellow-400';
    return 'text-red-400';
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
    <div className="h-6 bg-zinc-900 border-t border-zinc-800 flex items-center px-3 text-xs text-zinc-400">
      {/* Left: connection info */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Server Status */}
        <div className="flex items-center gap-1.5">
          <Server className="w-3 h-3" />
          <span className={isConnected ? 'text-zinc-300' : 'text-zinc-500'}>
            {serverName}
          </span>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          <Wifi className="w-3 h-3" />
          <span className={isConnected ? 'text-green-400' : 'text-zinc-500'}>
            {isConnected ? 'Connected' : 'Disconnected'}
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
          <span className="font-mono text-zinc-500">{formatPermissions(permissions)}</span>
        </div>
      </div>

      {/* Center: Mini Monitor (compact), 真正居中（左右各 flex-1 占位） */}
      {isConnected && tabId && (
        <div
          className="hidden md:flex items-center gap-3 text-[11px] text-zinc-300 relative mx-auto"
          onMouseEnter={() => setMonitorHover(true)}
          onMouseLeave={() => setMonitorHover(false)}
        >
          <div className="flex items-center gap-1 text-zinc-500">
            <Activity className="w-3 h-3" />
            <span>Monitor</span>
          </div>
          {usage ? (
            <>
              <div className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-blue-400" />
                <span className="text-zinc-300">{usage.cpu_usage.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <MemoryStick className="w-3 h-3 text-green-400" />
                <span className="text-zinc-300">{usage.memory_usage.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <Network className="w-3 h-3 text-purple-400" />
                <span className="text-zinc-300">
                  ↓{formatBytes(usage.network_rx)} ↑{formatBytes(usage.network_tx)}
                </span>
              </div>
              {rootDisk && (
                <div className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-orange-400" />
                  <span className="text-zinc-300">/{rootDisk.usage_percent.toFixed(0)}%</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-zinc-500">{usageError ? '指标获取失败' : '加载中…'}</span>
          )}

          {/* Themed tooltip */}
          {monitorHover && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 pointer-events-none">
              <div className="rounded-md border border-zinc-700 bg-zinc-900/95 backdrop-blur-sm shadow-xl w-[520px] max-w-[80vw]">
                <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-200 font-medium">Monitor</span>
                  <span className="text-[10px] text-zinc-500">5s 刷新</span>
                </div>
                <div className="px-3 py-2 text-[11px] leading-5 text-zinc-200">
                  {!usage ? (
                    <div className="text-zinc-500">{usageError ? `获取失败：${usageError}` : '加载中…'}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-zinc-500">CPU</span>
                          <span className="font-mono">{usage.cpu_usage.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-zinc-500">内存</span>
                          <span className="font-mono">{usage.memory_usage.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 col-span-2">
                          <span className="text-zinc-500">网络</span>
                          <span className="font-mono">↓{formatBytes(usage.network_rx)} ↑{formatBytes(usage.network_tx)}</span>
                        </div>
                      </div>

                      <div className="pt-1">
                        <div className="text-zinc-500 mb-1">磁盘</div>
                        {diskTooltipRows.rows.length === 0 ? (
                          <div className="text-zinc-500">(无数据)</div>
                        ) : (
                          <div className="max-h-64 overflow-auto pr-1 no-scrollbar">
                            <div className="space-y-1">
                              {diskTooltipRows.rows.map((d) => (
                                <div key={d.mount_point} className="flex items-center gap-2">
                                  <span className="flex-1 min-w-0 truncate text-zinc-200" title={d.mount_point}>
                                    {d.mount_point}
                                  </span>
                                  <span className="w-10 text-right font-mono text-zinc-300">
                                    {d.usage_percent.toFixed(0)}%
                                  </span>
                                </div>
                              ))}
                              {diskTooltipRows.more > 0 && (
                                <div className="text-zinc-500 pt-1">
                                  还有 {diskTooltipRows.more} 项未显示…
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
              <div className="w-2 h-2 bg-zinc-900/95 border-r border-b border-zinc-700 rotate-45 ml-3 -mt-1" />
            </div>
          )}
        </div>
      )}

      {/* Right: version info */}
      <div className="flex items-center gap-4 flex-1 justify-end min-w-0">
        <span className="text-zinc-500">HetaoSSH v0.1.0</span>
      </div>
    </div>
  );
}
