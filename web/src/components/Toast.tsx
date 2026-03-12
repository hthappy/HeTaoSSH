import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++toastId;
        setToasts((prev) => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast 容器 */}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-term-green flex-shrink-0" />,
        error: <XCircle className="w-5 h-5 text-term-red flex-shrink-0" />,
        info: <Info className="w-5 h-5 text-term-blue flex-shrink-0" />,
    };

    const borderColors = {
        success: 'border-term-green/30',
        error: 'border-term-red/30',
        info: 'border-term-blue/30',
    };

    return (
        <div
            className={cn(
                'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border',
                'bg-term-bg/95 backdrop-blur-sm shadow-xl',
                'animate-in slide-in-from-right-5 fade-in duration-300',
                borderColors[toast.type]
            )}
            style={{
                animation: 'slideIn 0.3s ease-out',
                minWidth: '280px',
                maxWidth: '420px',
            }}
        >
            {icons[toast.type]}
            <span className="text-sm text-term-fg flex-1">{toast.message}</span>
            <button
                onClick={onClose}
                className="text-term-fg opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
