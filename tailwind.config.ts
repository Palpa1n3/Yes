import type { Config } from 'tailwindcss';

/** Every colour resolves to a CSS variable (space-separated RGB channels) so
 *  themes swap at runtime and Tailwind opacity modifiers (`bg-accent/15`) still work. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        void: v('bg-void'),
        panel: v('bg-panel'),
        'panel-raised': v('bg-panel-raised'),
        line: v('line'),
        accent: v('accent'),
        ice: v('ice'),
        'text-primary': v('text-primary'),
        'text-muted': v('text-muted'),
        amber: v('amber'),
        alert: v('alert'),
        ok: v('ok'),
      },
      fontFamily: {
        display: ['Orbitron', 'Rajdhani', 'sans-serif'],
        alt: ['Rajdhani', 'Inter', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-sm': 'var(--glow-sm)',
        'glow-md': 'var(--glow-md)',
        'glow-lg': 'var(--glow-lg)',
      },
      letterSpacing: { hud: '0.2em' },
      borderRadius: { panel: 'var(--panel-radius)' },
      screens: { hud: '1180px', wide: '1440px', full: '1600px' },
    },
  },
  plugins: [],
} satisfies Config;
