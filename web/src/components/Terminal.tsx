import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { Terminal as XTerm, ITheme } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { useTranslation } from 'react-i18next';
import { Clipboard, Copy } from 'lucide-react';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import 'xterm/css/xterm.css';
import { cn } from '@/lib/utils';
import { ContextMenu, ContextMenuItem } from '@/components/ContextMenu';
import { TerminalSearchBar } from './TerminalSearchBar';
import { addToHistory, getHistory } from '@/lib/commandHistory';
import { useToast } from '@/components/Toast';
import { useTerminalFit } from '@/hooks/useTerminalFit';

export type TerminalHandle = {
  write: (data: string | Uint8Array) => void;
  focus: () => void;
  resize: () => void;
  search: (query: string) => void;
};

interface TerminalProps {
  className?: string;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onEnter?: () => void;
  disconnected?: boolean;
  incomingData?: string;
  theme?: ITheme;
  fontSize?: number;
  lineHeight?: number;
  rightClickBehavior?: 'menu' | 'paste';
  isActive?: boolean;
  serverId?: number;
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  function Terminal(
    { className, onData, onResize, onEnter, disconnected = false, incomingData, theme, fontSize = 14, lineHeight = 1.2, rightClickBehavior = 'menu', isActive = false, serverId },
    ref
  ) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const terminalRef = useRef<HTMLDivElement>(null);
  const { xtermRef, fitAddonRef } = useTerminalFit();
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const onEnterRef = useRef(onEnter);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const disconnectedRef = useRef(disconnected);
  const initializedRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [showSearch, setShowSearch] = useState(false);
  const [currentCommand, setCurrentCommand] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const commandHistoryRef = useRef<Array<{ command: string; timestamp: number }>>([]);

  // Update refs
  useEffect(() => {
    onEnterRef.current = onEnter;
  }, [onEnter]);
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);
  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);
  useEffect(() => {
    disconnectedRef.current = disconnected;
  }, [disconnected]);

  useEffect(() => {
    if (isActive && serverId !== undefined) {
      commandHistoryRef.current = getHistory(serverId);
    }
  }, [isActive, serverId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isActive && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    write: (data: string | Uint8Array) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    },
    focus: () => {
      if (xtermRef.current) {
        xtermRef.current.focus();
      }
    },
    resize: () => {
      requestAnimationFrame(() => {
        try {
          const element = xtermRef.current?.element;
          if (fitAddonRef.current && element && element.offsetParent && element.clientWidth > 0) {
            const currentCols = xtermRef.current?.cols;
            const currentRows = xtermRef.current?.rows;
            fitAddonRef.current.fit();
            
            if (onResizeRef.current && xtermRef.current) {
                if (xtermRef.current.cols !== currentCols || xtermRef.current.rows !== currentRows) {
                    onResizeRef.current(xtermRef.current.cols, xtermRef.current.rows);
                }
            }
          }
        } catch (e) {
          console.warn('Resize fit failed', e);
        }
      });
    },
    search: (query: string) => {
      if (searchAddonRef.current && query) {
        searchAddonRef.current.findNext(query);
      }
    }
  }));

  useEffect(() => {
    if (!terminalRef.current) return;
    if (!isActive && !initializedRef.current) return;
    if (initializedRef.current) {
        if (isActive && xtermRef.current && fitAddonRef.current) {
            // Fit when becoming active
            requestAnimationFrame(() => {
                try {
                    const element = xtermRef.current?.element;
                    if (element && element.offsetParent && element.clientWidth > 0 && element.clientHeight > 0) {
                        const currentCols = xtermRef.current?.cols;
                        const currentRows = xtermRef.current?.rows;
                        fitAddonRef.current?.fit();
                        
                        if (onResizeRef.current && xtermRef.current) {
                            if (xtermRef.current.cols !== currentCols || xtermRef.current.rows !== currentRows) {
                                onResizeRef.current(xtermRef.current.cols, xtermRef.current.rows);
                            }
                        }
                    }
                } catch (e) {
                    // Ignore
                }
            });
        }
        return;
    }

    initializedRef.current = true;
    let isUnmounted = false;

    // Initialize xterm
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize,
      lineHeight,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: theme || {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        cursorAccent: '#09090b',
        black: '#09090b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#71717a',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      scrollback: 10000,
      tabStopWidth: 4,
      drawBoldTextInBrightColors: true,
      allowProposedApi: true,
    });

    // Add fit addon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    // Open terminal
    term.open(terminalRef.current);
    xtermRef.current = term;

    // Safe fit helper
    const fitTerminal = () => {
      if (!xtermRef.current || !fitAddonRef.current || isUnmounted) return;
      // Use requestAnimationFrame to avoid layout thrashing and ensure DOM is ready
      requestAnimationFrame(() => {
        if (!xtermRef.current || !fitAddonRef.current || isUnmounted) return;
        try {
          const element = xtermRef.current.element;
          // Check if element is visible and has dimensions
          // Only fit if the element is visible in the DOM
          if (element && element.offsetParent && element.clientWidth > 0 && element.clientHeight > 0) {
            // Check proposed dimensions first
            const dims = fitAddonRef.current.proposeDimensions();
            if (dims && dims.cols > 0 && dims.rows > 0) {
                const currentCols = xtermRef.current.cols;
                const currentRows = xtermRef.current.rows;
                fitAddonRef.current.fit();
                
                // Only notify backend if dimensions actually changed
                if (onResizeRef.current && (xtermRef.current.cols !== currentCols || xtermRef.current.rows !== currentRows)) {
                    onResizeRef.current(xtermRef.current.cols, xtermRef.current.rows);
                }
            }
          }
        } catch (e) {
          console.warn('Fit failed', e);
        }
      });
    };

    // Fit terminal after a delay to ensure DOM dimensions are computed
    const initialFitTimeout = setTimeout(() => {
      if (isUnmounted) return;
      fitTerminal();
      // Wait for fit to complete (2 frames), then send initial size
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!isUnmounted && xtermRef.current && onResizeRef.current) {
            onResizeRef.current(xtermRef.current.cols, xtermRef.current.rows);
          }
        });
      });
    }, 100);

    // Handle data (user input)
    const onDataDisposable = term.onData((data) => {
      if (!disconnectedRef.current && onDataRef.current) {
        if (data === '\r' && serverId !== undefined) {
          if (currentCommand.trim()) {
            addToHistory(serverId, currentCommand);
            commandHistoryRef.current = getHistory(serverId);
          }
          setCurrentCommand('');
          setHistoryIndex(null);
        } else if (data !== '\x7f' && data !== '\b') {
          setCurrentCommand(prev => prev + data);
        }
        onDataRef.current(data);
      }
    });

    const onKeyDisposable = term.onKey(({ domEvent }) => {
      if (domEvent.keyCode === 13 && onEnterRef.current) {
        onEnterRef.current();
      }
      
      if (domEvent.keyCode === 38 && serverId !== undefined && onDataRef.current) {
        domEvent.preventDefault();
        const history = commandHistoryRef.current;
        if (history.length > 0) {
          const newIndex = historyIndex === null ? 0 : Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(newIndex);
          const cmd = history[newIndex]?.command || '';
          onDataRef.current('\x15' + cmd);
        }
      }
      
      if (domEvent.keyCode === 40 && serverId !== undefined && onDataRef.current) {
        domEvent.preventDefault();
        const history = commandHistoryRef.current;
        if (historyIndex !== null && history.length > 0) {
          const newIndex = Math.max(historyIndex - 1, -1);
          setHistoryIndex(newIndex);
          if (newIndex === -1) {
            onDataRef.current('\x15');
          } else {
            const cmd = history[newIndex]?.command || '';
            onDataRef.current('\x15' + cmd);
          }
        }
      }
    });

    // Handle resize with debounce/raf to prevent "dimensions undefined" errors
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      if (isUnmounted) return;
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (isUnmounted) return;
        fitTerminal();
      }, 50);
    };

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
        // Only trigger resize if the element is visible
        if (terminalRef.current && terminalRef.current.offsetParent) {
            // Use requestAnimationFrame to debounce and align with render cycle
            requestAnimationFrame(() => handleResize());
        }
    });
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Initial focus
    term.focus();

    return () => {
      isUnmounted = true;
      initializedRef.current = false;
      clearTimeout(initialFitTimeout);
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      onKeyDisposable.dispose();
      try {
        term.dispose();
      } catch (e) {
        console.error('Error disposing terminal', e);
      }
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [isActive, theme, fontSize, lineHeight]); // Add initial props as dependencies for creation if it mounts active later

  // Handle theme changes
  useEffect(() => {
    if (xtermRef.current && theme) {
      xtermRef.current.options.theme = theme;
      // Force background update if needed (usually handled by theme option)
    }
  }, [theme]);

  // Handle font changes
  useEffect(() => {
    if (xtermRef.current) {
      if (fontSize) xtermRef.current.options.fontSize = fontSize;
      if (lineHeight) xtermRef.current.options.lineHeight = lineHeight;
      
      // Safe fit with RAF
      requestAnimationFrame(() => {
        try {
          const element = xtermRef.current?.element;
          if (fitAddonRef.current && element && element.offsetParent && element.clientWidth > 0 && element.clientHeight > 0) {
             const currentCols = xtermRef.current?.cols;
             const currentRows = xtermRef.current?.rows;
             fitAddonRef.current.fit();
             
             if (onResizeRef.current && xtermRef.current) {
                 if (xtermRef.current.cols !== currentCols || xtermRef.current.rows !== currentRows) {
                     onResizeRef.current(xtermRef.current.cols, xtermRef.current.rows);
                 }
             }
          }
        } catch (e) {
          console.warn('Font resize fit failed', e);
        }
      });
    }
  }, [fontSize, lineHeight]);

  // Handle incoming data from SSH
  useEffect(() => {
    if (incomingData && xtermRef.current) {
      xtermRef.current.write(incomingData);
    }
  }, [incomingData]);

  // Handle disconnected state
  useEffect(() => {
    if (xtermRef.current) {
      if (disconnected) {
        xtermRef.current.write(`\r\n\x1b[31m[${t('status.disconnected')}]\x1b[0m\r\n`);
      }
    }
  }, [disconnected, t]);

  // Handle right click and middle click
  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;

    const CHUNK_SIZE = 4096; // 4KB chunks for IPC safety

    const sendLargeText = async (text: string) => {
        const term = xtermRef.current;
        if (!term) return;
        
        // Split text into chunks to avoid IPC overload
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
            const chunk = text.substring(i, i + CHUNK_SIZE);
            term.paste(chunk);
            // Small delay between chunks to let the backend/SSH process it
            if (i + CHUNK_SIZE < text.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
    };

    const handleContextMenu = async (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (rightClickBehavior === 'paste') {
            const term = xtermRef.current;
            if (!term) return;

            const selection = term.getSelection();
            if (selection) {
                // Smart copy: if there's a selection, copy it and clear
                try {
                    await writeText(selection);
                    term.clearSelection();
                    showToast(t('common.copied_to_clipboard'), 'success');
                } catch (err) {
                    console.error('Failed to copy selection:', err);
                    showToast(t('common.copy_failed', 'Copy failed'), 'error');
                }
            } else {
                // Smart paste: if no selection, paste from clipboard
                try {
                    const text = await readText();
                    if (text) {
                        await sendLargeText(text);
                    }
                } catch (err) {
                    console.error('Failed to read clipboard:', err);
                    showToast(t('common.paste_failed', 'Paste failed'), 'error');
                }
            }
        } else {
            setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
        }
    };

    const handleMouseDown = async (e: MouseEvent) => {
        // Right click (button 2)
        if (e.button === 2) {
            // Prevent xterm.js from handling right click (which might clear selection)
            e.stopPropagation();
            return;
        }

        // Middle click (button 1)
        if (e.button === 1) {
            e.preventDefault();
            try {
                const text = await readText();
                if (text) {
                    await sendLargeText(text);
                }
            } catch (err) {
                console.error('Failed to read clipboard for middle click:', err);
            }
        }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
        // Prevent right click (button 2) from clearing selection
        if (e.button === 2) {
            e.stopPropagation();
        }
    };
    
    // Add click handler to prevent selection clearing on right click
    const handleClick = (e: MouseEvent) => {
        if (e.button === 2) {
            e.stopPropagation();
        }
    };

    el.addEventListener('contextmenu', handleContextMenu);
    el.addEventListener('mousedown', handleMouseDown, true);
    el.addEventListener('mouseup', handleMouseUp, true);
    el.addEventListener('click', handleClick, true);
    
    return () => {
        el.removeEventListener('contextmenu', handleContextMenu);
        el.removeEventListener('mousedown', handleMouseDown, true);
        el.removeEventListener('mouseup', handleMouseUp, true);
        el.removeEventListener('click', handleClick, true);
    };

  }, [rightClickBehavior, onData, t, showToast]);

  return (
    <>
      <div 
        ref={terminalRef} 
        className={cn('absolute inset-0 w-full h-full overflow-hidden', className)}
        style={{ backgroundColor: theme?.background }}
      />
      {showSearch && (
        <TerminalSearchBar
          terminalRef={xtermRef}
          onClose={() => setShowSearch(false)}
        />
      )}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
        >
          <div className="flex flex-col gap-0.5 p-1 min-w-[140px]">
            <ContextMenuItem 
              label={t('common.copy', 'Copy')} 
              icon={<Copy className="w-4 h-4" />}
              onClick={async () => {
                if (xtermRef.current) {
                  const selection = xtermRef.current.getSelection();
                  if (selection) {
                    try {
                      await writeText(selection);
                      xtermRef.current.clearSelection();
                      showToast(t('common.copied_to_clipboard'), 'success');
                    } catch (err) {
                      console.error('Failed to copy to clipboard:', err);
                      showToast(t('common.copy_failed', 'Copy failed'), 'error');
                    }
                  }
                }
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
            />
            <ContextMenuItem 
              label={t('common.paste', 'Paste')} 
              icon={<Clipboard className="w-4 h-4" />}
              onClick={async () => {
                try {
                  const text = await readText();
                  if (text && xtermRef.current) {
                    // Use sendLargeText logic or simple paste?
                    // Reusing logic from useEffect is hard due to closure.
                    // But we can duplicate the simple logic or extract it.
                    // For now simple paste is fine, or better yet trigger the logic.
                    // Let's implement chunking here too.
                    const CHUNK_SIZE = 4096;
                    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
                        const chunk = text.substring(i, i + CHUNK_SIZE);
                        xtermRef.current.paste(chunk);
                        if (i + CHUNK_SIZE < text.length) {
                            await new Promise(r => setTimeout(r, 10));
                        }
                    }
                  }
                } catch (e) {
                  console.error(e);
                  showToast(t('common.paste_failed', 'Paste failed'), 'error');
                }
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
            />
          </div>
        </ContextMenu>
      )}
    </>
  );
});
