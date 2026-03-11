import { useState } from 'react';
import { FileTree } from './FileTree';
import { FileEditor } from './FileEditor';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSshStore } from '@/stores/ssh-store';
import { cn } from '@/lib/utils';

export function FileExplorer() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
      <div className="flex w-full h-full items-center justify-center text-zinc-500 bg-zinc-950">
        <p>Connect to a server to view files.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-2 left-2 z-10 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
        title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? (
          <PanelLeftClose className="w-4 h-4 text-zinc-400" />
        ) : (
          <PanelLeftOpen className="w-4 h-4 text-zinc-400" />
        )}
      </button>

      <div
        className={cn(
          'w-64 border-r border-zinc-800 bg-zinc-900 transition-all duration-300',
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
