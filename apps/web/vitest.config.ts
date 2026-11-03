import { appVitestConfig } from '@scoresquid/config/vitest';

// Logic and server actions are measured; UI (.tsx) is left to the end-to-end tests.
// The floor sits just under what was measured on 2026-11-03 (SQ-046): raise it as
// coverage grows, and don't lower it to get a PR through.
export default appVitestConfig(__dirname, {
  coverage: {
    include: ['app/**/*.ts', 'features/**/*.ts', 'lib/**/*.ts', 'proxy.ts'],
    thresholds: { lines: 76, statements: 75, branches: 71, functions: 79 },
  },
});
