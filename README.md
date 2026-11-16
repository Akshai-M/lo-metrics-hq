# LO Metrics HQ

ACD LO team metrics. Phase 1: FT competency assessments (clearance %, cleared students,
re-attempts, weekly and monthly trends).

One Next.js project (App Router + Tailwind CSS), run with Bun. The API is Elysia, mounted
inside Next.js at `app/api/[[...slugs]]/route.ts`. One `package.json`, one `.env`.

## Layout

```
app/page.tsx                  dashboard (sidebar tabs: overview, period & mode, YOG, competency)
components/ui/                shadcn/ui components (add more with `bunx shadcn@latest add <name>`)
components/*.tsx              dashboard pieces: sidebar, filters, trend chart (recharts), split tables
app/api/[[...slugs]]/route.ts mounts the Elysia API on /api/*
lib/server.ts                 Elysia routes
lib/api.ts                    page -> Elysia (in-process)
lib/metrics/config.ts         rules: competencies, section names, cutoffs, date windows, tab rule
lib/metrics/competency.ts     metric logic
lib/metrics/appsScript.ts     Apps Script client
lib/metrics/store.ts          Postgres (Bun.SQL)
lib/metrics/pipeline.ts       one run: fetch -> evaluate -> aggregate -> save
lib/metrics/cli.ts            `bun run refresh`
```

## .env

```
APPS_SCRIPT_ENDPOINT=https://script.google.com/macros/s/.../exec
DATABASE_URL=postgresql://...
REFRESH_TOKEN=            # optional: required header x-refresh-token on POST /api/refresh
```

## YOG file

`data/user_yog.csv` (columns `user_id,YOG`) gives each student's year of graduation for the
YOG-wise split. To update it, replace the file with a new export and run `bun run refresh`.

## Commands

```
bun install
bun run dev                        # app + API (Next.js on the Bun runtime)
bun run refresh                    # recompute metrics from cached sheets and save a run
bun run refresh --refresh          # re-fetch every sheet first
bun run refresh --refresh-errors   # re-fetch only sheets that failed
bun run refresh --no-db            # compute + write output/ only
```

## API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/metrics/latest` | latest run, by-competency, event coverage |
| GET | `/api/periods?grain=month\|week&scope=ALL\|C1..C7` | weekly / monthly matrix |
| GET | `/api/runs` | run history |
| POST | `/api/refresh` | starts a run in the background (202) |
| GET | `/api/refresh/status` | current / last run state |

Definitions: a student **clears** a competency when every gated section meets its QC cutoff on
one attempt. Clearance % = cleared students / attempted students. Attempts with a blank gated
section score are **unevaluable** and left out. Audit files from the last run are in `output/`
(candidate IDs only).
