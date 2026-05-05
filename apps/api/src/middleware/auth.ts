import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { HttpError } from "./error";

export type AuthPayload = {
  sub: string;          // user id
  role: "admin" | "manager" | "frontdesk" | "auditor";
  branch_id?: string | null;
  email: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return next(new HttpError(401, "Missing bearer token"));
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    next(new HttpError(401, "Invalid token"));
  }
}

export function requireRole(...allowed: AuthPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new HttpError(401, "Not authenticated"));
    if (!allowed.includes(req.auth.role)) return next(new HttpError(403, "Forbidden"));
    next();
  };
}
