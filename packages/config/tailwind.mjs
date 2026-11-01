// Tailwind preset shared by ScoreSquid apps: the shadcn/ui theme tokens, radius
// and plugins. Each app adds its own `content` globs and app-only colours
// (e.g. ScoreSquid Archery's target-face colours) on top; Tailwind deep-merges
// `theme.extend` across presets.
import animate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';

/** @type {Omit<import('tailwindcss').Config, 'content'>} */
const preset = {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [animate, typography],
};

export default preset;

/**
 * Content globs every app needs on top of its own: the shared packages with
 * UI, so their classes survive Tailwind's purge in production builds.
 * @param {string} appDir the app's directory (pass `__dirname`)
 */
export function sharedContent(appDir) {
  return [
    `${appDir}/../../packages/ui/**/*.{js,ts,jsx,tsx,mdx}`,
    `${appDir}/../../packages/auth/src/**/*.{ts,tsx}`,
  ];
}
