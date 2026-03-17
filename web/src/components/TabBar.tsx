import { X, Terminal } from 'lucide-react';
import { useSshStore, WorkspaceTab } from '@/stores/ssh-store';
import { cn } from '@/lib/utils';

export function TabBar() {
  const { workspaceTabs: tabs, activeTabId, setActiveTab, closeTab } = useSshStore();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="h-10 bg-term-bg border-b border-term-selection flex items-center overflow-x-auto flex-1">
      {tabs.map((tab: WorkspaceTab) => (
        <div
          key={tab.id}
          className={cn(
            'group flex items-center gap-2 px-3 py-2 min-w-0 cursor-pointer border-r border-term-selection flex-1',
            activeTabId === tab.id
              ? 'bg-term-selection text-term-fg'
              : 'text-term-fg opacity-60 hover:bg-term-selection/50'
          )}
          onClick={() => setActiveTab(tab.id)}
        >
          <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-sm truncate flex-1 min-w-0">{tab.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="flex-shrink-0 p-0.5 rounded transition-colors text-foreground opacity-100 hover:bg-red-500 hover:text-white"
            style={{ opacity: 1 }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
