import { X, Terminal } from 'lucide-react';
import { useSshStore, WorkspaceTab } from '@/stores/ssh-store';
import { cn } from '@/lib/utils';

export function TabBar() {
  const { workspaceTabs: tabs, activeTabId, setActiveTab, closeTab } = useSshStore();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="h-10 bg-term-bg border-b border-term-selection flex items-center overflow-x-auto">
      {tabs.map((tab: WorkspaceTab) => (
        <div
          key={tab.id}
          className={cn(
            'group flex items-center gap-2 px-3 py-2 min-w-[160px] max-w-[200px] cursor-pointer border-r border-term-selection',
            activeTabId === tab.id
              ? 'bg-term-selection text-term-fg'
              : 'text-term-fg opacity-60 hover:bg-term-selection/50'
          )}
          onClick={() => setActiveTab(tab.id)}
        >
          <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-sm truncate flex-1">{tab.serverName}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-term-selection rounded transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
