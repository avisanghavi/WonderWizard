// LabBuddy — Authentication middleware (Supabase-backed)
//
// Verifies the Supabase access token sent in the Authorization: Bearer header.
// requireParentAuth blocks the request when the token is missing/invalid.
// optionalParentAuth populates req.parentId when present but never blocks.

import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./types-express.js";
import { verifyAccessToken } from "./supabase.js";

export type { AuthRequest } from "./types-express.js";

function extractToken(req: AuthRequest): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

export async function requireParentAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }
  const parentId = await verifyAccessToken(token);
  if (!parentId) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.parentId = parentId;
  next();
}

export async function optionalParentAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractToken(req);
  if (token) {
    const parentId = await verifyAccessToken(token);
    if (parentId) req.parentId = parentId;
  }
  next();
}
