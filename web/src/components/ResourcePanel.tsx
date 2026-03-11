import { CommandSnippets } from './CommandSnippets';
import { Command } from 'lucide-react';

interface ResourcePanelProps {
  onExecuteCommand?: (command: string) => void;
}

export function ResourcePanel({ onExecuteCommand }: ResourcePanelProps) {
  return (
    <div className="w-full h-full border-l border-zinc-800 bg-zinc-900 flex flex-col">
      {/* Tab Bar */}
      <div className="flex border-b border-zinc-800">
        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors text-blue-400 border-b-2 border-blue-400 bg-zinc-800/50"
        >
          <Command className="w-4 h-4" />
          Snippets
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <CommandSnippets onExecute={onExecuteCommand} />
      </div>
    </div>
  );
}
