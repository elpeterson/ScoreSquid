# @scoresquid/config

Tooling config shared by the ScoreSquid apps (`apps/*`). Internal: used from source, never published.

| Import | Use in an app |
|---|---|
| `@scoresquid/config/tsconfig/nextjs.json` | `tsconfig.json`: `"extends"`, then the app's own `paths` and `include` (they resolve relative to the app) |
| `@scoresquid/config/eslint` | `eslint.config.mjs`: `export { default } from "@scoresquid/config/eslint";` |
| `@scoresquid/config/postcss` | `postcss.config.mjs`: `export { default } from "@scoresquid/config/postcss";` |
| `@scoresquid/config/tailwind` | `tailwind.config.ts`: `presets: [preset]`, `content: [...own globs, ...sharedContent(__dirname)]`, app-only colours in `theme.extend` |
| `@scoresquid/config/vitest` | `vitest.config.ts`: `export default appVitestConfig(__dirname);` |

The tools themselves (`eslint`, `vitest`, `tailwindcss`, `postcss`, `autoprefixer`, `typescript`) stay in each app's `devDependencies`; this package brings the plugins its configs import.
