import { useCallback, useRef } from 'react';
import type { Terminal } from 'xterm';
import type { FitAddon } from 'xterm-addon-fit';

/**
 * Custom hook for managing terminal fit operations
 * 
 * Provides refs for xterm instance and fit addon, along with a safe
 * fitTerminal function that handles edge cases and prevents errors.
 * 
 * @returns Object containing xtermRef, fitAddonRef, and fitTerminal function
 */
export function useTerminalFit() {
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  /**
   * Safely fits the terminal to its container
   * 
   * Uses requestAnimationFrame to avoid layout thrashing and ensures
   * the DOM is ready. Only fits if the element is visible and has dimensions.
   */
  const fitTerminal = useCallback(() => {
    if (!xtermRef.current || !fitAddonRef.current) {
      return;
    }

    // Use requestAnimationFrame to avoid layout thrashing and ensure DOM is ready
    requestAnimationFrame(() => {
      if (!xtermRef.current || !fitAddonRef.current) {
        return;
      }

      try {
        const element = xtermRef.current.element;
        
        // Check if element is visible and has dimensions
        // Only fit if the element is visible in the DOM
        if (element && element.offsetParent && element.clientWidth > 0 && element.clientHeight > 0) {
          // Check proposed dimensions first
          const dims = fitAddonRef.current.proposeDimensions();
          if (dims && dims.cols > 0 && dims.rows > 0) {
            fitAddonRef.current.fit();
          }
        }
      } catch (error) {
        console.warn('Failed to fit terminal:', error);
      }
    });
  }, []);

  return {
    xtermRef,
    fitAddonRef,
    fitTerminal,
  };
}
