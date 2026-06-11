import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0e14',
        panel: '#11161f',
        edge: '#1e2733',
        accent: '#3ba9ff',
        good: '#34d399',
        bad: '#f87171',
        warn: '#fbbf24',
      },
    },
  },
  plugins: [],
} satisfies Config;
