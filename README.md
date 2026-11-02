# ScoreSquid

[![License](https://img.shields.io/badge/license-GPL--3.0-blueviolet?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/github/v/release/elpeterson/ScoreSquid?style=flat-square&label=version)](https://github.com/elpeterson/ScoreSquid/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/elpeterson/ScoreSquid/ci.yml?style=flat-square&label=tests)](https://github.com/elpeterson/ScoreSquid/actions/workflows/ci.yml)

> **"Every score, one place."**

ScoreSquid is one mobile-first app for keeping a young athlete's competition scores, with one account across sports.

| Sport | Address | About |
|---|---|---|
| Gymnastics | `gymnastics.scoresquid.com` | [Meet scores, MeetScoresOnline import, consistency charts](apps/web/docs/gymnastics/README.md) |
| Archery | `archery.scoresquid.com` | [Between Ends scorecard import, arrow-level insights](apps/web/docs/archery/README.md) |

`scoresquid.com` shows a sport picker. Paths are the same on each subdomain (`/login`, `/dashboard`).

## 🛠 Tech Stack
- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Database, Auth & Storage:** [Supabase](https://supabase.com/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Charts:** [Recharts](https://recharts.org/)
- **Testing:** [Vitest](https://vitest.dev/)
- **Monorepo:** npm workspaces + [Turborepo](https://turborepo.com/)
- **Deployment:** [Vercel](https://vercel.com/)

## 💻 Local Development

### 1. Clone & Install
```bash
git clone https://github.com/elpeterson/ScoreSquid.git
cd ScoreSquid
npm install
```

### 2. Environment
```bash
cp apps/web/.env.example apps/web/.env.local
```
Fill in your Supabase project's URL and publishable key, or the values from a local stack.

### 3. Database
The schema, row-level security policies and views are in [`apps/web/supabase/migrations/`](apps/web/supabase/migrations/). For a local stack, from `apps/web/`:
```bash
supabase start
```
For a hosted project, run `supabase db push` or paste the migration files into the SQL Editor in order.

Schema changes go in a new timestamped file; never edit a migration that has already been applied.

### 4. Run
```bash
npm run dev
```
Open `http://localhost:3000` and choose a sport. Localhost has no subdomains, so the choice is kept in a cookie; go back to `/?sport=gymnastics` or `/?sport=archery` to switch.

## 🧪 Testing
```bash
npm run lint
npm run typecheck
npm test
npm run build   # needs the two NEXT_PUBLIC_SUPABASE_* variables; placeholders work
```
