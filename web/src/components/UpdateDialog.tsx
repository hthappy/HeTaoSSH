import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface UpdateDialogProps {
  isOpen: boolean;
  version: string;
  isUpdating: boolean;
  onUpdate: () => void;
  onClose: () => void;
  releaseNotes?: string;
  progress?: { received: number; total?: number } | null;
  error?: string | null;
}

export function UpdateDialog({ isOpen, version, isUpdating, onUpdate, onClose, releaseNotes, progress, error }: UpdateDialogProps) {
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

        {releaseNotes && (
          <div className="mb-4 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-term-selection bg-term-selection/10 p-3 text-xs text-term-fg/75">
            {releaseNotes}
          </div>
        )}

        {isUpdating && progress && (
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-term-fg/70">
              <span>{t('update.downloading')}</span>
              <span>{progress.total ? `${Math.min(100, Math.round(progress.received / progress.total * 100))}%` : t('update.preparing')}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-term-selection">
              <div className="h-full bg-term-blue transition-all" style={{ width: progress.total ? `${Math.min(100, progress.received / progress.total * 100)}%` : '35%' }} />
            </div>
          </div>
        )}

        {error && <p className="mb-4 rounded border border-term-red/40 bg-term-red/10 p-2 text-xs text-term-red">{error}</p>}

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
