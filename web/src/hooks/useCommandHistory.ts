import { useRef, useCallback } from 'react';

const MAX_HISTORY = 1000;
const HISTORY_STORAGE_KEY = 'HeTaoSSH_command_history_v1';

// Load history from localStorage
const loadHistory = (): string[] => {
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
};

// Save history to localStorage
const saveHistory = (history: string[]) => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch (err) {
    console.error('Failed to save command history:', err);
  }
};

export const useCommandHistory = (serverId: number) => {
  // Per-server command history
  const historyRef = useRef<Record<number, string[]>>(() => {
    const allHistory = loadHistory();
    return { [serverId]: allHistory };
  });
  
  // Current position in history (for ↑/↓ navigation)
  const positionRef = useRef<Record<number, number>>({});
  
  // Current input buffer (what user is typing)
  const bufferRef = useRef<Record<number, string>>('');
  
  // Add command to history
  const addToHistory = useCallback((cmd: string) => {
    if (!cmd.trim()) return;
    
    const serverHistory = historyRef.current[serverId] || [];
    
    // Avoid duplicates at the end
    if (serverHistory[serverHistory.length - 1] === cmd) {
      return;
    }
    
    const newHistory = [...serverHistory, cmd].slice(-MAX_HISTORY);
    historyRef.current[serverId] = newHistory;
    saveHistory(newHistory);
    positionRef.current[serverId] = newHistory.length;
  }, [serverId]);
  
  // Get previous command (↑ key)
  const getPrevious = useCallback((): string | null => {
    const serverHistory = historyRef.current[serverId] || [];
    if (serverHistory.length === 0) return null;
    
    const currentPos = positionRef.current[serverId] ?? serverHistory.length;
    if (currentPos <= 0) return null;
    
    const newPos = currentPos - 1;
    positionRef.current[serverId] = newPos;
    return serverHistory[newPos];
  }, [serverId]);
  
  // Get next command (↓ key)
  const getNext = useCallback((): string | null => {
    const serverHistory = historyRef.current[serverId] || [];
    if (serverHistory.length === 0) return null;
    
    const currentPos = positionRef.current[serverId] ?? serverHistory.length;
    if (currentPos >= serverHistory.length) return null;
    
    const newPos = currentPos + 1;
    positionRef.current[serverId] = newPos;
    
    // If at end, return buffer (what user was typing)
    if (newPos >= serverHistory.length) {
      return bufferRef.current[serverId] || null;
    }
    
    return serverHistory[newPos];
  }, [serverId]);
  
  // Reset position when user starts typing new command
  const resetPosition = useCallback(() => {
    positionRef.current[serverId] = historyRef.current[serverId]?.length || 0;
  }, [serverId]);
  
  // Save current buffer
  const saveBuffer = useCallback((input: string) => {
    bufferRef.current[serverId] = input;
  }, [serverId]);
  
  // Clear buffer
  const clearBuffer = useCallback(() => {
    delete bufferRef.current[serverId];
  }, [serverId]);
  
  return {
    addToHistory,
    getPrevious,
    getNext,
    resetPosition,
    saveBuffer,
    clearBuffer,
  };
};
