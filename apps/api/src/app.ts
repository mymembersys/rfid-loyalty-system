import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { env } from "./config/env";
import { authRoutes } from "./routes/auth.routes";
import { userRoutes } from "./routes/users.routes";
import { memberRoutes } from "./routes/members.routes";
import { cardRoutes } from "./routes/cards.routes";
import { visitRoutes } from "./routes/visits.routes";
import { rewardRoutes } from "./routes/rewards.routes";
import { stampRuleRoutes } from "./routes/stampRules.routes";
import { redemptionRoutes } from "./routes/redemptions.routes";
import { branchRoutes } from "./routes/branches.routes";
import { serviceLineRoutes } from "./routes/serviceLines.routes";
import { reportRoutes } from "./routes/reports.routes";
import { settingsRoutes } from "./routes/settings.routes";
import { balanceRoutes } from "./routes/balance.routes";
import { cronRoutes } from "./routes/cron.routes";
import { isSupabaseStorageEnabled } from "./lib/storage";
import { errorHandler } from "./middleware/error";

export const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src":  ["'self'"],
        "style-src":   ["'self'", "'unsafe-inline'"],
        "img-src":     ["'self'", "data:", "https:"],   // allow Supabase Storage CDN
        "connect-src": ["'self'"],
        "font-src":    ["'self'", "data:"],
        "object-src":  ["'none'"],
        "base-uri":    ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'self'"],
      },
    },
  })
);
app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "rfid-loyalty-api", time: new Date().toISOString() });
});

// /uploads only exists when running on a writable filesystem (local dev).
// In serverless we use Supabase Storage, which serves files from its own CDN.
if (!isSupabaseStorageEnabled) {
  app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
}

// Static — bundled customer-facing assets (balance page script, etc.)
app.use(express.static(path.join(__dirname, "..", "public")));

// Public, customer-facing balance page
app.get("/balance/:token", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "balance.html"));
});

// API routes (v1)
app.use("/api/v1/auth",        authRoutes);
app.use("/api/v1/users",       userRoutes);
app.use("/api/v1/members",     memberRoutes);
app.use("/api/v1/cards",       cardRoutes);
app.use("/api/v1/visits",      visitRoutes);
app.use("/api/v1/rewards",     rewardRoutes);
app.use("/api/v1/stamp-rules", stampRuleRoutes);
app.use("/api/v1/redemptions", redemptionRoutes);
app.use("/api/v1/branches",    branchRoutes);
app.use("/api/v1/service-lines", serviceLineRoutes);
app.use("/api/v1/reports",     reportRoutes);
app.use("/api/v1/settings",    settingsRoutes);
app.use("/api/v1/balance",     balanceRoutes);

// Vercel Cron entry points
app.use("/api/cron",           cronRoutes);

app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);
