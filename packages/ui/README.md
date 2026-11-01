# @scoresquid/ui

shadcn/ui components and `cn()` shared by the ScoreSquid apps. Internal: used from TypeScript source (each app lists it in `transpilePackages`), never published.

```tsx
import { Button } from '@scoresquid/ui/components/button';
import { cn } from '@scoresquid/ui/lib/utils';
```

- **Generated code:** change components through the shadcn CLI, not by hand: `npx shadcn@latest add <name> -c packages/ui`.
- **Styling:** theme tokens and `@tailwind` directives stay in each sport's `app/<sport>/globals.css`, so each app keeps its own brand. Tailwind finds this package's classes through `sharedContent()` in `@scoresquid/config/tailwind`.
- **No app logic here:** this package never depends on Supabase or on an app.
- **Brand:** the ScoreSquid logo is in `src/brand/`: `scoresquid-mark.svg` (navy, for light backgrounds), `scoresquid-mark-white.svg` (for dark backgrounds) and `scoresquid-icon.svg` (white on a teal rounded square, for app icons).
