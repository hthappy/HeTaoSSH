import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal as XTerm, ITheme } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTranslation } from 'react-i18next';
import 'xterm/css/xterm.css';
import { cn } from '@/lib/utils';

export type TerminalHandle = {
  write: (data: string | Uint8Array) => void;
  focus: () => void;
  resize: () => void;
};

interface TerminalProps {
  className?: string;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  disconnected?: boolean;
  incomingData?: string;
  theme?: ITheme;
  fontSize?: number;
  lineHeight?: number;
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { className, onData, onResize, disconnected = false, incomingData, theme, fontSize = 14, lineHeight = 1.2 },
  ref
) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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
      fitAddonRef.current?.fit();
    }
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

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

    let isUnmounted = false;

    // Open terminal
    term.open(terminalRef.current);
    xtermRef.current = term;

    // Fit terminal after a tiny delay to ensure DOM dimensions are computed
    const initialFitTimeout = setTimeout(() => {
      if (isUnmounted) return;
      try {
        if (term.element && term.element.clientWidth > 0) {
          fitAddon.fit();
          // Ensure remote PTY size matches the initial fitted size
          if (onResize && term.cols && term.rows) {
            onResize(term.cols, term.rows);
          }
        }
      } catch (e) {
        console.warn('Initial fit failed', e);
      }
    }, 10);

    // Handle data (user input)
    const onDataDisposable = term.onData((data) => {
      if (!disconnected && onData) {
        onData(data);
      }
    });

    // Handle resize with debounce/raf to prevent "dimensions undefined" errors
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      if (isUnmounted) return;
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (isUnmounted) return;
        try {
          if (term.element && term.element.clientWidth > 0) {
            fitAddon.fit();
            if (onResize && term.cols && term.rows) {
              onResize(term.cols, term.rows);
            }
          }
        } catch (e) {
          console.warn('Resize fit failed', e);
        }
      }, 50);
    };

    // Resize observer
    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Initial focus
    term.focus();

    return () => {
      isUnmounted = true;
      clearTimeout(initialFitTimeout);
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      try {
        term.dispose();
      } catch (e) {
        console.error('Error disposing terminal', e);
      }
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      fitAddonRef.current?.fit();
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

  return (
    <div
      className={cn(
        'flex-1 overflow-hidden', // Removed hardcoded bg color here to let theme control it
        disconnected && 'opacity-50 pointer-events-none',
        className
      )}
      style={{ backgroundColor: theme?.background }} // Ensure container matches theme bg
    >
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
});
