import { appVitestConfig } from '@scoresquid/config/vitest';

// The floor sits just under what was measured on 2026-11-03 (SQ-046): raise it as
// coverage grows, and don't lower it to get a PR through.
export default appVitestConfig(__dirname, {
  coverage: {
    include: ['src/**/*.ts'],
    thresholds: { lines: 86, statements: 86, branches: 88, functions: 73 },
  },
});
