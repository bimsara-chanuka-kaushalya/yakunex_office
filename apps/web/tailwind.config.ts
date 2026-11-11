import type { Config } from 'tailwindcss';

/**
 * Colours are CSS variables so light and dark themes share one set of class names.
 * Values are RGB triplets so Tailwind opacity modifiers (bg-gold/10) keep working.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          strong: 'rgb(var(--gold-strong) / <alpha-value>)',
          ink: 'rgb(var(--gold-ink) / <alpha-value>)',
        },
        canvas: 'rgb(var(--background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--surface-raised) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
        'sidebar-line': 'rgb(var(--sidebar-line) / <alpha-value>)',
        ink: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        line: 'rgb(var(--border) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'var(--font-sinhala)', 'Georgia', 'serif'],
        sans: ['var(--font-ui)', 'var(--font-sinhala)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(20 24 31 / 0.04), 0 4px 16px -8px rgb(20 24 31 / 0.08)',
        pop: '0 12px 40px -12px rgb(20 24 31 / 0.25)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'pop-in': 'pop-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
