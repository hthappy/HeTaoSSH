import { FileExplorer } from '@/components/FileExplorer';

interface RemoteFilesProps {
  isActive?: boolean;
}

export function RemoteFiles({ isActive = false }: RemoteFilesProps) {
  if (!isActive) {
    return null;
  }

  return (
    <div className="h-full">
      <FileExplorer />
    </div>
  );
}
