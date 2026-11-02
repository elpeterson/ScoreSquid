# ScoreSquid — Claude Context

One mobile-first app with two sports, Gymnastics and Archery, where parents keep their athletes' competition scores under one account. Gymnastics imports from MeetScoresOnline (MSO); archery imports Between Ends scorecards. Public repo: never commit secrets or real athletes' data.

## Where things live
- **Monorepo** (`elpeterson/ScoreSquid`): the app is `apps/web/`; app paths below are relative to it. Root holds `package.json` (npm workspaces, Turborepo), `turbo.json`, `.github/`, `.claude/`, `.releaserc`. Shared packages are in `packages/` under the `@scoresquid/` scope.
- **App:** Next.js 16 App Router, with no root `app/layout.tsx`: `app/gymnastics/`, `app/archery/` and `app/(home)/` (the sport picker) each have their own root layout. Sport code is in `features/<sport>/{components,lib}`; shared code is in `lib/`.
- **Routing:** `proxy.ts` (Next 16's middleware) and `lib/sport.ts`. The subdomain picks the sport on `scoresquid.com`; other hosts use a cookie set by `/?sport=`. The proxy rewrites `/login` to `/<sport>/login`, so visitors' URLs and root-relative `redirect()`, `<Link>` and `router.push` don't change, but `revalidatePath` needs the internal path (`/archery/dashboard`).
- **Auth:** `packages/auth` (`@scoresquid/auth`) holds the Supabase clients, proxy factory, callback, `safeNextPath`, `parseSettingUpdate`, and the login, password and user-menu UI; see its README. One account across sports; `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.scoresquid.com` in production shares the session. Email links use `emailOrigin(sport)`, never the request.
- **Server actions:** `app/<sport>/actions/` and colocated `actions.ts` files. Every action is a public endpoint: treat its arguments as untrusted input.
- **Logic:** pure, tested helpers. Gymnastics, in `features/gymnastics/lib/`: `mso-api.ts` (JSON API client, query allowlist), `mso-parser.ts` (scrape parsing, `msoResultsUrl`), `insights.ts`, `constants.ts`, `competitions.ts` (`insertCompetitionWithScores`). Archery, in `features/archery/lib/`: `scorecard/`, `stats.ts`, `events.ts`, `betweenends/`.
- **UI:** shared shadcn/ui components and `cn()` are in `packages/ui` (`@scoresquid/ui/components/<name>`; generated: change via the shadcn CLI, don't hand-edit). Each sport has its own `globals.css` theme.
- **Database:** Supabase Postgres, one project. Schema, RLS and views are in `supabase/migrations/`. Shared: `athletes` (scoped by `sport`), `user_settings`. Gymnastics: `gymnast_profiles`, `gym_settings`, `gym_competitions`, `gym_scores`, view `gym_competitions_with_scores`. Archery: `archer_profiles`, `arch_events`, `arch_rounds`, `arch_ends`, `arch_be_searches`, `arch_be_search_matches`. Crawler cache (private): `be_tournaments`, `be_events`, `be_entries`, written by the limited `be_crawler` role. Read athletes through the `gymnast_athletes` and `archer_athletes` views; write with `create_gymnast`, `update_gymnast`, `create_archer`.
- **Tests:** Vitest, in `lib/__tests__/` and `features/<sport>/lib/__tests__/` with fixtures alongside; auth tests in `packages/auth/src/__tests__/`.
- **CI/CD:** `.github/workflows/`: `ci.yml` (lint, typecheck, test, build on PRs and main), `release.yml` (semantic-release from the repo root, one version, `v` tags), `vercel-checks.yml`, `supabase-keepalive.yml` (stopgap until the backend is self-hosted). Vercel deploys from GitHub.
- **Env:** `apps/web/.env.example` lists the variables. `.env.local` files hold real values: never read or print them.

## Commands
Run from the repo root: `npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` (needs the two `NEXT_PUBLIC_SUPABASE_*` vars; placeholders work, every route is dynamic). Supabase CLI commands run from `apps/web/`. `/ship` runs all checks and prepares a PR; `/validate-setup` checks this Claude setup.

## Rules
- **Security invariants.** Every table has RLS scoped to `auth.uid()`; keep it that way in any new migration. The one exception is the ownerless `be_*` crawler cache, which app users can't read at all. New views use `security_invoker = true` and are revoked from `anon`. Server actions also filter by `user.id` and validate input (whitelists, helpers in `lib/`). Never fetch a client-supplied URL server-side without an origin allowlist. Redirect targets go through `safeNextPath`. Writes that span tables use a helper or function that leaves no partial rows.
- **Schema changes** go in a new timestamped file in `supabase/migrations/`; never edit an applied migration. Claude never runs `supabase db push`, `db reset` or `migration repair`: it writes the file and the user applies it.
- **MSO:** read-only. Only the queries allowlisted in `mso-api.ts`. Prefer the JSON API; the HTML scrape is the WAG/legacy fallback.
- **Test fixtures** use made-up names and details, never a real athlete's. `data/` stays gitignored.
- **Git:** conventional commits (semantic-release reads them: `feat` → minor, `fix` → patch; use `chore` for changes that shouldn't release). Work on a branch (`feat/`, `fix/`, `chore/`, `docs/`), one PR per concern, never commit to `main`. Claude commits locally; the user pushes and opens PRs (`git push` always asks).
- **Done means checked:** lint, typecheck, tests and build pass before a commit is called done. New logic gets a pure helper in `lib/` or `features/<sport>/lib/` with tests.

## Claude setup (`.claude/`)
`settings.json` (shared permissions; `git push` asks, `.env` reads denied) · `hooks/guard.sh` (forces a prompt on force-push, hard reset, `rm -r`, Supabase writes, Vercel prod and `.env` access) · `commands/ship.md`, `commands/validate-setup.md` · `agents/security-reviewer.md` (read-only review of auth, RLS, actions and outbound fetches; use before merging anything that touches them). Machine-specific allows go in the gitignored `settings.local.json`.
