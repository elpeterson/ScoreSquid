// Vitest config factory shared by ScoreSquid apps: React plugin, node
// environment, *.test.ts(x) files, and the `@/` alias pointing at the app.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/** @param {string} appDir the app's directory (pass `__dirname`) */
export function appVitestConfig(appDir) {
  return defineConfig({
    plugins: [react()],
    test: {
      environment: 'node',
      include: ['**/*.test.ts', '**/*.test.tsx'],
      exclude: ['node_modules', '.next'],
    },
    resolve: {
      alias: {
        '@': path.resolve(appDir, '.'),
      },
    },
  });
}
