import { AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  isDanger = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-term-bg border border-term-selection rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-term-selection">
          <div className="flex items-center gap-2 text-term-fg font-medium">
            {isDanger && <AlertCircle className="w-4 h-4 text-term-red" />}
            <span>{title}</span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-term-selection rounded transition-colors text-term-fg/60 hover:text-term-fg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 text-term-fg/80 text-sm">
          {message}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-term-selection bg-term-selection/10">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded text-term-fg hover:bg-term-selection transition-colors"
          >
            {cancelText || t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-1.5 text-sm rounded transition-colors ${
              isDanger 
                ? 'bg-term-red text-white hover:bg-term-red/90' 
                : 'bg-term-blue text-white hover:bg-term-blue/90'
            }`}
          >
            {confirmText || t('common.confirm', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
