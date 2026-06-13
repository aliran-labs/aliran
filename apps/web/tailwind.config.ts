import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0F14',
        surface: '#141A22',
        'surface-2': '#1B232E',
        border: '#232B36',
        text: '#E6EDF3',
        muted: '#8B949E',
        // brand flow gradient endpoints
        cyan: '#22D3EE',
        teal: '#14B8A6',
        // agents
        cfo: '#8B5CF6',
        payroll: '#2DD4BF',
        procurement: '#F59E0B',
        creative: '#EC4899',
        // semantic
        success: '#34D399',
        danger: '#F87171',
        pending: '#FBBF24',
        link: '#38BDF8',
        // --- legacy aliases (kept so any stray class still resolves) ---
        ink: '#0B0F14',
        panel: '#141A22',
        edge: '#232B36',
        accent: '#22D3EE',
        good: '#34D399',
        bad: '#F87171',
        warn: '#FBBF24',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '14px',
        control: '10px',
      },
      boxShadow: {
        elev: '0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(34,211,238,0.25), 0 0 24px -6px rgba(34,211,238,0.35)',
      },
      spacing: {
        // 8px scale helpers (Tailwind already has these, listed for intent)
      },
      keyframes: {
        livepulse: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.8)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        livepulse: 'livepulse 1.8s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
