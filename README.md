# LO Metrics HQ

ACD LO team metrics. Phase 1: FT competency assessments (clearance %, cleared students,
re-attempts, weekly and monthly trends) for online, offline and TR (technical round).

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
lib/metrics/filters.ts        global filters (URL params -> filtered rows, attempt numbers)
lib/metrics/overview.ts       overview numbers for the filtered rows
lib/metrics/tr.ts             TR interviews (post-offline sheet, action=postOfflineData)
lib/metrics/store.ts          Postgres (postgres.js; runs on Node and Bun)
lib/metrics/pipeline.ts       one run: fetch -> evaluate -> aggregate -> save
lib/metrics/cli.ts            `bun run refresh`
```

## .env

```
APPS_SCRIPT_ENDPOINT=https://script.google.com/macros/s/.../exec
DATABASE_URL=postgresql://...
ADMIN_USERNAME=admin
ADMIN_PASSWORD=           # long random password
REFRESH_TOKEN=            # optional: lets scripts call POST /api/refresh with header x-refresh-token
```

## Sign-in

One admin account, set in `.env` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`). The dashboard and every
`/api` route except `/api/health` need it. The session is a signed, HttpOnly cookie that lasts
7 days; changing `ADMIN_PASSWORD` signs everyone out. If either variable is missing, nobody can
sign in. Scripts can still call `POST /api/refresh` with header `x-refresh-token` when
`REFRESH_TOKEN` is set.

## TR (technical round)

TR comes from the post-offline sheet, one tab per competency (`TR_TABS` in `config.ts`):
DSA = "DSA 2.0 (current)" + "DSA (discontinued)", FE = "Frontend Development",
BE = "Backend Development", SE = "SE Fundamentals". Attempted = status `completed` or
`partially_completed`; cleared = `Clearance Status` is `Cleared`. TR shows as a third mode in the
period, overall and YOG splits, with a level-wise split of TR-cleared students. TR is counted per student like the other modes; set
`TR_COUNT = "interviews"` to count every interview instead.

## Filters (shared by every tab)

One filter bar above every tab; every KPI, chart and table follows it. Kept in the URL
(`lib/metrics/filters.ts`):

| Filter | URL | Default |
|---|---|---|
| Program | (none) | YFT. IRP is shown disabled, "coming soon" |
| Competency (multi) | `comps=C1,C2` | all with data |
| YOG (multi) | `yogs=2025,Unknown` | all |
| Mode (multi) | `modes=Offline,TR` | Offline + TR; Online needs the toggle below |
| Include online data | `online=1` | off |
| Date range | `from=YYYY-MM-DD&to=YYYY-MM-DD` | all dates (attempted_on / interview_on) |
| Attempt type | `attempt=first\|re` | all |
| Include unevaluable attempts | `unev=1` | off |
| Active students only | `active=1` | off |

**Attempt number:** a student's sittings per competency in date order, counted inside the selected
modes over all dates. Online and offline form one sequence; TR interviews form their own.

**Active student (assumed, to be confirmed):** at least one attempt or TR interview, in any mode,
in the last 30 days up to the latest date in the data (`ACTIVE_DAYS` in `config.ts`).

## YOG file

`data/user_yog.csv` (columns `user_id,YOG`) gives each student's year of graduation for the
YOG-wise split. To update it, replace the file with a new export and run `bun run refresh`.

## Commands

```
bun install
bun run dev                        # app + API (Next.js on the Bun runtime)
bun run build && bun run start     # production build, served on Node (same as Vercel)
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
| GET | `/api/overview?grain=&<filters>` | headline, trend and per-competency numbers for the filters |
| GET | `/api/periods?grain=month\|week&scope=ALL\|C1..C7` | weekly / monthly matrix (online + offline) |
| GET | `/api/splits?grain=&<filters>` | period, overall and YOG splits for the filters |
| GET | `/api/runs` | run history |
| POST | `/api/refresh` | starts a run in the background (202) |
| GET | `/api/refresh/status` | current / last run state |

Stages: the intended path is Online -> Offline -> TR -> placement pool, but students currently
enter the pool after clearing **offline**; TR is not a gate. Two settings in `config.ts`
(`"offline" | "tr" | "both"`, both default `"offline"`):

- `CLEARANCE_STAGE`: the headline **Assessment clearance %** = students who cleared that stage /
  students who attempted it ("both" = cleared offline and TR in the same competency / attempted offline).
- `POOL_ENTRY_STAGE`: the stage after which a student enters the placement pool. The future
  placement TAT clock starts at the date the student cleared this stage.

**Stage funnel** (overview): Online attempted -> cleared -> Offline attempted -> cleared -> TR
attempted -> cleared, for the selected modes, in distinct students. Each stage counts everyone who
reached it in a competency, whatever their path. The conversion lines are same-student, same
competency ("of students who cleared Offline, X% attempted TR"); students who attempted a mode
without clearing the previous one in that competency are counted at their stage, left out of that
conversion and listed as notes. Offline cleared -> TR attempted is capacity-limited, not a
performance rate. The **monthly / weekly trend** follows `CLEARANCE_STAGE` too, bucketed by the
date of the attempt at that stage. The **Data health** tab has the run ID, events read, unevaluable
counts and sources.

Definitions (dashboard):

- A student **clears** a competency when every gated section meets its QC cutoff on one attempt
  (TR: Clearance Status = Cleared). The headline counts students who cleared at least one
  selected competency.
- **Clearance %** = cleared students / attempted students (unique students).
- **Unevaluable** attempts (`qualified IS NULL`: a blank gated score or no cutoff for the date) are
  left out of every denominator by default and shown as their own count on the overview. With
  "Include unevaluable attempts" on they count as attempted, not cleared.
- **Total rows** in the split tables count unique students across the selected competencies, so
  they are not the sum of the competency rows.
- **Reattempt %** = students with 2+ attempts in a competency / students attempted (overall:
  2+ attempts in at least one competency).
- **Mean / median re-attempts to clear**: per student x competency (TR separately) that cleared,
  attempts before the first qualifying one. **Attempts so far** adds never-cleared pairs, counted as
  attempts so far - 1.

The stored run headline (`ft_comp_runs`, `bun run refresh` output) still uses the pipeline's
original rule (unevaluable attempts in the denominator, online + offline); the dashboard reproduces
it with Online + Offline and "Include unevaluable attempts" on. Audit files from the last run are
in `output/` (candidate IDs only).
