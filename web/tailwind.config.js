/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        term: {
          bg: "rgb(var(--term-bg-rgb) / <alpha-value>)",
          fg: "rgb(var(--term-fg-rgb) / <alpha-value>)",
          cursor: "rgb(var(--term-cursor-rgb) / <alpha-value>)",
          selection: "rgb(var(--term-selection-rgb) / <alpha-value>)",
          black: "rgb(var(--term-black-rgb) / <alpha-value>)",
          red: "rgb(var(--term-red-rgb) / <alpha-value>)",
          green: "rgb(var(--term-green-rgb) / <alpha-value>)",
          yellow: "rgb(var(--term-yellow-rgb) / <alpha-value>)",
          blue: "rgb(var(--term-blue-rgb) / <alpha-value>)",
          magenta: "rgb(var(--term-magenta-rgb) / <alpha-value>)",
          cyan: "rgb(var(--term-cyan-rgb) / <alpha-value>)",
          white: "rgb(var(--term-white-rgb) / <alpha-value>)",
          bright: {
            black: "rgb(var(--term-bright-black-rgb) / <alpha-value>)",
            red: "rgb(var(--term-bright-red-rgb) / <alpha-value>)",
            green: "rgb(var(--term-bright-green-rgb) / <alpha-value>)",
            yellow: "rgb(var(--term-bright-yellow-rgb) / <alpha-value>)",
            blue: "rgb(var(--term-bright-blue-rgb) / <alpha-value>)",
            magenta: "rgb(var(--term-bright-magenta-rgb) / <alpha-value>)",
            cyan: "rgb(var(--term-bright-cyan-rgb) / <alpha-value>)",
            white: "rgb(var(--term-bright-white-rgb) / <alpha-value>)",
          }
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
