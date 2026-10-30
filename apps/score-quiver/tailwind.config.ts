import type { Config } from 'tailwindcss';
import preset, { sharedContent } from '@scoresquid/config/tailwind';

const config: Config = {
  presets: [preset],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    ...sharedContent(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        // Target-face ring colours (Score Quiver only).
        face: {
          gold: 'hsl(var(--face-gold))',
          red: 'hsl(var(--face-red))',
          blue: 'hsl(var(--face-blue))',
          black: 'hsl(var(--face-black))',
          white: 'hsl(var(--face-white))',
          miss: 'hsl(var(--face-miss))',
        },
      },
    },
  },
};
export default config;
