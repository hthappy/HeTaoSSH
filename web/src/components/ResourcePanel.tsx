import { useState } from 'react';
import { SystemMonitor } from './SystemMonitor';
import { CommandSnippets } from './CommandSnippets';
import { Activity, Command } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResourcePanelProps {
  onExecuteCommand?: (command: string) => void;
}

export function ResourcePanel({ onExecuteCommand }: ResourcePanelProps) {
  const [activeTab, setActiveTab] = useState<'monitor' | 'snippets'>('monitor');

  return (
    <div className="w-80 h-full border-l border-zinc-800 bg-zinc-900 flex flex-col">
      {/* Tab Bar */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('monitor')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
            activeTab === 'monitor'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-zinc-800/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
          )}
        >
          <Activity className="w-4 h-4" />
          Monitor
        </button>
        <button
          onClick={() => setActiveTab('snippets')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
            activeTab === 'snippets'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-zinc-800/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
          )}
        >
          <Command className="w-4 h-4" />
          Snippets
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'monitor' ? (
          <div className="h-full overflow-y-auto">
            <SystemMonitor />
          </div>
        ) : (
          <CommandSnippets onExecute={onExecuteCommand} />
        )}
      </div>
    </div>
  );
}
