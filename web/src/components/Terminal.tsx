import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import 'xterm/css/xterm.css';
import { cn } from '@/lib/utils';

interface TerminalProps {
  className?: string;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  disconnected?: boolean;
  incomingData?: string;
}

export const Terminal = forwardRef(function Terminal({ className, onData, onResize, disconnected = false, incomingData }: TerminalProps, ref) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Expose write method to parent
  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    },
    focus: () => {
      if (xtermRef.current) {
        xtermRef.current.focus();
      }
    }
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
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

    // Try to load WebGL addon
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        console.warn('WebGL context lost, falling back to canvas renderer');
      });
      term.loadAddon(webglAddon);
    } catch (err) {
      console.warn('WebGL not available, using canvas renderer');
    }

    // Open terminal
    term.open(terminalRef.current);
    xtermRef.current = term;

    // Fit terminal
    fitAddon.fit();

    // Handle data (user input)
    term.onData((data) => {
      if (!disconnected && onData) {
        onData(data);
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (onResize && term.cols && term.rows) {
        onResize(term.cols, term.rows);
      }
    };

    // Resize observer
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    // Initial focus
    term.focus();

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        xtermRef.current.write('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n');
      }
    }
  }, [disconnected]);

  return (
    <div
      className={cn(
        'flex-1 overflow-hidden bg-[#09090b]',
        disconnected && 'opacity-50 pointer-events-none',
        className
      )}
    >
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
});
