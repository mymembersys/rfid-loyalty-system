// Vercel serverless entry — every request to the deployment is routed here
// by `vercel.json` and handled by the existing Express app.
//
// We bootstrap the schema on cold start (idempotent CREATE TABLE IF NOT EXISTS)
// so a fresh Supabase project becomes usable without a manual migration step.

import type { IncomingMessage, ServerResponse } from "http";
import { app } from "../src/app";
import { bootstrapDb } from "../src/db/bootstrap";

let bootstrapped: Promise<void> | null = null;

async function ensureBootstrapped() {
  if (!bootstrapped) {
    bootstrapped = bootstrapDb().catch((err) => {
      bootstrapped = null;            // allow a retry on the next invocation
      // eslint-disable-next-line no-console
      console.error("[db] bootstrap failed", err);
      throw err;
    });
  }
  return bootstrapped;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await ensureBootstrapped();
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Database not initialised", detail: err?.message }));
    return;
  }
  // Express is callable as (req, res); Vercel hands it a Node req/res pair.
  return (app as any)(req, res);
}
