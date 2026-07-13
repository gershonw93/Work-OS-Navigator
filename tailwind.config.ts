import type { Config } from 'tailwindcss'

// SyteNav - "Field" brand direction.
// One accent system, two surface modes (light + dark). Colors are driven by
// CSS variables defined in globals.css so every token flips with the theme.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        surface: v('--surface'),       // page background (Pit / Paper)
        panel: v('--panel'),           // cards
        muted: v('--muted'),           // subtle fills
        muted2: v('--muted2'),         // stronger fills
        line: v('--line'),             // borders
        'line-soft': v('--line-soft'), // hairline borders
        // Text
        ink: v('--ink'),               // primary text
        'ink-soft': v('--ink-soft'),   // secondary headings
        'muted-fg': v('--muted-fg'),   // body / labels
        faint: v('--faint'),           // hints / disabled
        // Accent (Hi-Vis Lime) - fill stays lime in both modes, fg darkens in light
        accent: v('--accent'),
        'accent-fg': v('--accent-fg'),
        'accent-ink': v('--accent-ink'),
        'accent-tint': v('--accent-tint'),
        // Status
        success: v('--success'), 'success-tint': v('--success-tint'), 'success-solid': v('--success-solid'),
        danger: v('--danger'), 'danger-tint': v('--danger-tint'), 'danger-solid': v('--danger-solid'),
        warn: v('--warn'), 'warn-tint': v('--warn-tint'), 'warn-solid': v('--warn-solid'),
        info: v('--info'), 'info-tint': v('--info-tint'), 'info-solid': v('--info-solid'),
        special: v('--special'), 'special-tint': v('--special-tint'),
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'Archivo', 'system-ui', 'sans-serif'],
        display: ['var(--font-saira)', '"Saira Condensed"', 'system-ui', 'sans-serif'],
        mono: ['var(--font-space-mono)', '"Space Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
