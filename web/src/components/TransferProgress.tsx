import { useState, useEffect } from 'react';
import { X, Download, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TransferItem {
  id: string;
  filename: string;
  type: 'upload' | 'download';
  progress: number;
  speed?: number;
  eta?: number;
  status: 'pending' | 'transferring' | 'completed' | 'error';
  error?: string;
}

interface TransferProgressProps {
  transfers: TransferItem[];
  onDismiss: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function TransferProgress({ transfers, onDismiss }: TransferProgressProps) {
  const [visible, setVisible] = useState(true);
  
  const activeTransfers = transfers.filter(t => t.status === 'transferring' || t.status === 'pending');
  const completedTransfers = transfers.filter(t => t.status === 'completed' || t.status === 'error');

  useEffect(() => {
    if (activeTransfers.length === 0 && completedTransfers.length > 0) {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    } else if (activeTransfers.length > 0) {
      setVisible(true);
    }
  }, [activeTransfers.length, completedTransfers.length]);

  if (!visible || transfers.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-4 z-50 w-80 max-h-96 overflow-auto bg-term-bg border border-term-selection rounded-lg shadow-2xl">
      <div className="sticky top-0 flex items-center justify-between px-4 py-2 bg-term-bg border-b border-term-selection">
        <div className="flex items-center gap-2 text-sm font-medium text-term-fg">
          {activeTransfers.length > 0 ? (
            <>
              <Download className="w-4 h-4 text-term-blue animate-pulse" />
              <span>Transferring ({activeTransfers.length})</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 text-term-green" />
              <span>Completed</span>
            </>
          )}
        </div>
        <button
          onClick={() => setVisible(false)}
          className="p-1 rounded hover:bg-term-selection/50 text-term-fg/60 hover:text-term-fg"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2 space-y-2">
        {transfers.map(transfer => (
          <div
            key={transfer.id}
            className={cn(
              "p-3 rounded-md border bg-term-selection/10",
              transfer.status === 'error' ? "border-term-red" : "border-term-selection/30"
            )}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {transfer.type === 'upload' ? (
                  <Upload className="w-4 h-4 text-term-magenta flex-shrink-0" />
                ) : (
                  <Download className="w-4 h-4 text-term-blue flex-shrink-0" />
                )}
                <span className="text-xs text-term-fg truncate" title={transfer.filename}>
                  {transfer.filename}
                </span>
              </div>
              {transfer.status === 'completed' && (
                <button
                  onClick={() => onDismiss(transfer.id)}
                  className="p-0.5 rounded hover:bg-term-selection/50 text-term-fg/40 hover:text-term-fg flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {transfer.status === 'transferring' && (
              <>
                <div className="h-1.5 w-full bg-term-selection/30 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-term-blue transition-all duration-300"
                    style={{ width: `${transfer.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-term-fg/60">
                  <span>{transfer.progress.toFixed(0)}%</span>
                  {transfer.speed && <span>{formatSpeed(transfer.speed)}</span>}
                  {transfer.eta && <span>{formatEta(transfer.eta)}</span>}
                </div>
              </>
            )}

            {transfer.status === 'completed' && (
              <div className="text-xs text-term-green">✓ Transfer complete</div>
            )}

            {transfer.status === 'error' && (
              <div className="text-xs text-term-red" title={transfer.error}>
                ✕ {transfer.error || 'Transfer failed'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
