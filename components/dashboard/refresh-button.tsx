"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type RefreshState = { running: boolean; partial?: boolean; startedAt: string | null; lastError: string | null; log: string[] };

/** Give a new run this long to show up in the database before we call it failed to start. */
const START_GRACE_MS = 20_000;

/**
 * Runs an incremental refresh: new results sheets and the TR tabs are re-read, everything already
 * saved is kept. The run and its progress are stored in the database, so this follows it from there.
 * On success the page reloads with the new run; on failure the error is shown here, and each sheet's
 * own problem is listed in Health > Sources with its link.
 */
export function RefreshButton() {
  const [state, setState] = useState<RefreshState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A run paused at its time limit: nothing was saved, so the page keeps the last complete run.
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sawRunning = useRef(false);
  const startedAt = useRef(0);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const follow = useCallback(() => {
    stop();
    timer.current = setInterval(async () => {
      try {
        const res = await fetch("/api/refresh/status", { credentials: "same-origin" });
        if (res.status === 401) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login";
        }
        if (!res.ok) return;
        const s = (await res.json()) as RefreshState;
        setState(s);
        if (s.running) sawRunning.current = true;
        if (s.running) return;
        if (!sawRunning.current) {
          // The run has not been recorded yet; wait a little, then report that it never started.
          if (Date.now() - startedAt.current < START_GRACE_MS) return;
          stop();
          setError("the run did not start");
          return;
        }
        stop();
        if (s.partial) setNotice(s.lastError ?? "Paused at the time limit. Click Refresh data again to continue.");
        else if (s.lastError) setError(s.lastError);
        else window.location.reload();
      } catch {}
    }, 2000);
  }, [stop]);

  // Still running after a page reload: keep following it.
  useEffect(() => {
    let alive = true;
    fetch("/api/refresh/status", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<RefreshState>) : null))
      .then((s) => {
        if (!alive || !s) return;
        setState(s);
        if (s.partial && !s.running) setNotice(s.lastError);
        if (s.running) {
          sawRunning.current = true;
          follow();
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      stop();
    };
  }, [follow, stop]);

  async function start() {
    setError(null);
    setNotice(null);
    sawRunning.current = false;
    startedAt.current = Date.now();
    setStarting(true);
    follow();
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
        credentials: "same-origin",
      });
      if (res.status === 401) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
      }
      // 409 = a run is already in progress; the poll above follows it.
      if (!res.ok && res.status !== 409) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `HTTP ${res.status}`);
        stop();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the refresh");
      stop();
    } finally {
      setStarting(false);
    }
  }

  const running = starting || !!state?.running;
  const lastLine = state?.log.at(-1);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={start} disabled={running} className="bg-card">
        {running ? <Spinner /> : <RefreshCw />}
        {running ? "Refreshing…" : "Refresh data"}
      </Button>
      {running && lastLine && <span className="max-w-xs truncate text-xs text-muted-foreground">{lastLine}</span>}
      {notice && !running && (
        <span className="flex max-w-sm items-start gap-1 text-right text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {notice}
        </span>
      )}
      {error && (
        <span className="flex max-w-sm items-start gap-1 text-right text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          Refresh failed: {error}. Sheet errors are listed in Health → Sources.
        </span>
      )}
    </div>
  );
}
