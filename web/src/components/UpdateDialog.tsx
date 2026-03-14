import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface UpdateDialogProps {
  isOpen: boolean;
  version: string;
  isUpdating: boolean;
  onUpdate: () => void;
  onClose: () => void;
}

export function UpdateDialog({ isOpen, version, isUpdating, onUpdate, onClose }: UpdateDialogProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-term-bg rounded-lg border border-term-selection w-full max-w-sm p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-term-fg mb-2">
          {t('update.title')}
        </h3>
        
        <p className="text-term-fg/80 mb-6">
          {t('update.available_msg_simple', { version })}
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isUpdating}
            className="px-4 py-2 text-sm text-term-fg/60 hover:text-term-fg hover:bg-term-selection/50 rounded-md transition-colors disabled:opacity-50"
          >
            {t('update.cancel')}
          </button>
          <button
            onClick={onUpdate}
            disabled={isUpdating}
            className="px-4 py-2 text-sm bg-term-blue text-white hover:bg-term-blue/90 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('update.update_now')}
          </button>
        </div>
      </div>
    </div>
  );
}
