import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDashboard, getMe } from "@/lib/api";
import { DashboardApp } from "@/components/dashboard/app";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/**
 * The server renders the first view (Overview, default filters) so the page arrives with numbers;
 * after that the dashboard runs in the browser (components/dashboard/app.tsx): tabs and filters
 * load through POST /api/dashboard without reloading the page or touching the URL.
 */
async function Dashboard() {
  await connection(); // always read the latest run at request time
  const me = await getMe();
  if (!me) redirect("/login");
  const initial = await getDashboard("overview");
  if (!initial) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <Card className="rounded-lg">
          <CardContent className="text-sm text-muted-foreground">
            No metrics run found. Run <code className="font-mono">bun run refresh</code> to load data.
          </CardContent>
        </Card>
      </main>
    );
  }
  return <DashboardApp initial={initial} user={me.username} />;
}

function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-5" /> Loading metrics…
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}
