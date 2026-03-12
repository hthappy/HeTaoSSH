import { CommandSnippets } from './CommandSnippets';
import { Command } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ResourcePanelProps {
  onExecuteCommand?: (command: string) => void;
}

export function ResourcePanel({ onExecuteCommand }: ResourcePanelProps) {
  const { t } = useTranslation();

  return (
    <div className="w-full h-full border-l border-term-selection bg-term-bg flex flex-col">
      {/* Tab Bar */}
      <div className="flex border-b border-term-selection">
        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors text-term-blue border-b-2 border-term-blue bg-term-selection/50"
        >
          <Command className="w-4 h-4" />
          {t('snippets.title')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <CommandSnippets onExecute={onExecuteCommand} />
      </div>
    </div>
  );
}
