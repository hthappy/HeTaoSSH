export interface ThemeSchema {
  name: string;
  type: 'dark' | 'light';
  colors: {
    // UI Colors
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selection: string;
    
    // ANSI 16 Colors
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const defaultTheme: ThemeSchema = {
  name: 'Default',
  type: 'dark',
  colors: {
    background: '#09090b', // zinc-950
    foreground: '#f4f4f5', // zinc-100
    cursor: '#ffffff',
    cursorAccent: '#000000',
    selection: 'rgba(255, 255, 255, 0.3)',
    
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#e5e5e5',
  }
};
