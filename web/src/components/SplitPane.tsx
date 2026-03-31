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
          }}
        >
          {/* Pane */}
          <div
            className={cn(
              'flex-1 overflow-hidden h-full w-full',
              isDragging && dragIndex !== index && dragIndex !== index - 1 && 'pointer-events-none'
            )}
          >
            {child}
          </div>
          
          {/* Resizable Splitter Bar */}
          {index < children.length - 1 && (
            <div
              className={cn(
                'flex items-center justify-center group cursor-col-resize select-none relative',
                isHorizontal 
                  ? 'w-2.5 bg-term-selection/0 hover:bg-term-blue/10 transition-all' 
                  : 'h-2.5 bg-term-selection/0 hover:bg-term-blue/10 transition-all flex-col',
                isDragging && dragIndex === index && (isHorizontal ? 'w-3 bg-term-blue' : 'h-3 bg-term-blue')
              )}
              style={{
                ...(isHorizontal ? { 
                  boxShadow: 'inset 2px 0 0 rgba(126, 152, 202, 0.3)',
                } : { 
                  boxShadow: 'inset 0 2px 0 rgba(126, 152, 202, 0.3)',
                })
              }}
              onMouseDown={(e) => handleMouseDown(e, index)}
            >
              {isHorizontal ? (
                <>
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-term-selection/40 group-hover:bg-term-blue/50 translate-x-[-50%]" />
                  <div className="w-1 h-full flex flex-col justify-center items-center gap-1.5 opacity-0 group-hover:opacity-70 transition-opacity">
                    <div className="w-1 h-1 bg-term-fg rounded-full" />
                    <div className="w-1 h-1 bg-term-fg rounded-full" />
                    <div className="w-1 h-1 bg-term-fg rounded-full" />
                  </div>
                </>
              ) : (
                <>
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-term-selection/40 group-hover:bg-term-blue/50 translate-y-[-50%]" />
                  <div className="h-1 w-full flex flex-row justify-center items-center gap-1.5 opacity-0 group-hover:opacity-70 transition-opacity">
                    <div className="h-1 w-1 bg-term-fg rounded-full" />
                    <div className="h-1 w-1 bg-term-fg rounded-full" />
                    <div className="h-1 w-1 bg-term-fg rounded-full" />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}