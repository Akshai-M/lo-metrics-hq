// Browser-side: load a dashboard tab's bundle. Filters go in the POST body, never in the URL.
import type { Dashboard } from "./api";
import type { FilterQuery } from "./shared";
import type { Tab } from "./tabs";

export async function fetchDashboard(tab: Tab, filters: FilterQuery, signal?: AbortSignal): Promise<Dashboard> {
  const res = await fetch("/api/dashboard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tab, filters }),
    credentials: "same-origin",
    signal,
  });
  if (res.status === 401) {
    // Session expired: a full load of the login page (it also clears the in-memory dashboard).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
    throw new Error("Not signed in");
  }
  if (!res.ok) throw new Error(`Could not load data (HTTP ${res.status})`);
  return res.json() as Promise<Dashboard>;
}

/** Stable cache key for a tab + filters (fields in a fixed order, empty ones dropped). */
export function bundleKey(tab: Tab, filters: FilterQuery) {
  const f = Object.entries(filters)
    .filter(([, v]) => v)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${tab}|${JSON.stringify(f)}`;
}
