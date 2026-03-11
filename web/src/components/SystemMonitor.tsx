import { Cpu, HardDrive, MemoryStick, Network } from 'lucide-react';

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
  usage?: SystemUsage;
  isLoading?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function ProgressBar({ value, color = 'bg-blue-500' }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-zinc-800 rounded-full h-2">
      <div
        className={`${color} h-2 rounded-full transition-all duration-300`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function SystemMonitor({ usage, isLoading = false }: SystemMonitorProps) {
  // Mock data for development
  const mockUsage: SystemUsage = usage || {
    cpu_usage: 45.2,
    memory_usage: 62.5,
    memory_total: 16 * 1024 * 1024 * 1024,
    memory_used: 10 * 1024 * 1024 * 1024,
    memory_available: 6 * 1024 * 1024 * 1024,
    network_rx: 1234567890,
    network_tx: 987654321,
    disk_usage: [
      {
        mount_point: '/',
        total: 500 * 1024 * 1024 * 1024,
        used: 350 * 1024 * 1024 * 1024,
        available: 150 * 1024 * 1024 * 1024,
        usage_percent: 70,
      },
      {
        mount_point: '/home',
        total: 200 * 1024 * 1024 * 1024,
        used: 120 * 1024 * 1024 * 1024,
        available: 80 * 1024 * 1024 * 1024,
        usage_percent: 60,
      },
    ],
  };

  if (isLoading) {
    return (
      <div className="p-4 text-zinc-400 text-sm">Loading system info...</div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* CPU */}
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-zinc-200">CPU Usage</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-3xl font-bold text-blue-400">
            {mockUsage.cpu_usage.toFixed(1)}%
          </div>
          <div className="flex-1">
            <ProgressBar value={mockUsage.cpu_usage} color="bg-blue-500" />
          </div>
        </div>
      </div>

      {/* Memory */}
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <div className="flex items-center gap-2 mb-2">
          <MemoryStick className="w-5 h-5 text-green-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Memory</h3>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Usage</span>
            <span className="text-green-400 font-semibold">
              {mockUsage.memory_usage.toFixed(1)}%
            </span>
          </div>
          <ProgressBar value={mockUsage.memory_usage} color="bg-green-500" />
          <div className="flex items-center justify-between text-xs text-zinc-500 mt-2">
            <span>Used: {formatBytes(mockUsage.memory_used)}</span>
            <span>Total: {formatBytes(mockUsage.memory_total)}</span>
            <span>Available: {formatBytes(mockUsage.memory_available)}</span>
          </div>
        </div>
      </div>

      {/* Network */}
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <div className="flex items-center gap-2 mb-2">
          <Network className="w-5 h-5 text-purple-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Network Traffic</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Received</div>
            <div className="text-lg text-purple-400 font-semibold">
              {formatBytes(mockUsage.network_rx)}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">Transmitted</div>
            <div className="text-lg text-purple-400 font-semibold">
              {formatBytes(mockUsage.network_tx)}
            </div>
          </div>
        </div>
      </div>

      {/* Disk */}
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-5 h-5 text-orange-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Disk Usage</h3>
        </div>
        <div className="space-y-3">
          {mockUsage.disk_usage.map((disk, index) => (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300 font-medium">{disk.mount_point}</span>
                <span className="text-orange-400 font-semibold">
                  {disk.usage_percent.toFixed(0)}%
                </span>
              </div>
              <ProgressBar value={disk.usage_percent} color="bg-orange-500" />
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Used: {formatBytes(disk.used)}</span>
                <span>Available: {formatBytes(disk.available)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
