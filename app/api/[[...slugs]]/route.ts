// Mounts the Elysia API (lib/server.ts) on every /api/* path.
import { api } from "@/lib/server";

export const GET = api.handle;
export const POST = api.handle;
