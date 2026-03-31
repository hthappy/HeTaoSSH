import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Activity, Cpu, HardDrive, MemoryStick, Network, Wifi, Clock, Server, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StatusBarProps {
  serverName?: string;
  isConnected?: boolean;
  tabId?: string;
}

interface ReconnectEvent {
  id: string;
  attempt: number;
  max_attempts: number;
}

interface SystemUsage {
  cpu_usage: number;
  memory_usage: number;
  memory_total: number;
  memory_used: number;
  memory_available: number;
  network_rx: number;
  network_tx: number;
  uptime: number;
  load_average: number[];
  disk_usage: Array<{
    mount_point: string;
    total: number;
    used: number;
    available: number;
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

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const ProgressBar = ({ value, colorClass }: { value: number, colorClass: string }) => (
  <div className="h-1.5 w-full bg-term-selection/30 rounded-full overflow-hidden">
    <div 
      className={`h-full ${colorClass} transition-all duration-500`} 
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }} 
    />
  </div>
);

function getLatencyColor(ms: number): string {
  if (ms < 50) return 'text-[var(--term-green)]';
  if (ms < 100) return 'text-[var(--term-yellow)]';
  return 'text-[var(--term-red)]';
}

export function StatusBar({
  serverName,
  isConnected = false,
  tabId,
}: StatusBarProps) {
  const { t } = useTranslation();

  const [latency, setLatency] = useState<number>(0);
  const [usage, setUsage] = useState<SystemUsage | null>(null);
  const [networkSpeed, setNetworkSpeed] = useState<{ rx: number; tx: number }>({ rx: 0, tx: 0 });
  const [usageError, setUsageError] = useState<string | null>(null);
  const [monitorHover, setMonitorHover] = useState(false);
  const [reconnectInfo, setReconnectInfo] = useState<{ attempt: number; max: number } | null>(null);
  const lastUsageRef = useRef<{ usage: SystemUsage; time: number } | null>(null);
  
  const currentTabIdRef = useRef(tabId);
  
  // Listen for reconnect events
  useEffect(() => {
    const unlistenReconnecting = listen<ReconnectEvent>('ssh-reconnecting', (event) => {
      setReconnectInfo({ attempt: event.payload.attempt, max: event.payload.max_attempts });
    });
    
    const unlistenReconnected = listen<string>('ssh-reconnected', () => {
      setReconnectInfo(null);
    });
    
    const unlistenDisconnected = listen<string>('ssh-disconnected', () => {
      setReconnectInfo(null);
    });
    
    return () => {
      unlistenReconnecting.then(f => f());
      unlistenReconnected.then(f => f());
      unlistenDisconnected.then(f => f());
    };
  }, []);
  
  useEffect(() => {
    currentTabIdRef.current = tabId;
    setUsage(null);
    setUsageError(null);
    lastUsageRef.current = null;
    setNetworkSpeed({ rx: 0, tx: 0 });
    setReconnectInfo(null);
    setLatency(0);
  }, [tabId]);

  // Fetch latency
  const fetchLatency = useCallback(async () => {
    if (!tabId || !isConnected) return;
    
    try {
      const ms = await invoke<number>('get_latency', { tabId });
      if (currentTabIdRef.current === tabId) {
        setLatency(ms);
      }
    } catch {
      // Ignore latency errors - not critical
    }
  }, [isConnected, tabId]);

  const fetchUsage = useCallback(async () => {
    if (!tabId || !isConnected) return;
    
    try {
      const data = await invoke<SystemUsage>('get_system_usage', { tabId });
      
      // Prevent race condition: if tab changed during fetch, ignore result
      if (currentTabIdRef.current !== tabId) return;

      const now = Date.now();

      if (lastUsageRef.current) {
        // Calculate speed based on diff from last fetch
        const timeDiff = (now - lastUsageRef.current.time) / 1000;
        if (timeDiff > 0) {
          const rxDiff = Math.max(0, data.network_rx - lastUsageRef.current.usage.network_rx);
          const txDiff = Math.max(0, data.network_tx - lastUsageRef.current.usage.network_tx);
          setNetworkSpeed({
            rx: rxDiff / timeDiff,
            tx: txDiff / timeDiff
          });
        }
      }

      lastUsageRef.current = { usage: data, time: now };
      setUsage(data);
      setUsageError(null);
    } catch (e) {
      if (currentTabIdRef.current !== tabId) return;
      setUsageError(`${e}`);
    }
  }, [isConnected, tabId]);

  useEffect(() => {
    if (!tabId || !isConnected) {
      setUsage(null);
      setUsageError(null);
      lastUsageRef.current = null;
      setNetworkSpeed({ rx: 0, tx: 0 });
      setReconnectInfo(null);
      setLatency(0);
      return;
    }
    fetchUsage();
    fetchLatency();
    const usageInterval = window.setInterval(fetchUsage, 3000);
    const latencyInterval = window.setInterval(fetchLatency, 5000);
    return () => {
      window.clearInterval(usageInterval);
      window.clearInterval(latencyInterval);
    };
  }, [fetchUsage, fetchLatency, isConnected, tabId]);

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
          {reconnectInfo ? (
            <Loader2 className="w-3 h-3 animate-spin text-term-yellow" />
          ) : (
            <Wifi className={`w-3 h-3 ${isConnected ? 'text-term-green' : 'text-term-brightBlack'}`} />
          )}
          <span className={isConnected && !reconnectInfo ? 'text-term-green' : 'text-term-brightBlack'}>
            {reconnectInfo 
              ? `${t('status.reconnecting')} (${reconnectInfo.attempt}/${reconnectInfo.max})`
              : isConnected 
                ? t('status.connected')
                : t('status.disconnected')
            }
          </span>
        </div>

        {/* Latency */}
        {isConnected && !reconnectInfo && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span className={getLatencyColor(latency)}>
              {latency}ms
            </span>
          </div>
        )}
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
                    {/* System Info */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-term-selection/10 rounded-md p-2.5 border border-term-selection/20">
                        <div className="flex items-center gap-1.5 text-term-brightBlack mb-1">
                          <Clock className="w-3 h-3" />
                          <span className="text-[10px]">{t('status.uptime')}</span>
                        </div>
                        <div className="font-mono text-xs text-term-fg">{formatUptime(usage.uptime)}</div>
                      </div>
                      <div className="bg-term-selection/10 rounded-md p-2.5 border border-term-selection/20">
                        <div className="flex items-center gap-1.5 text-term-brightBlack mb-1">
                          <Activity className="w-3 h-3" />
                          <span className="text-[10px]">{t('status.load_average')}</span>
                        </div>
                        <div className="font-mono text-xs text-term-fg">{usage.load_average.map(l => l.toFixed(2)).join(' ')}</div>
                      </div>
                    </div>

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
                        <div className="text-[10px] text-term-fg/50 mb-1 flex justify-between">
                          <span>{formatBytes(usage.memory_used)} / {formatBytes(usage.memory_total)}</span>
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
                          <span className="text-[10px] text-term-fg/50">{t('status.download')}</span>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs text-term-fg font-medium">{formatSpeed(networkSpeed.rx)}</span>
                            <span className="font-mono text-[10px] text-term-fg/60 opacity-70">Total: {formatBytes(usage.network_rx)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-term-fg/50">{t('status.upload')}</span>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs text-term-fg font-medium">{formatSpeed(networkSpeed.tx)}</span>
                            <span className="font-mono text-[10px] text-term-fg/60 opacity-70">Total: {formatBytes(usage.network_tx)}</span>
                          </div>
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
