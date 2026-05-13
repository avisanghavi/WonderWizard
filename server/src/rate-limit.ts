// LabBuddy — Rate limiting middleware
//
// Generous limits — these protect against runaway loops, scrapers, and accidental
// infinite-retry bugs. They should never block a real kid using the app normally.
//
// Strategy: per-session (anonymous) or per-childId (signed in), whichever is higher
// signal. Falls back to IP if neither is present.

import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request, Response } from "express";

// ---------- key resolver ----------

/**
 * Build a stable identity key for rate limiting. Prefer childId (signed-in) →
 * sessionId (anonymous chat session) → IP (true fallback).
 *
 * Uses express-rate-limit's `ipKeyGenerator` for the IP fallback so it handles
 * IPv6 correctly (the v8 default rejects raw IPv6 addresses).
 */
function identityKey(req: Request): string {
  const body = (req.body ?? {}) as { childId?: unknown; sessionId?: unknown };
  if (typeof body.childId === "string" && body.childId.length > 0) {
    return `child:${body.childId}`;
  }
  if (typeof body.sessionId === "string" && body.sessionId.length > 0) {
    return `session:${body.sessionId}`;
  }
  // IP fallback — handle both Express Request shape and missing IP
  const ip = (req.ip ?? "unknown") as string;
  return `ip:${ipKeyGenerator(ip)}`;
}

// ---------- shared response shape ----------

const friendlyHandler: Options["handler"] = (_req: Request, res: Response) => {
  res.status(429).json({
    error: "rate_limited",
    message:
      "Whoa, slow down a little! 🌬️ LabBuddy needs a quick breather. Try again in a minute.",
  });
};

// ---------- limiters ----------

/**
 * Chat endpoint limiter — the most expensive endpoint (Claude tokens).
 * 60 messages / minute (burst protection), 600 messages / hour, 3000 / day.
 *
 * For context: a kid having a very engaged session might send ~20 messages/hour.
 * These limits are >30x normal usage — they only catch runaway loops or abuse.
 *
 * We apply both windows; whichever trips first wins.
 */
export const chatBurstLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 60, // 60 requests per minute (burst protection)
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: identityKey,
  handler: friendlyHandler,
  skip: (req) => req.method !== "POST", // don't limit GET sub-routes
});

export const chatHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 600, // 600 chat messages per hour per identity
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: identityKey,
  handler: friendlyHandler,
  skip: (req) => req.method !== "POST",
});

export const chatDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  limit: 3000, // 3000 messages per day per identity
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: identityKey,
  handler: friendlyHandler,
  skip: (req) => req.method !== "POST",
});

/**
 * Heavy-AI limiter for syllabus parsing + DIY guide generation.
 * These each cost 1-3 LLM calls with large outputs (SVGs).
 * 30 / hour, 100 / day per identity is plenty.
 */
export const heavyAiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: identityKey,
  handler: friendlyHandler,
});

export const heavyAiDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: identityKey,
  handler: friendlyHandler,
});

/**
 * Auth endpoint limiter — much tighter to slow down credential stuffing.
 * 10 attempts / 15 min per IP (we use IP here intentionally; signup/login
 * don't have a session yet).
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: "rate_limited",
      message:
        "Too many attempts. Please wait a few minutes and try again.",
    });
  },
  // explicit keyGenerator handles IPv6 correctly in v8
  keyGenerator: (req) => ipKeyGenerator((req.ip ?? "unknown") as string),
});

/**
 * General API limiter applied at the app level for everything else.
 * Very generous: 1000 requests / 15 min per identity.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: identityKey,
  handler: friendlyHandler,
  // Skip health checks
  skip: (req) => req.path === "/api/health",
});
