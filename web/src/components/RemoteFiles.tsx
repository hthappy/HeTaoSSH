import { FileEditor } from '@/components/FileEditor';

interface RemoteFilesProps {
  isActive?: boolean;
  tabId: string;
  filePath: string;
}

export function RemoteFiles({ isActive = false, tabId, filePath }: RemoteFilesProps) {
  if (!isActive || !tabId || !filePath) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <FileEditor
        tabId={tabId}
        filePath={filePath}
      />
    </div>
  );
}
