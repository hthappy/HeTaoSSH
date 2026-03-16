import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

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

export function useTransferProgress() {
  const [transfers, setTransfers] = useState<TransferItem[]>([]);

  useEffect(() => {
    const unlisten = listen<{
      id: string;
      downloaded?: number;
      uploaded?: number;
      total: number;
      speed: number;
      eta: number;
    }>('transfer-progress', (event) => {
      const payload = event.payload;
      
      setTransfers(prev => {
        const existing = prev.find(t => t.id === payload.id);
        const progress = payload.total > 0 
          ? ((payload.downloaded || payload.uploaded || 0) / payload.total * 100)
          : 0;

        if (existing) {
          return prev.map(t => t.id === payload.id ? {
            ...t,
            progress: Math.min(100, progress),
            speed: payload.speed,
            eta: payload.eta,
            status: progress >= 100 ? 'completed' : 'transferring',
          } : t);
        } else {
          return [...prev, {
            id: payload.id,
            filename: payload.id.split('/').pop() || 'Unknown',
            type: payload.downloaded !== undefined ? 'download' : 'upload',
            progress: Math.min(100, progress),
            speed: payload.speed,
            eta: payload.eta,
            status: 'transferring',
          }];
        }
      });
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const addTransfer = (id: string, filename: string, type: 'upload' | 'download') => {
    setTransfers(prev => [...prev, {
      id,
      filename,
      type,
      progress: 0,
      status: 'pending',
    }]);
  };

  const updateTransfer = (id: string, updates: Partial<TransferItem>) => {
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const removeTransfer = (id: string) => {
    setTransfers(prev => prev.filter(t => t.id !== id));
  };

  const clearCompleted = () => {
    setTransfers(prev => prev.filter(t => t.status !== 'completed' && t.status !== 'error'));
  };

  return {
    transfers,
    addTransfer,
    updateTransfer,
    removeTransfer,
    clearCompleted,
  };
}
