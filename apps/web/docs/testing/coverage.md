# Unit test coverage

`npm run test:coverage` (from the repo root) runs Vitest with coverage in `apps/web` and
`packages/auth`. CI runs it on every PR and fails if either package drops below its floor.

## What's measured
- **`apps/web`:** every `.ts` file in `app/`, `features/` and `lib/`, plus `proxy.ts`. UI
  (`.tsx`) is covered by the Playwright tests in `e2e/` instead. Files no test loads count
  as untested, so the number can't look better by leaving them out.
- **`packages/auth`:** every `.ts` file in `src/`.

The floors are in each package's `vitest.config.ts`, just under the numbers below. Raise
them as coverage grows; don't lower one to get a PR through.

## Baseline (SQ-046, 2026-11-03)

| Package | | Lines | Statements | Branches | Functions |
|---|---|---|---|---|---|
| `apps/web` | before | 57.5% | 56.7% | 57.9% | 69.1% |
| | after | **77.5%** | **76.0%** | **72.3%** | **80.3%** |
| | floor | 76% | 75% | 71% | 79% |
| `packages/auth` | before | 59.5% | 59.7% | 69.1% | 58.1% |
| | after | **87.6%** | **87.8%** | **89.7%** | **74.2%** |
| | floor | 86% | 86% | 88% | 73% |

"Before" is with every source file counted. Vitest's default, counting only files the
tests load, reported 96.6% lines for `apps/web`.

## Untested files, by risk
Ranked by whether a file is a public endpoint, whether it writes data, then size. Every
pure helper in `lib/` and `features/<sport>/lib/` was already well covered.

| Risk | File | Before | Now |
|---|---|---|---|
| 1 | `app/gymnastics/actions/mso.ts` (public, writes, reads MSO) | 0% | tested: input, sign-in, ownership, MSO origin |
| 2 | `app/archery/actions/between-ends.ts` (public, writes) | 0% | tested: input, sign-in, ownership |
| 3 | `app/archery/actions/archer.ts`, `app/gymnastics/actions/gymnast.ts` (public, delete profiles) | 0% | tested |
| 4 | `app/gymnastics/(main)/scores/actions.ts`, `app/archery/(main)/events/[id]/actions.ts`, `…/import/actions.ts`, both `dashboard/actions.ts` (public, write) | 0% | tested |
| 5 | `packages/auth/src/actions.ts` (settings writes, password change) | 0% | tested |
| 6 | Login, account and settings actions in each sport | 0% | thin wrappers over `packages/auth`, which is tested |
| 7 | `proxy.ts` | 0% | thin wrapper over the tested proxy factory and `lib/sport.ts` |
| 8 | `features/archery/lib/scorecard/extract.ts`, `features/archery/workflows/be-search.ts` | 0% | glue around PDF.js and Vercel Workflow; their logic is in tested helpers |
| 9 | `features/archery/lib/betweenends/crawl-store.ts` | 0% | SQL only a real database can check; `crawl.ts` is tested against a fake store |

## How the action tests work
`lib/__tests__/support/fake-supabase.ts` stands in for the Supabase client. It records
each table, operation, filter and RPC, and answers from a handler in the test. A test
then checks three things for each action: bad input is refused before any database
call, a signed-out caller is turned away, and every query is filtered by the signed-in
user's id (`unscoped()` lists any that aren't). `fetch` is replaced so any network call
fails the test, and Between Ends and the workflow are mocked. Fixtures are made up.
