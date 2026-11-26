// Mounts the Elysia API (lib/server.ts) on every /api/* path.
import { api } from "@/lib/server";

export const GET = api.handle;
export const POST = api.handle;

// A metrics run (POST /api/refresh) executes inside the request, so it needs the time.
export const maxDuration = 300;
