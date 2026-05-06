import { Pool, PoolConfig, QueryResultRow } from "pg";
import { env } from "../config/env";

const isProd       = env.nodeEnv === "production";
const useSupabase  = /supabase\.com|supabase\.co/i.test(env.databaseUrl);

const config: PoolConfig = {
  connectionString: env.databaseUrl,
  // Serverless deploys want very small pools (each invocation gets its own).
  // Local dev keeps the original 10.
  max: isProd ? 1 : 10,
  idleTimeoutMillis: isProd ? 10_000 : 30_000,
  // Supabase requires SSL. The pooler doesn't ship a CA chain we can verify
  // out-of-the-box from a serverless function, so we accept the cert.
  ssl: useSupabase ? { rejectUnauthorized: false } : undefined,
  // Vercel function timeout is 10s on Hobby; fail fast on stalls so the
  // request returns an error rather than dying silently at the platform edge.
  ...(isProd ? {
    statement_timeout:        8_000,
    query_timeout:            8_000,
    connectionTimeoutMillis:  6_000,
  } : {}),
};

export const pool = new Pool(config);

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected PG client error", err);
});

export async function query<T extends QueryResultRow = any>(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  if (env.nodeEnv === "development") {
    // eslint-disable-next-line no-console
    console.log(`[db] ${Date.now() - start}ms ${text.split("\n")[0].slice(0, 80)}`);
  }
  return res;
}
