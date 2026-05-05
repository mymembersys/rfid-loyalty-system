import { app } from "./app";
import { env } from "./config/env";
import { startVoucherExpiryJob } from "./jobs/expireVouchers";
import { bootstrapDb } from "./db/bootstrap";

async function main() {
  try {
    await bootstrapDb();
    // eslint-disable-next-line no-console
    console.log("[db] bootstrap migrations applied");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[db] bootstrap failed", err);
    process.exit(1);
  }

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${env.port} (${env.nodeEnv})`);

    // On Vercel the in-process setInterval would die between invocations;
    // /api/cron/expire-vouchers handles it via Vercel Cron instead.
    if (!process.env.VERCEL) {
      startVoucherExpiryJob(env.voucherExpiryCronMinutes);
      // eslint-disable-next-line no-console
      console.log(`[cron] voucher-expiry job started (every ${env.voucherExpiryCronMinutes} min)`);
    }
  });
}

main();
