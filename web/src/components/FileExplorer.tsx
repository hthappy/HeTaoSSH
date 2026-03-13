import { useState } from 'react';
import { FileTree } from './FileTree';
import { FileEditor } from './FileEditor';
import { useSshStore } from '@/stores/ssh-store';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function FileExplorer() {
  const { t } = useTranslation();
  const [sidebarOpen] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { activeTabId } = useSshStore();

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
  };

  const handleCloseEditor = () => {
    setSelectedFile(null);
  };

  if (!activeTabId) {
    return (
      <div className="flex w-full h-full items-center justify-center text-term-fg opacity-50 bg-term-bg">
        <p>{t('file.connect_to_view')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div
        className={cn(
          'w-64 border-r border-term-selection bg-term-bg transition-all duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full absolute h-full'
        )}
        style={{ marginTop: '40px' }}
      >
        <FileTree tabId={activeTabId} onFileSelect={handleFileSelect} />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <FileEditor
          tabId={activeTabId}
          filePath={selectedFile}
          onClose={handleCloseEditor}
        />
      </div>
    </div>
  );
}
