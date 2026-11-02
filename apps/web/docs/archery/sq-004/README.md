# SQ-004 spike: where the Between Ends crawler runs and what it keeps

Measured 2026-11-02. Only totals are recorded here: no names or membership numbers.

## Decisions
1. **It runs on Vercel Workflow, not GitHub Actions**, once the preview test below passes.
2. **It keeps what it reads, narrowly,** in private `be_*` tables: entries for ranking events, and arrows only for matched entries. App users can't read those tables. A parent sees a copy of their own search's matches.
3. **It reads a tournament's scores only when the number or a possible name match appears** in that event.
4. **One search reads at a time,** at one request every 1.1 s, with progress saved in Postgres after each batch.

## Why not GitHub Actions
- GitHub's [terms for Actions](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features) say "don't use Actions as a content delivery network or as part of a serverless application", and bar hosted-runner activity unrelated to the "production, testing, deployment, or publication" of the software. A job started by a parent's click in the live app is hard to square with either.
- This repo is public, so run logs and dispatch inputs are public too. Inputs and logs could never carry a membership number.
- It would also add a GitHub token to Vercel and a database credential to Actions.

## Why Vercel Workflow
| | Vercel Workflow on Hobby ([limits](https://vercel.com/docs/workflows/pricing)) | Effect here |
|---|---|---|
| Run length | No limit; each step is limited by the function maximum, 300 s | Batches of 50 requests take about a minute |
| Included | 50,000 events and 1 GB written a month | About 200 full three-year searches a month, from the event estimate below |
| Payloads | Encrypted; `experimental_retention: 0` stops them being readable when a run ends, with copies gone within 36 days | Pass only a search id, and return only counts |
| Metadata | Not encrypted, and kept for up to a year | Never put a number or name in attributes or hook tokens |

Compute and queue charges were not checked against Hobby's allowances: read the Usage tab after the preview test. Hobby is for non-commercial use, so charging for ScoreSquid would mean moving to Pro.

## Measurements
From `GET /tournaments/`, plus 20 tournaments spread across the last year (62 requests at 1 request a second).

| | Earlier estimate | Measured |
|---|---|---|
| Tournaments in the last year | ~170 | **474** (1,153 in three years) |
| Requests per tournament | ~5.5 | **2 to 2.6**, reading scores only on a match |
| Entries with no usable number | ~5% or 14% | **21.8%** (338 of 1,552); 10 of 20 events have at least one |
| Entries per ranking event | ~55 | median 60, mean 78 |
| ETag `304` on a repeat request | yes | 14 of 14 |
| Tournaments in three years updated after their end date | unknown | 541 of 1,153; 207 more than 8 days after |

The request range uses this sample's 1.0 ranking events per tournament and the all-time 1.6 from `/events`; 20 tournaments is a small sample.

**First search at one request every 1.1 s:** about 17 to 23 minutes for one year, and 42 to 55 for three.

What follows from these:
- A cache of numbers alone doesn't work: half the events need name matching, which needs names (SQ-019 criterion 6).
- A tournament can't be treated as final once it ends. Compare `updated_at`, then use the ETag. Whether `updated_at` moves on every score edit is still unknown, so a stored event should still be revalidated by ETag.
- No `CombinedRankingEvent` was in the sample, so check its shape before the crawler relies on it.

## Local proof
Branch `chore/sq-004-workflow-proof`: the real client over a fake transport in the real app. It never contacts Between Ends.

| Test | Result |
|---|---|
| 120 requests across 3 steps | Completed in 119 s, using 12 events |
| Pacing across step boundaries | Gaps of 999 to 1,107 ms, hence 1.1 s for the real interval |
| Cancel | Run stopped and reported `cancelled` |
| Lint, typecheck, tests and build with Workflow wired in | Pass |
| `kill -9` the server mid-run, then restart | **Not recovered:** still `running` over 5 minutes later |

The failed recovery was on the Local World, whose queue is in memory and which is documented as not for production, so it says nothing about Vercel in either direction. The app shouldn't depend on it anyway: see "Restartable" below.

## Still to prove: run this before building on it
On a preview of the proof branch, `hang=1` makes one step outlast Hobby's 300 s limit, so Vercel kills it:

```bash
git push -u origin chore/sq-004-workflow-proof
cd apps/web
npx vercel curl "/sq004-proof?requests=600&hang=1" --deployment <preview-url> -- --request POST
npx vercel curl "/sq004-proof?run=<runId>" --deployment <preview-url>   # after about 16 minutes
```

**Pass:** `status` is `completed`, `requests` is 600, `elapsedSeconds` is over 600 and `minGapMs` is about 1,000. If the run fails or sticks, the fallback is a self-continuing chain of ordinary functions using the same Postgres checkpoints. Then delete the branch; don't merge it.

## Design for the build
- **Start:** the server action inserts a queued search, then calls `start(crawl, [searchId], { experimental_retention: 0 })`.
- **One reader:** the unique index in `draft-schema.sql` allows only one `running` search. One run drains the queue, then ends, so nothing reads Between Ends when no search is waiting.
- **Restartable:** Postgres is the record of progress, not the run. Each batch saves what it read. If a running search's heartbeat is stale when its owner views it or a new search starts, a fresh run takes it over and skips what's saved. That needs no schedule.
- **Cancel:** a function sets the status, and the crawler checks it between batches. Parents have no direct update rights on a search.
- **Pacing:** wait out the interval at the end of each step, because the next step may get a new client with no memory of the last request.
- **Client gap:** a `429` isn't retried and `Retry-After` is ignored. Treat it as a pause (criterion 7).
- **Proxy:** `proxy.ts` must exclude `.well-known/workflow/`, or Workflow's internal calls hit the auth proxy.
- **Dependency warning:** the build warns about mismatched `@vercel/oidc` versions (3.x and 4.0.5) inside Workflow's dependencies. It didn't affect the local proof; confirm on the preview.

## Crawler credential
The draft schema gives `be_crawler` only the cache and search-progress columns. The password is set by hand, never in a migration. Connect through the shared pooler as `be_crawler.<project-ref>` on port 6543, since it has IPv4 on every plan and transaction mode suits serverless, with prepared statements off. This adds a `pg` or `postgres` dependency and has **not been tried on hosted Supabase**.

## Draft schema
`draft-schema.sql` is deliberately not in `supabase/migrations/`. `checks.sql` runs 24 checks in a rolled-back transaction, and all pass. The anon and parent checks also passed on the local Supabase image; the crawler checks ran on plain Postgres 17 with `stubs.sql`, because of the crash below.

```bash
docker run -d --rm --name sq004-pg -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
docker cp draft-schema.sql sq004-pg:/draft-schema.sql   # then run stubs.sql and checks.sql with psql from /
```

**Don't run `grant <role> to current_user with set true` on the local Supabase image.** It crashed the Postgres backend (signal 11) both times it ran; the database restarted by itself. The draft doesn't use it.

Before this ships: a cancel function, and a decision on how long `be_*` rows are kept.
