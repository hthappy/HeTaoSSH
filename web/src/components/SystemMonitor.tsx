import { useState, useEffect, useCallback } from 'react';
import { Cpu, HardDrive, MemoryStick, Network } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

interface SystemUsage {
  cpu_usage: number;
  memory_usage: number;
  memory_total: number;
  memory_used: number;
  memory_available: number;
  network_rx: number;
  network_tx: number;
  disk_usage: Array<{
    mount_point: string;
    total: number;
    used: number;
    available: number;
    usage_percent: number;
  }>;
}

interface SystemMonitorProps {
  tabId?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function ProgressBar({ value, color = 'bg-term-blue' }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-term-selection rounded-full h-2">
      <div
        className={`${color} h-2 rounded-full transition-all duration-300`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function SystemMonitor({ tabId }: SystemMonitorProps) {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<SystemUsage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    if (!tabId) return;
    try {
      const data = await invoke<SystemUsage>('get_system_usage', { tabId });
      setUsage(data);
      setError(null);
    } catch (err) {
      setError(`${err}`);
    }
  }, [tabId]);

  // 首次加载 + 每 5 秒自动刷新
  useEffect(() => {
    if (!tabId) return;
    setIsLoading(true);
    fetchUsage().finally(() => setIsLoading(false));
    const interval = setInterval(fetchUsage, 5000);
    return () => clearInterval(interval);
  }, [tabId, fetchUsage]);

  if (!tabId) {
    return (
      <div className="p-4 text-term-fg opacity-50 text-sm">{t('status.system_info_hint')}</div>
    );
  }

  if (isLoading && !usage) {
    return (
      <div className="p-4 text-term-fg opacity-60 text-sm">{t('status.system_info_loading')}</div>
    );
  }

  if (error && !usage) {
    return (
      <div className="p-4 text-term-red text-sm">{error}</div>
    );
  }

  if (!usage) {
    return (
      <div className="p-4 text-term-fg opacity-50 text-sm">{t('status.no_data')}</div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* CPU */}
      <div className="bg-term-bg rounded-lg p-4 border border-term-selection">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-5 h-5 text-term-blue" />
          <h3 className="text-sm font-semibold text-term-fg">{t('status.cpu_usage')}</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-3xl font-bold text-term-blue">
            {usage.cpu_usage.toFixed(1)}%
          </div>
          <div className="flex-1">
            <ProgressBar value={usage.cpu_usage} color="bg-term-blue" />
          </div>
        </div>
      </div>

      {/* Memory */}
      <div className="bg-term-bg rounded-lg p-4 border border-term-selection">
        <div className="flex items-center gap-2 mb-2">
          <MemoryStick className="w-5 h-5 text-term-green" />
          <h3 className="text-sm font-semibold text-term-fg">{t('status.memory')}</h3>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-term-fg opacity-60">{t('status.usage')}</span>
            <span className="text-term-green font-semibold">
              {usage.memory_usage.toFixed(1)}%
            </span>
          </div>
          <ProgressBar value={usage.memory_usage} color="bg-term-green" />
          <div className="flex items-center justify-between text-xs text-term-fg opacity-50 mt-2">
            <span>{t('status.used')}: {formatBytes(usage.memory_used)}</span>
            <span>{t('status.total')}: {formatBytes(usage.memory_total)}</span>
            <span>{t('status.avail')}: {formatBytes(usage.memory_available)}</span>
          </div>
        </div>
      </div>

      {/* Network */}
      <div className="bg-term-bg rounded-lg p-4 border border-term-selection">
        <div className="flex items-center gap-2 mb-2">
          <Network className="w-5 h-5 text-term-magenta" />
          <h3 className="text-sm font-semibold text-term-fg">{t('status.network_traffic')}</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-term-fg opacity-50 mb-1">{t('status.received')}</div>
            <div className="text-lg text-term-magenta font-semibold">
              {formatBytes(usage.network_rx)}
            </div>
          </div>
          <div>
            <div className="text-xs text-term-fg opacity-50 mb-1">{t('status.transmitted')}</div>
            <div className="text-lg text-term-magenta font-semibold">
              {formatBytes(usage.network_tx)}
            </div>
          </div>
        </div>
      </div>

      {/* Disk */}
      {usage.disk_usage.length > 0 && (
        <div className="bg-term-bg rounded-lg p-4 border border-term-selection">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-5 h-5 text-term-yellow" />
            <h3 className="text-sm font-semibold text-term-fg">{t('status.disk_usage')}</h3>
          </div>
          <div className="space-y-3">
            {usage.disk_usage.map((disk, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-term-fg opacity-80 font-medium">{disk.mount_point}</span>
                  <span className="text-term-yellow font-semibold">
                    {disk.usage_percent.toFixed(0)}%
                  </span>
                </div>
                <ProgressBar value={disk.usage_percent} color="bg-term-yellow" />
                <div className="flex items-center justify-between text-xs text-term-fg opacity-50">
                  <span>{t('status.used')}: {formatBytes(disk.used)}</span>
                  <span>{t('status.available')}: {formatBytes(disk.available)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
