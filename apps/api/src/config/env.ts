import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigins: (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  databaseUrl: required("DATABASE_URL"),
  defaultStampCooldownMinutes: parseInt(process.env.DEFAULT_STAMP_COOLDOWN_MINUTES || "720", 10),
  voucherExpiryCronMinutes: parseInt(process.env.VOUCHER_EXPIRY_CRON_MINUTES || "5", 10),
  balanceTokenTtl: process.env.BALANCE_TOKEN_TTL || "24h",
  // Long-lived token written onto the physical NFC card. Default ~5 years.
  balanceNfcTokenTtl: process.env.BALANCE_NFC_TOKEN_TTL || "1825d",
  // Supabase Storage — when set, logo uploads go there instead of local disk
  // (required for serverless deploys; optional for local dev).
  supabaseUrl:        process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || "",
  supabaseLogoBucket: process.env.SUPABASE_LOGO_BUCKET || "logos",
  // Shared secret that Vercel Cron sends in the Authorization header
  cronSecret: process.env.CRON_SECRET || "",
};
