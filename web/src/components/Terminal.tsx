import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { ITheme } from 'xterm';
import { useTranslation } from 'react-i18next';
import { Clipboard, Copy } from 'lucide-react';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import 'xterm/css/xterm.css';
import { cn } from '@/lib/utils';
import { ContextMenu, ContextMenuItem } from '@/components/ContextMenu';
import { TerminalSearchBar } from './TerminalSearchBar';
import { addToHistory, getHistory } from '@/lib/commandHistory';
import { useToast } from '@/components/Toast';
import { useShortcutsStore, matchesShortcut } from '@/stores/shortcuts-store';
import { terminalPool } from '@/lib/terminalPool';

export type TerminalHandle = {
  write: (data: string | Uint8Array) => void;
  focus: () => void;
  resize: () => void;
  search: (query: string) => void;
};

interface TerminalProps {
  className?: string;
  paneId: string; // REQUIRED for terminalPool lookup
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onEnter?: () => void;
  onReady?: (cols: number, rows: number) => void; // NEW: Called when terminal is ready with dimensions
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
    { className, paneId, onData, onResize, onEnter, onReady, disconnected = false, incomingData, theme, fontSize = 14, lineHeight = 1.2, rightClickBehavior = 'menu', isActive = false, serverId },
    ref
  ) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  
  // CRITICAL: This is just a placeholder div, NOT the actual terminal container
  const placeholderRef = useRef<HTMLDivElement>(null);
  
  // Store refs to the terminal instance from the pool
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  
  const onEnterRef = useRef(onEnter);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const onReadyRef = useRef(onReady);
  const disconnectedRef = useRef(disconnected);
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [showSearch, setShowSearch] = useState(false);
  
  // Use refs instead of state to avoid re-renders on every keystroke
  const currentCommandRef = useRef('');
  const commandHistoryRef = useRef<{ command: string; timestamp: number }[]>([]);
  const lastHiddenTimeRef = useRef<number>(0);

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
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    disconnectedRef.current = disconnected;
  }, [disconnected]);

  // Subscribe to dynamic shortcuts
  const terminalSearchKeys = useShortcutsStore(state => state.shortcuts.find(s => s.id === 'terminal-search')?.keys || 'Ctrl+F');



  useEffect(() => {
    if (isActive && serverId !== undefined) {
      commandHistoryRef.current = getHistory(serverId);
    }
  }, [isActive, serverId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isActive && matchesShortcut(e, terminalSearchKeys)) {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, terminalSearchKeys]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    write: (data: string | Uint8Array) => {
      if (termRef.current) {
        termRef.current.write(data);
      }
    },
    focus: () => {
      if (termRef.current) {
        termRef.current.focus();
      }
    },
    resize: () => {
      try {
        const element = termRef.current?.element;
        if (fitAddonRef.current && element && element.clientWidth > 0 && element.clientHeight > 0) {
          const currentCols = termRef.current?.cols;
          const currentRows = termRef.current?.rows;
          fitAddonRef.current.fit();
          
          if (onResizeRef.current && termRef.current) {
              const newCols = termRef.current.cols;
              const newRows = termRef.current.rows;
              if (newCols > 0 && newRows > 0 && (newCols !== currentCols || newRows !== currentRows)) {
                  onResizeRef.current(newCols, newRows);
              }
          }
          
          termRef.current?.scrollToBottom();
          const rows = termRef.current?.rows || 24;
          termRef.current?.refresh(0, rows - 1);
        }
      } catch (e) {
        console.warn('Resize fit failed:', e);
      }
    },
    search: (query: string) => {
      if (searchAddonRef.current && query) {
        searchAddonRef.current.findNext(query);
      }
    }
  }));

  // Force terminal redraw when tab becomes active
  useEffect(() => {
    if (!isActive || !termRef.current || !fitAddonRef.current) return;
    
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    
    const forceRedraw = () => {
      if (!term || !fitAddon) return;
      
      const element = term.element;
      if (!element || element.clientWidth === 0 || element.clientHeight === 0) {
        setTimeout(forceRedraw, 50);
        return;
      }
      
      try {
        term.write('');
        
        setTimeout(() => {
          try {
            fitAddon.fit();
            term.refresh(0, term.rows - 1);
            term.scrollToBottom();
            term.focus();
          } catch (e) {
            console.error('[Terminal] Fit/refresh failed:', e);
          }
        }, 10);
        
      } catch (e) {
        console.error('[Terminal] Redraw failed:', e);
      }
    };
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        forceRedraw();
      });
    });
  }, [isActive]);

  // DOM REPARENTING: Attach/detach terminal container
  useEffect(() => {
    if (!placeholderRef.current) return;

    console.log('[Terminal] DOM Reparenting: Attaching terminal for pane:', paneId);
    
    // Get or create terminal instance from pool
    const instance = terminalPool.getOrCreate(paneId, { fontSize, lineHeight });
    
    // Store refs
    termRef.current = instance.term;
    fitAddonRef.current = instance.fitAddon;
    searchAddonRef.current = instance.searchAddon;
    
    // CRITICAL: Use native DOM API to attach the container
    placeholderRef.current.appendChild(instance.container);
    
    // Setup event handlers
    const onDataDisposable = instance.term.onData((data) => {
      if (!disconnectedRef.current && onDataRef.current) {
        if (data === '\r' && serverId !== undefined) {
          if (currentCommandRef.current.trim()) {
            addToHistory(serverId, currentCommandRef.current);
            commandHistoryRef.current = getHistory(serverId);
          }
          currentCommandRef.current = '';
        } else if (data !== '\x7f' && data !== '\b' && !data.startsWith('\x1b')) {
          currentCommandRef.current += data;
        }
        onDataRef.current(data);
      }
    });

    const onKeyDisposable = instance.term.onKey(({ domEvent }) => {
      if (domEvent.keyCode === 13 && onEnterRef.current) {
        onEnterRef.current();
      }
    });

    // Use custom key handler to intercept paste and use Tauri's clipboard API
    // Native webview paste might be restricted or inconsistent
    const termAny = instance.term as any;
    if (!termAny._customPasteHandlerAttached) {
      instance.term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        // Only handle keydown to prevent double-pasting (xterm fires for keydown/keyup/keypress)
        const isMac = navigator.userAgent.includes('Mac');
        const isPaste = 
          (isMac && e.metaKey && e.key.toLowerCase() === 'v') || // Mac: Cmd+V
          (!isMac && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') || // Win/Linux: Ctrl+Shift+V
          (e.shiftKey && e.key === 'Insert'); // Shift+Insert

        if (e.type === 'keydown' && isPaste) {
          e.preventDefault();
          
          readText().then(text => {
            if (text && termRef.current) {
              termRef.current.paste(text);
              termRef.current.focus();
            }
          }).catch(err => {
            console.error('[Terminal] Failed to read clipboard for paste:', err);
          });
          
          return false; // Prevent xterm from processing this key
        }
        return true;
      });
      termAny._customPasteHandlerAttached = true;
    }

    // Fit terminal after attachment
    const fitTerminal = () => {
      if (!termRef.current || !fitAddonRef.current) return;
      
      const element = termRef.current.element;
      if (!element || !element.querySelector('.xterm-rows')) {
        setTimeout(fitTerminal, 50);
        return;
      }
      
      requestAnimationFrame(() => {
        if (!termRef.current || !fitAddonRef.current) return;
        try {
          const element = termRef.current.element;
          if (element && element.offsetParent && element.clientWidth > 0 && element.clientHeight > 0) {
            const dims = fitAddonRef.current.proposeDimensions();
            if (dims && dims.cols > 0 && dims.rows > 0) {
                const currentCols = termRef.current.cols;
                const currentRows = termRef.current.rows;
                fitAddonRef.current.fit();
                
                const newCols = termRef.current.cols;
                const newRows = termRef.current.rows;
                
                // Only send resize if dimensions actually changed
                if (onResizeRef.current && (newCols !== currentCols || newRows !== currentRows)) {
                    console.log(`[Terminal] Resize: ${currentCols}×${currentRows} → ${newCols}×${newRows}`);
                    onResizeRef.current(newCols, newRows);
                }
            }
          }
        } catch (e) {
          console.warn('Fit failed', e);
        }
      });
    };

    const initialFitTimeout = setTimeout(() => {
      fitTerminal();
      // Send initial size after a delay to ensure terminal is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (termRef.current && onResizeRef.current) {
            const cols = termRef.current.cols;
            const rows = termRef.current.rows;
            if (cols > 0 && rows > 0) {
              console.log(`[Terminal] Initial size: ${cols}×${rows}`);
              onResizeRef.current(cols, rows);
              
              // NEW: Notify parent that terminal is ready with dimensions
              if (onReadyRef.current) {
                console.log(`[Terminal] Ready callback: ${cols}×${rows}`);
                onReadyRef.current(cols, rows);
              }
            }
          }
        });
      });
    }, 100);

    // Resize observer
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        fitTerminal();
      }, 50);
    };

    const resizeObserver = new ResizeObserver(() => {
        if (placeholderRef.current && placeholderRef.current.offsetParent) {
            requestAnimationFrame(() => handleResize());
        }
    });
    if (placeholderRef.current) {
      resizeObserver.observe(placeholderRef.current);
    }

    // Focus terminal
    instance.term.focus();

    // Cleanup: DETACH container (NOT dispose)
    return () => {
      console.log('[Terminal] DOM Reparenting: Detaching terminal for pane:', paneId);
      
      clearTimeout(initialFitTimeout);
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      onKeyDisposable.dispose();
      

      // CRITICAL: Only remove from DOM, do NOT dispose the terminal
      if (placeholderRef.current && instance.container.parentNode === placeholderRef.current) {
        placeholderRef.current.removeChild(instance.container);
      }
      
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [paneId, fontSize, lineHeight]); // Re-attach if paneId changes

  // Handle theme changes
  useEffect(() => {
    if (termRef.current && theme) {
      const element = termRef.current.element;
      if (!element || !element.querySelector('.xterm-rows')) {
        return;
      }
      
      termRef.current.options.theme = theme;
      
      requestAnimationFrame(() => {
        const viewport = element.querySelector('.xterm-viewport') as HTMLElement;
        if (viewport) {
          viewport.style.backgroundColor = '';
        }
        const screen = element.querySelector('.xterm-screen') as HTMLElement;
        if (screen) {
          screen.style.backgroundColor = '';
        }
      });
    }
  }, [theme]);

  // Handle font changes
  useEffect(() => {
    if (termRef.current) {
      const element = termRef.current.element;
      if (!element || !element.querySelector('.xterm-rows')) {
        return;
      }
      
      if (fontSize) termRef.current.options.fontSize = fontSize;
      if (lineHeight) termRef.current.options.lineHeight = lineHeight;
      
      requestAnimationFrame(() => {
        try {
          const element = termRef.current?.element;
          if (fitAddonRef.current && element && element.offsetParent && element.clientWidth > 0 && element.clientHeight > 0) {
             const currentCols = termRef.current?.cols;
             const currentRows = termRef.current?.rows;
             fitAddonRef.current.fit();
             
             if (onResizeRef.current && termRef.current) {
                 if (termRef.current.cols !== currentCols || termRef.current.rows !== currentRows) {
                     onResizeRef.current(termRef.current.cols, termRef.current.rows);
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
    if (incomingData && termRef.current) {
      termRef.current.write(incomingData);
    }
  }, [incomingData]);

  // Handle disconnected state
  useEffect(() => {
    if (termRef.current) {
      if (disconnected) {
        termRef.current.write(`\r\n\x1b[31m[${t('status.disconnected')}]\x1b[0m\r\n`);
        
        // Fix stuck state due to broken connections:
        // When disconnected, ensure mouse reporting and application cursor keys are disabled!
        // This prevents the terminal from sending garbage mouse reports if it reconnects 
        // to a fresh shell that isn't expecting them.
        termRef.current.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1049l\x1b[?1l\x1b[?2004l');
      }
    }
  }, [disconnected, t]);

  // 【核心修复】窗口恢复可见时，静默重置终端鼠标追踪模式
  // 原理：OpenCode/vim 等全屏程序会开启鼠标追踪。当窗口最小化后程序异常退出，
  // xterm.js 不知道远程程序已退出，仍保持鼠标追踪状态。
  // 用户恢复窗口并移动鼠标时，xterm.js 会持续发送坐标数据给 zsh，产生乱码。
  // 修复方式：窗口恢复时向本地 xterm.js 写入 DECRST 序列，清除其内部鼠标追踪状态。
  // 注意：这些序列只能写给本地终端模拟器，绝不能发送给远程 shell（否则会变成乱码）。
  useEffect(() => {
    // DECRST 序列：关闭各种鼠标追踪模式
    const MOUSE_MODES_OFF = '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l';

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 记录窗口隐藏时间
        lastHiddenTimeRef.current = Date.now();
      } else {
        // 窗口恢复可见：如果隐藏超过 5 秒，静默重置鼠标追踪
        const hiddenDuration = Date.now() - lastHiddenTimeRef.current;
        if (hiddenDuration > 5000 && termRef.current && !disconnectedRef.current) {
          // 仅清除本地 xterm.js 的鼠标追踪状态（阻止 xterm.js 生成坐标数据）
          // 不向远程发送任何内容 — DECRST 是终端控制序列，不是 shell 命令
          termRef.current.write(MOUSE_MODES_OFF);
        }
      }
    };

    const handleWindowFocus = () => {
      const hiddenDuration = Date.now() - lastHiddenTimeRef.current;
      if (hiddenDuration > 5000 && termRef.current && !disconnectedRef.current) {
        termRef.current.write(MOUSE_MODES_OFF);
        // 重置计时避免重复触发
        lastHiddenTimeRef.current = 0;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  // Handle right click and middle click
  useEffect(() => {
    const el = placeholderRef.current;
    if (!el) return;

    const handleContextMenu = async (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (rightClickBehavior === 'paste') {
            const term = termRef.current;
            if (!term) return;

            const selection = term.getSelection();
            if (selection) {
                try {
                    await writeText(selection);
                    term.clearSelection();
                    showToast(t('common.copied_to_clipboard'), 'success');
                } catch (err) {
                    console.error('Failed to copy selection:', err);
                    showToast(t('common.copy_failed', 'Copy failed'), 'error');
                }
            } else {
                try {
                    const text = await readText();
                    if (text && termRef.current) {
                        termRef.current.paste(text);
                        termRef.current.focus();
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
        if (e.button === 2) {
            e.stopPropagation();
            return;
        }

        if (e.button === 1) {
            e.preventDefault();
            try {
                const text = await readText();
                if (text && termRef.current) {
                    termRef.current.paste(text);
                    termRef.current.focus();
                }
            } catch (err) {
                console.error('Failed to read clipboard for middle click:', err);
            }
        }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
        if (e.button === 2) {
            e.stopPropagation();
        }
    };
    
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
        ref={placeholderRef} 
        className={cn('absolute inset-0 w-full h-full overflow-hidden', className)}
        style={{ backgroundColor: 'var(--term-bg)' }}
      />
      {showSearch && (
        <TerminalSearchBar
          searchAddonRef={searchAddonRef}
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
                if (termRef.current) {
                  const selection = termRef.current.getSelection();
                  if (selection) {
                    try {
                      await writeText(selection);
                      termRef.current.clearSelection();
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
                  if (text && termRef.current) {
                    termRef.current.paste(text);
                    termRef.current.focus();
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
