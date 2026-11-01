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
};
export default config;
