# SQ-004 spike: where the Between Ends crawler runs and what it keeps

Measured 2026-11-02. Only totals are recorded here: no names or membership numbers.

## Decisions
1. **It runs on Vercel Workflow, not GitHub Actions.** The preview test below passed.
2. **It keeps what it reads, narrowly,** in private `be_*` tables: every archer listed in a ranking event, which spares later searches from re-reading it, and arrows only for matched archers. The data is already public on Between Ends, tournament by tournament; app users still can't read those tables. A parent sees a copy of their own search's matches.
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

Compute and queue charges were not checked against Hobby's allowances: read the Usage tab once real searches run. Hobby is for non-commercial use, so charging for ScoreSquid would mean moving to Pro.

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
- A tournament can't be treated as final once it ends. Compare `updated_at`, then use the ETag. Whether `updated_at` moves on every score edit is still unknown, so one cache hit in 20 is checked by ETag, and a miss is logged as `an event changed without updated_at moving`. Scores are read fresh on every match regardless.
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

## Preview test on Vercel: passed
Run on a Hobby preview of the proof branch on 2026-11-02, with `hang=1` making one step outlast the 300 s function limit:

```bash
cd apps/web
npx vercel curl "<preview-url>/sq004-proof?requests=600&hang=1" -- --request POST
npx vercel curl "<preview-url>/sq004-proof?run=<runId>"
```

| | Result |
|---|---|
| Status | `completed`, with all 600 requests made |
| Elapsed | 1,099 s, well past the function limit |
| Recovery | The hung step started at 17:37:01 and was started again at 17:45:16 (13 `step_started` events for 12 steps), then finished normally |
| Gaps | Minimum 999 ms; maximum 497 s, the stall during recovery |
| Events | 40 for 600 requests, about 3.3 per batch |

What this means for the build:
- **A killed step stalled the run for about 8 minutes.** The search should show as still running through a gap that long, and the stale-heartbeat limit needs to be longer than it.
- **A retried step starts again from its beginning,** so a real batch killed partway would repeat its requests unless each read is saved as it happens.
- The test used a fake Between Ends and no database, so the crawler's own reads and writes are still untested.

## Design for the build
- **Start:** the server action calls `start_be_search`, which copies the number and name from the archer's profile, then calls `start(crawl, [searchId], { experimental_retention: 0 })`.
- **One reader:** a unique index allows only one `running` search. One run drains the queue, then ends, so nothing reads Between Ends when no search is waiting.
- **Restartable:** Postgres is the record of progress, not the run. Each batch saves what it read. If a search has been silent for 15 minutes when its owner views it, or a new search starts, a fresh run takes it over and skips what's saved. `kick_be_search` limits viewing to one restart per search every 15 minutes. That needs no schedule.
- **Cancel:** a function sets the status, and the crawler checks it between batches. Parents have no direct update rights on a search.
- **Pacing:** wait out the interval at the end of each step, because the next step may get a new client with no memory of the last request.
- **`429`:** the client waits as `Retry-After` asks, up to 60 s, then the search fails and can be retried (criterion 7).
- **Discovery:** Workflow only compiles workflows that something in the build imports, and no screen uses `actions/between-ends.ts` yet, so the build reports `0 workflows` for now. The SQ-019 screen must bring that to `1 workflow`: check the `Compiled workflows` line in the build output. A temporary route importing the action confirmed this.
- **Proxy:** `proxy.ts` must exclude `.well-known/workflow/`, or Workflow's internal calls hit the auth proxy.
- **Dependency warning:** the build warns about mismatched `@vercel/oidc` versions (3.x and 4.0.5) inside Workflow's dependencies. It didn't affect the local proof or the preview test.

## Real data test
The real store and `be_crawler` role, on a disposable Postgres, ran two searches over the same 30 days of Between Ends at the real 1.1 s pace:

| | Tournaments | Requests | Time |
|---|---|---|---|
| First search, cache empty | 28 | 59 | 64 s |
| Second search, a different archer, cache filled | 28 | 4 | 3 s |

The cache held 1,989 archers across 35 events, 479 of them with no number. This did not go through Vercel Workflow or a server action; those need a deployment.

## Known limits
- **Queue:** one person with many accounts could keep the one-at-a-time queue full. A global cap would let them block new searches instead, so there isn't one; requests stay paced either way.
- **TLS:** the pooler connection is encrypted but doesn't verify Supabase's certificate. Verifying it means supplying their root CA.
- **Self-hosting:** Workflow's routes rely on Vercel's authentication, so block them at the proxy before moving anywhere else.

## Crawler credential
The migration gives `be_crawler` only the cache and search-progress columns. The password is set by hand, never in a migration. Connect through the shared pooler as `be_crawler.<project-ref>` on port 6543, since it has IPv4 on every plan and transaction mode suits serverless, with prepared statements off. This adds a `pg` or `postgres` dependency and was confirmed on hosted Supabase on 2026-11-02. Vercel Production needs it as `BE_CRAWLER_DATABASE_URL`.

## Schema and checks
The schema is `supabase/migrations/20261102160000_between_ends_crawler.sql`, with retention in `20261102170000_be_cache_retention.sql`. `checks.sql` tests its access rules in a rolled-back transaction: every check on plain Postgres 17 with `stubs.sql`, and those that don't need the crawler role on the local Supabase image.

```bash
docker run -d --rm --name sq004-pg -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
docker cp ../../../supabase/migrations/20261102160000_between_ends_crawler.sql sq004-pg:/migration.sql
sed '/create extension/d' ../../../supabase/migrations/20261102170000_be_cache_retention.sql > /tmp/retention.sql
docker cp /tmp/retention.sql sq004-pg:/retention.sql
docker cp ../../../supabase/migrations/20261102180000_kick_be_search.sql sq004-pg:/kick.sql
docker exec -i sq004-pg psql -q -U postgres < stubs.sql
docker exec -i sq004-pg psql -U postgres -v crawler=1 < checks.sql 2>&1 | grep -E "PASS|FAIL|ERROR"
docker rm -f sq004-pg
```

**Don't run `grant <role> to current_user with set true` on the local Supabase image.** It crashed the Postgres backend (signal 11) both times it ran; the database restarted by itself. The migration doesn't use it.

`be_*` rows not read for 12 months are deleted by a daily `pg_cron` job, which never contacts Between Ends. The crawler must update `read_at` whenever it checks a tournament. The Between Ends maintainer won't be contacted for now (decided 2026-11-02), so the pacing and `User-Agent` matter all the more.
