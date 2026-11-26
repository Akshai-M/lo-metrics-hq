"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dashboard } from "@/lib/api";
import { bundleKey, fetchDashboard } from "@/lib/dashboard-client";
import { COMPETENCIES, type FilterQuery } from "@/lib/shared";
import { TABS, type Tab } from "@/lib/tabs";
import { AppSidebar } from "@/components/app-sidebar";
import { GlobalFilters } from "@/components/global-filters";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Hero } from "./ui";
import { CompetencyView, HealthView, OutcomesView, OverviewView, ReattemptsView, SplitsView, StudentsView, YogView } from "./views";

const STORE = "lo-dashboard"; // tab + applied filters for this browser tab (survives a reload)
const MAX_CACHED = 40;
// The Period & mode split tab doesn't use the global filters.
const filtersFor = (tab: Tab, f: FilterQuery) => (tab === "splits" ? {} : f);

/**
 * The dashboard runs in the browser: switching tabs and applying filters fetch one bundle from
 * POST /api/dashboard (nothing in the URL, no page reload). Bundles are kept per tab + filters,
 * so going back to a tab or filter set you've seen is instant, and tabs are preloaded on hover.
 */
export function DashboardApp({ initial, user }: { initial: Dashboard; user: string }) {
  const cache = useRef(new Map<string, Dashboard>([[bundleKey("overview", {}), initial]]));
  const inflight = useRef(new Map<string, Promise<Dashboard>>());
  const latestRequest = useRef(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [filters, setFilters] = useState<FilterQuery>({});
  const [shown, setShown] = useState<Dashboard>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((t: Tab, f: FilterQuery) => {
    const ff = filtersFor(t, f);
    const key = bundleKey(t, ff);
    const hit = cache.current.get(key);
    if (hit) return Promise.resolve(hit);
    let p = inflight.current.get(key);
    if (!p) {
      p = fetchDashboard(t, ff)
        .then((d) => {
          cache.current.set(key, d);
          if (cache.current.size > MAX_CACHED) cache.current.delete(cache.current.keys().next().value!);
          return d;
        })
        .finally(() => inflight.current.delete(key));
      inflight.current.set(key, p);
    }
    return p;
  }, []);

  const go = useCallback(
    async (t: Tab, f: FilterQuery) => {
      const id = ++latestRequest.current;
      setTab(t);
      setFilters(f);
      setError(null);
      try {
        sessionStorage.setItem(STORE, JSON.stringify({ tab: t, filters: f }));
      } catch {}
      const hit = cache.current.get(bundleKey(t, filtersFor(t, f)));
      if (hit) {
        setShown(hit);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const d = await load(t, f);
        if (id === latestRequest.current) setShown(d);
      } catch (e) {
        if (id === latestRequest.current) setError(e instanceof Error ? e.message : "Could not load data");
      } finally {
        if (id === latestRequest.current) setLoading(false);
      }
    },
    [load]
  );

  const prefetch = useCallback((t: Tab) => void load(t, filters).catch(() => {}), [load, filters]);

  // Restore the last tab / filters after a reload, then preload the other tabs in the background.
  useEffect(() => {
    let saved: { tab?: Tab; filters?: FilterQuery } = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(STORE) ?? "{}");
    } catch {}
    const t = TABS.some((x) => x.key === saved.tab) ? saved.tab! : "overview";
    const f = saved.filters && typeof saved.filters === "object" ? saved.filters : {};
    const restore = setTimeout(() => {
      if (t !== "overview" || Object.keys(f).length) void go(t, f);
    }, 0);
    const preload = setTimeout(async () => {
      for (const x of TABS) await load(x.key, f).catch(() => {});
    }, 800);
    return () => {
      clearTimeout(restore);
      clearTimeout(preload);
    };
  }, [go, load]);

  // A tab whose data hasn't arrived yet shows a placeholder; a filter change keeps the old numbers, dimmed.
  const waitingForTab = shown.tab !== tab;
  const showBar = tab !== "splits";

  return (
    <SidebarProvider>
      <AppSidebar active={tab} user={user} onSelect={(t) => void go(t, filters)} onPrefetch={prefetch} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          {loading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner /> Loading…
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="eyebrow flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary" /> Internal report
            </span>
            <Separator orientation="vertical" className="hidden h-5! sm:block" />
            <span className="eyebrow hidden sm:inline">Run {shown.latest.run.runId.slice(0, 8)}</span>
          </div>
        </header>
        <div className="flex w-full min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-6 lg:px-8 lg:py-8 2xl:px-12">
          {showBar && (
            <GlobalFilters applied={filters} options={shown.overview.options} compNames={COMPETENCIES} pending={loading} onApply={(f) => void go(tab, f)} />
          )}
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}.{" "}
              <button type="button" className="underline" onClick={() => void go(tab, filters)}>
                Try again
              </button>
            </p>
          )}
          {waitingForTab ? (
            <>
              <Hero tab={tab} />
              <Card className="rounded-lg">
                <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  {error ? "No data loaded." : (
                    <>
                      <Spinner /> Loading…
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className={loading ? "pointer-events-none flex flex-col gap-6 opacity-60 transition-opacity" : "flex flex-col gap-6 transition-opacity"} aria-busy={loading}>
              <View tab={tab} d={shown} onTab={(t) => void go(t, filters)} />
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function View({ tab, d, onTab }: { tab: Tab; d: Dashboard; onTab: (t: Tab) => void }) {
  switch (tab) {
    case "splits":
      return <SplitsView d={d} />;
    case "yog":
      return <YogView d={d} />;
    case "competency":
      return <CompetencyView d={d} />;
    case "reattempts":
      return <ReattemptsView d={d} />;
    case "outcomes":
      return <OutcomesView d={d} />;
    case "students":
      return <StudentsView d={d} />;
    case "health":
      return <HealthView d={d} />;
    default:
      return <OverviewView d={d} onTab={onTab} />;
  }
}
