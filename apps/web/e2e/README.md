# End-to-end tests

Playwright tests of the main journeys in both sports, run on every PR by the `End-to-end` job in `ci.yml`.

## Running them
From `apps/web`, with a local Supabase stack that has every migration applied:

```sh
supabase start                          # or `supabase migration up` if it's already running
npx playwright install chromium webkit  # once
npm run e2e                             # all projects
npx playwright test --project=desktop   # quicker
npx playwright test --ui                # to watch or debug
```

The config reads the stack's URL and keys from `supabase status`, starts the MSO stand-in on port 4010 and the app on port 3100, and refuses to run against anything but a local stack. To use a different local stack, set `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY` and `E2E_MAIL_URL`.

## How they work
- **Accounts:** each test gets its own account through the `account` fixture, made with the local stack's admin key and deleted afterwards, so tests run in parallel.
- **Data:** made up, always. Never use a real athlete's name, membership number or MSO ID here: CI reports from this public repo are public.
- **MSO:** `stubs/mso.mjs` serves the made-up unit-test fixtures for Athlete ID `1001`. The app reaches it through `E2E_MSO_ORIGIN`, which `lib/outbound.ts` accepts only for a loopback address and never on Vercel.
- **Between Ends:** searches are seeded as the crawler would leave them (`support/seed.ts`), so no test runs the crawler or reads Between Ends.
- **PDFs:** `support/pdf.ts` writes a scorecard PDF from a text fixture, so no real scorecard is committed.
- **Devices:** every test runs on desktop Chrome. Tests tagged `@phone` also run on Pixel 7 (Chromium) and iPhone 15 Pro (WebKit) and check that the page doesn't scroll sideways. `layout.spec.ts` visits every screen at the phone's own width and at 360 px. It checks that tabs sit inside their tab bar, the athlete picker is centred in the header, and the signed-in landing page shows "Go to Dashboard" without scrolling; on a touch screen, it also checks each control has a tap area of at least 40 px.
- **Known failures:** `knownFailureOn('iphone', 'SQ-0xx')` marks a failure that a story will fix. When it's fixed, Playwright reports the test as unexpectedly passing; remove the mark then.
