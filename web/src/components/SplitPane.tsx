import { useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SplitPaneProps {
  direction: 'horizontal' | 'vertical';
  children: ReactNode[];
  onResize?: (sizes: number[]) => void;
}

export function SplitPane({ direction, children, onResize }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Initialize equal sizes
  useEffect(() => {
    if (children.length > 0 && sizes.length === 0) {
      const initialSize = 100 / children.length;
      setSizes(Array(children.length).fill(initialSize));
    }
  }, [children.length]);

  const handleMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setIsDragging(true);
    setDragIndex(index);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || dragIndex === null || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const isHorizontal = direction === 'horizontal';
    
    const position = isHorizontal ? e.clientX : e.clientY;
    const containerSize = isHorizontal ? rect.width : rect.height;
    const relativePosition = position - (isHorizontal ? rect.left : rect.top);
    const percentage = (relativePosition / containerSize) * 100;

    // Calculate new sizes
    const newSizes = [...sizes];
    const minSize = 10; // Minimum 10%

    let leftSize = percentage;
    let rightSize = sizes[dragIndex] + sizes[dragIndex + 1] - percentage;
    
    // Enforce minimum sizes
    if (leftSize < minSize) {
      leftSize = minSize;
      rightSize = sizes[dragIndex] + sizes[dragIndex + 1] - minSize;
    }
    if (rightSize < minSize) {
      rightSize = minSize;
      leftSize = sizes[dragIndex] + sizes[dragIndex + 1] - minSize;
    }
    
    newSizes[dragIndex] = leftSize;
    newSizes[dragIndex + 1] = rightSize;
    
    setSizes(newSizes);
    onResize?.(newSizes);
  }, [isDragging, dragIndex, direction, sizes, onResize]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragIndex(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (children.length <= 1) {
    return <>{children}</>;
  }

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full w-full overflow-hidden',
        isHorizontal ? 'flex-row' : 'flex-col'
      )}
      style={{ backgroundColor: 'var(--term-bg)' }}
    >
      {children.map((child, index) => (
        <div 
          key={`pane-wrapper-${index}`}
          className={cn(
            'flex',
            isHorizontal ? 'flex-row' : 'flex-col'
          )}
          style={{
            flexBasis: sizes[index] ? `${sizes[index]}%` : undefined,
            flexGrow: 0,
            flexShrink: 0,
            backgroundColor: 'var(--term-bg)'
          }}
        >
          {/* Pane */}
          <div
            className={cn(
              'flex-1 overflow-hidden h-full w-full',
              isDragging && dragIndex !== index && dragIndex !== index - 1 && 'pointer-events-none'
            )}
            style={{ backgroundColor: 'var(--term-bg)' }}
          >
            {child}
          </div>
          
          {/* Resizable Splitter Bar */}
          {index < children.length - 1 && (
            <div
              className={cn(
                'flex items-center justify-center group select-none relative',
                isHorizontal 
                  ? 'w-1 hover:w-1.5 cursor-col-resize' 
                  : 'h-1 hover:h-1.5 cursor-row-resize',
                isDragging && dragIndex === index && 'bg-term-blue/30'
              )}
              style={{ backgroundColor: 'var(--term-bg)' }}
              onMouseDown={(e) => handleMouseDown(e, index)}
            >
              {/* Single center line */}
              <div className={cn(
                'absolute bg-term-selection',
                isHorizontal 
                  ? 'left-0 top-0 bottom-0 w-px' 
                  : 'top-0 left-0 right-0 h-px',
                'group-hover:bg-term-blue/50 transition-colors'
              )} />
              
              {/* Drag handle dots (only visible on hover) */}
              <div className={cn(
                'flex justify-center items-center gap-1 opacity-0 group-hover:opacity-60 transition-opacity z-10',
                isHorizontal ? 'flex-col' : 'flex-row'
              )}>
                <div className="w-1 h-1 bg-term-fg rounded-full" />
                <div className="w-1 h-1 bg-term-fg rounded-full" />
                <div className="w-1 h-1 bg-term-fg rounded-full" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}