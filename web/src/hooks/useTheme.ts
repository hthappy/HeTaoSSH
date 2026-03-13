import { useEffect, useMemo } from 'react';
import { ThemeSchema } from '../types/theme';
import { ITheme } from 'xterm';

function hexToChannels(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Handle 3-char hex
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  
  // Parse r, g, b
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return `${r} ${g} ${b}`;
}

export function useTheme(theme: ThemeSchema) {
  // 1. Inject CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const colors = theme.colors;
    
    // Helper to set CSS variable
    const setVar = (name: string, value: string) => {
      // 1. Set original variable (hex) for backward compatibility and non-Tailwind usage
      root.style.setProperty(`--term-${name}`, value);

      // 2. Set -rgb variable for Tailwind opacity support
      try {
        if (value.startsWith('#')) {
          root.style.setProperty(`--term-${name}-rgb`, hexToChannels(value));
        }
      } catch (e) {
        console.warn(`Failed to parse color ${value} for --term-${name}-rgb`, e);
      }
    };

    setVar('bg', colors.background);
    setVar('fg', colors.foreground);
    setVar('cursor', colors.cursor);
    setVar('selection', colors.selection);
    
    setVar('black', colors.black);
    setVar('red', colors.red);
    setVar('green', colors.green);
    setVar('yellow', colors.yellow);
    setVar('blue', colors.blue);
    setVar('magenta', colors.magenta);
    setVar('cyan', colors.cyan);
    setVar('white', colors.white);
    
    setVar('bright-black', colors.brightBlack);
    setVar('bright-red', colors.brightRed);
    setVar('bright-green', colors.brightGreen);
    setVar('bright-yellow', colors.brightYellow);
    setVar('bright-blue', colors.brightBlue);
    setVar('bright-magenta', colors.brightMagenta);
    setVar('bright-cyan', colors.brightCyan);
    setVar('bright-white', colors.brightWhite);

  }, [theme]);

  // 2. Return xterm.js theme object
  const xtermTheme = useMemo<ITheme>(() => {
    return {
      background: theme.colors.background,
      foreground: theme.colors.foreground,
      cursor: theme.colors.cursor,
      cursorAccent: theme.colors.cursorAccent,
      selectionBackground: theme.colors.selection,
      
      black: theme.colors.black,
      red: theme.colors.red,
      green: theme.colors.green,
      yellow: theme.colors.yellow,
      blue: theme.colors.blue,
      magenta: theme.colors.magenta,
      cyan: theme.colors.cyan,
      white: theme.colors.white,
      
      brightBlack: theme.colors.brightBlack,
      brightRed: theme.colors.brightRed,
      brightGreen: theme.colors.brightGreen,
      brightYellow: theme.colors.brightYellow,
      brightBlue: theme.colors.brightBlue,
      brightMagenta: theme.colors.brightMagenta,
      brightCyan: theme.colors.brightCyan,
      brightWhite: theme.colors.brightWhite,
    };
  }, [theme]);

  return xtermTheme;
}
