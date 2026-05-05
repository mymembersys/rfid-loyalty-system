import { Request } from "express";
import { query } from "./client";

type AuditOpts = {
  action: string;                          // e.g. 'visit.create', 'card.replace'
  entity_type?: string;                    // 'member' | 'card' | 'visit' | 'redemption'
  entity_id?: string | null;
  branch_id?: string | null;               // overrides req.auth.branch_id when present
  payload?: Record<string, any> | null;
};

function clientIp(req: Request): string | null {
  const fwd = req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * Best-effort write to audit_log. Never throws — a failed audit must not
 * roll back the parent business operation, but we log it so it's visible.
 */
export async function recordAudit(req: Request, opts: AuditOpts): Promise<void> {
  try {
    const userId   = req.auth?.sub ?? null;
    const branchId = opts.branch_id ?? req.auth?.branch_id ?? null;
    await query(
      `INSERT INTO audit_log (user_id, branch_id, action, entity_type, entity_id, payload, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        userId,
        branchId,
        opts.action,
        opts.entity_type ?? null,
        opts.entity_id ?? null,
        opts.payload ? JSON.stringify(opts.payload) : null,
        clientIp(req),
      ]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to record", opts.action, err);
  }
}
