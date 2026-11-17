import type { Config } from 'tailwindcss';

/**
 * Colours are CSS variables so light and dark themes share one set of class names.
 * Values are RGB triplets so Tailwind opacity modifiers (bg-gold/10) keep working.
 * Radii, shadows and easing follow Apple's Human Interface Guidelines.
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
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'var(--font-sinhala)'],
        sans: ['var(--font-ui)', 'var(--font-sinhala)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        '2xs': '0 0.5px 1px rgb(0 0 0 / 0.05)',
        xs: '0 1px 2px rgb(0 0 0 / 0.06)',
        card: '0 0 0 0.5px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.05), 0 8px 24px -12px rgb(0 0 0 / 0.08)',
        lift: '0 0 0 0.5px rgb(0 0 0 / 0.05), 0 4px 12px rgb(0 0 0 / 0.06), 0 18px 40px -16px rgb(0 0 0 / 0.16)',
        pop: '0 0 0 0.5px rgb(0 0 0 / 0.08), 0 24px 64px -12px rgb(0 0 0 / 0.32)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
          to: { opacity: '1', transform: 'none' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'none' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'none' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'pop-in': 'pop-in 320ms cubic-bezier(0.32, 0.72, 0, 1)',
        'sheet-up': 'sheet-up 420ms cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-in-left': 'slide-in-left 380ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
