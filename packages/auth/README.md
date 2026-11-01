# @scoresquid/auth

Sign-in code shared by the ScoreSquid apps. Only code is shared: each app has its own Supabase project and login, so signing in to one never signs in to the other. Internal: used from TypeScript source (each app lists it in `transpilePackages`), never published.

Next.js needs `proxy.ts`, pages, route handlers and `'use server'` files inside the app, so each app keeps a thin wrapper:

| In the app | Contents |
|---|---|
| `proxy.ts` | `export const proxy = createAuthProxy({ publicPrefixes })`, plus the app's `matcher` (Next reads it statically) |
| `app/auth/callback/route.ts` | `export { GET } from '@scoresquid/auth/callback'` |
| `app/(auth)/login/page.tsx` | Renders `LoginScreen` with the app name, tagline and actions |
| `app/(auth)/login/actions.ts` | `'use server'` wrappers that supply the app's fallback origin |
| `app/(main)/account/actions.ts` | `'use server'` wrapper around `changePassword` |
| `app/actions/settings.ts` | `'use server'` wrappers that supply the app's settings defaults |

- **`/actions` has no `'use server'` on purpose.** Its functions are not endpoints until an app wraps them, so an app only exposes what it chooses to.
- **Settings:** the defaults object is the whitelist. `theme` plus any key with a boolean default can be written; anything else is rejected.
- **Login errors:** the callback sends a fixed code in `?error=`, and `/login` shows only text it knows. A crafted link can't put its own words on the login page.
- **Recovery:** a callback with `type=recovery` always lands on `/account?tab=security`.
- **Profiles stay in each app.** Use `deleteProfileWithFiles` when a profile owns stored files: it deletes the row first, so a failed delete leaves the files alone.
- **Styling:** Tailwind finds this package's classes through `sharedContent()` in `@scoresquid/config/tailwind`.
