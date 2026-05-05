import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  if (err?.status && typeof err.status === "number") {
    return res.status(err.status).json({ error: err.message || "Error" });
  }
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
