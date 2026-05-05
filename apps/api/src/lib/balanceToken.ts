import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type BalancePayload = { mid: string; scope: "balance" };

type SignOpts = { expiresIn?: string | number };

/** Sign a token that lets the bearer fetch a member's stamp balance.
 *  Default TTL is short-lived (24h) for QR / phone-link flows. Pass a longer
 *  `expiresIn` (e.g. 5y) when burning the URL onto a physical NFC card. */
export function signBalanceToken(memberId: string, opts: SignOpts = {}): string {
  return jwt.sign(
    { mid: memberId, scope: "balance" } as BalancePayload,
    env.jwtSecret,
    { expiresIn: opts.expiresIn ?? env.balanceTokenTtl } as any
  );
}

/** Verify a balance token. Throws on invalid / expired / wrong-scope. */
export function verifyBalanceToken(token: string): BalancePayload {
  const decoded = jwt.verify(token, env.jwtSecret) as any;
  if (!decoded || decoded.scope !== "balance" || typeof decoded.mid !== "string") {
    throw new Error("Invalid balance token");
  }
  return decoded as BalancePayload;
}
