import { useCallback, useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  /** 拖拽方向：horizontal = 左右拖拽改变宽度, vertical = 上下拖拽改变高度 */
  direction: 'horizontal' | 'vertical';
  /** 当拖拽时回调，delta 为像素偏移量 */
  onResize: (delta: number) => void;
  className?: string;
}

/**
 * 通用可拖拽分隔条组件
 * 支持水平（左右拖宽度）和垂直（上下拖高度）两种方向
 */
export function ResizeHandle({ direction, onResize, className }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
  }, [direction]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // 全局监听确保拖拽出组件范围仍然有效
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // 防止拖拽时选中文字
    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, direction, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        'flex-shrink-0 transition-colors z-10',
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:bg-term-blue/50'
          : 'h-1 cursor-row-resize hover:bg-term-blue/50',
        isDragging && 'bg-term-blue/70',
        !isDragging && 'bg-transparent hover:bg-term-selection/50',
        className
      )}
    />
  );
}
