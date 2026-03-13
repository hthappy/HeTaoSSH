import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface ContextMenuItemProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  shortcut?: string;
  disabled?: boolean;
}

export function ContextMenuItem({ label, icon, onClick, danger, shortcut, disabled }: ContextMenuItemProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left",
        danger 
          ? "text-red-400 hover:bg-red-500/10" 
          : "text-term-fg hover:bg-term-selection",
        disabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
      )}
    >
      {icon && <span className="w-4 h-4 flex-shrink-0">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {shortcut && <span className="text-xs text-term-fg/40 ml-2">{shortcut}</span>}
    </button>
  );
}

interface ContextMenuSeparatorProps {}

export function ContextMenuSeparator({}: ContextMenuSeparatorProps) {
  return <div className="h-px bg-term-selection my-1 mx-1" />;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}

export function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    // Use mousedown to capture clicks before they trigger other actions
    document.addEventListener('mousedown', handleClickOutside);
    // Also close on scroll or window resize
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    // Prevent default context menu within our context menu
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    menuRef.current?.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      menuRef.current?.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onClose]);

  // Adjust position to keep menu within viewport
  const style: React.CSSProperties = {
    top: y,
    left: x,
  };
  
  // Simple viewport adjustment logic could be added here if needed, 
  // but for now relying on basic positioning. 
  // Ideally, we'd check window.innerWidth/Height and shift if needed.
  // Let's add a basic check in a useLayoutEffect or just render and let CSS handle max-height?
  // For simplicity, let's just clamp the values in the render or use a hook.
  // Actually, let's just render it.

  return createPortal(
    <div 
      className="fixed inset-0 z-50 bg-transparent" 
      onMouseDown={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={menuRef}
        style={style}
        className="fixed z-50 min-w-[160px] py-1 bg-term-bg border border-term-selection rounded-md shadow-xl animate-in fade-in zoom-in-95 duration-100"
        onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
