import fs from "fs";
import path from "path";
import { pool } from "../src/db/client";

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "src", "db", "schema.sql"), "utf8");
  // eslint-disable-next-line no-console
  console.log("[db:init] applying schema…");
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log("[db:init] schema applied successfully.");
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[db:init] failed:", err);
  process.exit(1);
});
