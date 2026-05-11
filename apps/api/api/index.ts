// Vercel serverless entry — every request to the deployment is routed here
// by `vercel.json` and handled by the existing Express app.
//
// On a fresh Supabase project the bootstrap migrations (CREATE TABLE IF NOT
// EXISTS) need to run once. After that, set SKIP_BOOTSTRAP=true in Vercel env
// to skip the 6 idempotent round-trips on every cold-start instance — saves
// ~300–600 ms on the first request that hits a new function instance.

import type { IncomingMessage, ServerResponse } from "http";
import { app } from "../src/app";
import { bootstrapDb } from "../src/db/bootstrap";

const skipBootstrap = process.env.SKIP_BOOTSTRAP === "true" || process.env.SKIP_BOOTSTRAP === "1";
let bootstrapKicked = false;

function kickBootstrap() {
  if (skipBootstrap || bootstrapKicked) return;
  bootstrapKicked = true;
  // Fire-and-forget on the very first invocation per instance. Vercel keeps
  // the function alive until the event loop drains, so the write completes
  // even though we don't await it on the request path.
  bootstrapDb().catch((err) => {
    bootstrapKicked = false; // allow a retry on next invocation
    // eslint-disable-next-line no-console
    console.error("[db] bootstrap failed", err);
  });
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  kickBootstrap();
  // Express is callable as (req, res); Vercel hands it a Node req/res pair.
  return (app as any)(req, res);
}
