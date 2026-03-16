const MAX_HISTORY = 100;
const HISTORY_PREFIX = 'command-history-';

export function addToHistory(serverId: number, command: string) {
  if (!command.trim()) return;
  
  const key = `${HISTORY_PREFIX}${serverId}`;
  try {
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    history.unshift({ command, timestamp: Date.now() });
    history.splice(MAX_HISTORY);
    localStorage.setItem(key, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save command history:', e);
  }
}

export function getHistory(serverId: number): Array<{ command: string; timestamp: number }> {
  const key = `${HISTORY_PREFIX}${serverId}`;
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    console.error('Failed to load command history:', e);
    return [];
  }
}

export function clearHistory(serverId: number) {
  const key = `${HISTORY_PREFIX}${serverId}`;
  localStorage.removeItem(key);
}
