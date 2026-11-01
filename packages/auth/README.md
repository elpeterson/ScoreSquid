# @scoresquid/auth

Sign-in code for ScoreSquid. One Supabase project and one account cover every sport, and the session cookie spans `.scoresquid.com` in production. Internal: used from TypeScript source (each app lists it in `transpilePackages`), never published.

Next.js needs `proxy.ts`, pages, route handlers and `'use server'` files inside the app, so each sport keeps a thin wrapper:

| In the sport's folder | Contents |
|---|---|
| `proxy.ts` | `createAuthProxy({ rewritePrefix, publicPrefixes })` for each sport, in `apps/web/proxy.ts`, with the `matcher` (Next reads it statically) |
| `app/auth/callback/route.ts` | `export { GET } from '@scoresquid/auth/callback'` |
| `app/(auth)/login/page.tsx` | Renders `LoginScreen` with the app name, tagline and actions |
| `app/(auth)/login/actions.ts` | `'use server'` wrappers that supply the sport's email origin |
| `app/(main)/account/actions.ts` | `'use server'` wrapper around `changePassword` |
| `app/actions/settings.ts` | `'use server'` wrappers that supply the sport's settings defaults |

- **`/actions` has no `'use server'` on purpose.** Its functions are not endpoints until an app wraps them, so an app only exposes what it chooses to.
- **Settings:** the defaults object is the whitelist. `theme` plus any key with a boolean default can be written; anything else is rejected.
- **Login errors:** the callback sends a fixed code in `?error=`, and `/login` shows only text it knows. A crafted link can't put its own words on the login page.
- **Recovery:** a callback with `type=recovery` always lands on `/account?tab=security`.
- **Profiles stay in each sport.** Use `deleteProfileWithFiles` when a profile owns stored files: it deletes the row first, so a failed delete leaves the files alone.
- **Styling:** Tailwind finds this package's classes through `sharedContent()` in `@scoresquid/config/tailwind`.
