import { FileEditor } from '@/components/FileEditor';
import { ITheme } from 'xterm';

interface RemoteFilesProps {
  isActive?: boolean;
  tabId: string;
  filePath: string;
  theme?: ITheme;
}

export function RemoteFiles({ isActive = false, tabId, filePath, theme }: RemoteFilesProps) {
  if (!isActive || !tabId || !filePath) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-term-bg relative">
      <FileEditor
        tabId={tabId}
        filePath={filePath}
        theme={theme}
      />
    </div>
  );
}
