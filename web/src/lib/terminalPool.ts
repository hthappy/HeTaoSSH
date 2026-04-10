import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';

/**
 * Terminal Pool - DOM Reparenting Pattern
 * 
 * This pool manages xterm.js instances and their DOM containers OUTSIDE of React's lifecycle.
 * When React components unmount/remount during split operations, the actual terminal
 * instances remain untouched, preserving all content and state.
 * 
 * Inspired by VS Code's terminal architecture.
 */

interface TerminalInstance {
  term: XTerm;
  container: HTMLDivElement;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
}

class TerminalPool {
  private instances = new Map<string, TerminalInstance>();

  /**
   * Get or create a terminal instance for the given pane ID
   * The instance and its DOM container are created once and reused forever
   */
  getOrCreate(
    paneId: string,
    config: {
      fontSize?: number;
      lineHeight?: number;
    } = {}
  ): TerminalInstance {
    let instance = this.instances.get(paneId);
    
    if (!instance) {
      console.log('[TerminalPool] Creating NEW instance for pane:', paneId);
      
      // Create a real DOM container (not managed by React)
      const container = document.createElement('div');
      container.className = 'absolute inset-0 w-full h-full overflow-hidden';
      container.style.backgroundColor = 'var(--term-bg)';
      
      // Create xterm instance
      const term = new XTerm({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: config.fontSize || 14,
        lineHeight: config.lineHeight || 1.2,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        scrollback: 10000,
        tabStopWidth: 4,
        drawBoldTextInBrightColors: true,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      const searchAddon = new SearchAddon();
      term.loadAddon(searchAddon);

      // Open terminal into the container
      term.open(container);
      
      instance = {
        term,
        container,
        fitAddon,
        searchAddon,
      };

      this.instances.set(paneId, instance);
    }

    return instance;
  }

  /**
   * Get an existing instance (without creating)
   */
  get(paneId: string): TerminalInstance | undefined {
    return this.instances.get(paneId);
  }

  /**
   * Check if an instance exists
   */
  has(paneId: string): boolean {
    return this.instances.has(paneId);
  }

  /**
   * Dispose a terminal instance permanently
   * This should only be called when closing a tab, not during splits
   */
  dispose(paneId: string): void {
    const instance = this.instances.get(paneId);
    if (instance) {
      console.log('[TerminalPool] DISPOSING instance for pane:', paneId);
      try {
        instance.term.dispose();
        instance.container.remove();
      } catch (e) {
        console.error('[TerminalPool] Error disposing terminal:', e);
      }
      this.instances.delete(paneId);
    }
  }

  /**
   * Get all active pane IDs
   */
  getActivePanes(): string[] {
    return Array.from(this.instances.keys());
  }
}

// Global singleton instance
export const terminalPool = new TerminalPool();
