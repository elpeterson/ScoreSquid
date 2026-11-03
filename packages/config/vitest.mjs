// Vitest config factory shared by ScoreSquid apps: React plugin, node
// environment, *.test.ts(x) files, the `@/` alias pointing at the app, and
// coverage over the given source files with a floor (SQ-046).
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * @param {string} appDir the app's directory (pass `__dirname`)
 * @param {{ coverage?: { include: string[]; exclude?: string[]; thresholds: { lines: number; statements: number; branches: number; functions: number } } }} [options]
 *   `coverage.include` lists every source file to measure, so a file no test loads counts
 *   as untested rather than being left out. `thresholds` is the floor CI enforces.
 */
export function appVitestConfig(appDir, options = {}) {
  return defineConfig({
    plugins: [react()],
    test: {
      environment: 'node',
      include: ['**/*.test.ts', '**/*.test.tsx'],
      exclude: ['node_modules', '.next'],
      ...(options.coverage && {
        coverage: {
          provider: 'v8',
          include: options.coverage.include,
          exclude: ['**/__tests__/**', ...(options.coverage.exclude ?? [])],
          reporter: ['text-summary', 'json-summary'],
          thresholds: options.coverage.thresholds,
        },
      }),
    },
    resolve: {
      alias: {
        '@': path.resolve(appDir, '.'),
      },
    },
  });
}
