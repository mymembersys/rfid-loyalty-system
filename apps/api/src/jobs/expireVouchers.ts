import { query } from "../db/client";

/**
 * Flip pending vouchers whose expires_at is in the past to status='expired'.
 * Idempotent — only matches rows still in 'pending'.
 */
export async function expireOverdueVouchers(): Promise<number> {
  const r = await query(
    `UPDATE redemptions
        SET status = 'expired'
      WHERE status = 'pending'
        AND expires_at < now()
      RETURNING id`
  );
  return r.rowCount ?? 0;
}

let timer: NodeJS.Timeout | null = null;

export function startVoucherExpiryJob(intervalMinutes = 5): void {
  if (timer) return;
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;

  const tick = async () => {
    try {
      const n = await expireOverdueVouchers();
      if (n > 0) {
        // eslint-disable-next-line no-console
        console.log(`[cron] voucher-expiry: marked ${n} voucher(s) as expired`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[cron] voucher-expiry failed", err);
    }
  };

  // Run once on boot, then on the interval
  void tick();
  timer = setInterval(tick, intervalMs);
}

export function stopVoucherExpiryJob(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
