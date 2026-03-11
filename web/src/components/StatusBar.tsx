import { Wifi, FileType, Lock, Clock, Server } from 'lucide-react';

interface StatusBarProps {
  latency?: number;
  encoding?: string;
  permissions?: string;
  serverName?: string;
  isConnected?: boolean;
}

export function StatusBar({
  latency = 45,
  encoding = 'UTF-8',
  permissions = 'rw-r--r--',
  serverName = 'Not connected',
  isConnected = false,
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

  return (
    <div className="h-6 bg-zinc-900 border-t border-zinc-800 flex items-center px-3 text-xs text-zinc-400">
      {/* Server Status */}
      <div className="flex items-center gap-1.5 mr-4">
        <Server className="w-3 h-3" />
        <span className={isConnected ? 'text-zinc-300' : 'text-zinc-500'}>
          {serverName}
        </span>
      </div>

      {/* Connection Status */}
      <div className="flex items-center gap-1.5 mr-4">
        <Wifi className="w-3 h-3" />
        <span className={isConnected ? 'text-green-400' : 'text-zinc-500'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Latency */}
      {isConnected && (
        <div className="flex items-center gap-1.5 mr-4">
          <Clock className="w-3 h-3" />
          <span className={getLatencyColor(latency)}>
            {latency}ms
          </span>
        </div>
      )}

      {/* Encoding */}
      <div className="flex items-center gap-1.5 mr-4">
        <FileType className="w-3 h-3" />
        <span>{encoding}</span>
      </div>

      {/* Permissions */}
      <div className="flex items-center gap-1.5 mr-4">
        <Lock className="w-3 h-3" />
        <span className="font-mono text-zinc-500">{formatPermissions(permissions)}</span>
      </div>

      {/* Right side info */}
      <div className="ml-auto flex items-center gap-4">
        <span className="text-zinc-500">HetaoSSH v0.1.0</span>
      </div>
    </div>
  );
}
