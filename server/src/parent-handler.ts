// LabBuddy — Parent dashboard endpoint handler (Supabase-backed auth)
//
// Auth (signup/login/password) is handled client-side via supabase-js.
// This file only exposes parent-scoped resources that need server logic:
// account summary, profile update, account deletion, children, controls,
// activity, screen time, notifications.

import { Router, type Response } from "express";
import { z } from "zod";
import { requireParentAuth, type AuthRequest } from "./auth-middleware.js";
import {
  getParentById,
  updateParentProfile,
  deleteParent,
  createChildProfile,
  getChildProfile,
  getChildrenByParent,
  updateChildProfile,
  deleteChildProfile,
  getControls,
  upsertControls,
  getActivityLog,
  getScreenTime,
  getScreenTimeRange,
  getNotifications,
  markNotificationRead,
  markAllRead,
} from "./repositories/parent-repo.js";
import { getTierLimits } from "./tier-limits.js";
import { getDb } from "./db.js";
import type { ChildProfile, ParentAccount } from "../../shared/types.js";

export const parentRouter: Router = Router();

// ---------- helpers ----------

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Strip never-public fields (passwordHash) before sending over the wire. */
function publicParent(p: ParentAccount | undefined) {
  if (!p) return undefined;
  const { passwordHash: _ph, ...rest } = p;
  return rest;
}

async function ensureChildOwnedBy(
  childId: string,
  parentId: string,
  res: Response,
): Promise<ChildProfile | undefined> {
  const child = await getChildProfile(childId);
  if (!child) {
    res.status(404).json({ error: "Child not found" });
    return undefined;
  }
  if (child.parentId !== parentId) {
    res.status(403).json({ error: "Forbidden" });
    return undefined;
  }
  return child;
}

// ---------- Identity ----------

parentRouter.get("/me", requireParentAuth, async (req: AuthRequest, res: Response) => {
  const parent = await getParentById(req.parentId!);
  if (!parent) {
    res.status(404).json({ error: "Parent not found" });
    return;
  }
  const children = await getChildrenByParent(parent.id);
  res.json({ parent: publicParent(parent), children });
});

/**
 * GET /me/account-summary
 * One-shot fetch for the settings page.
 */
parentRouter.get(
  "/me/account-summary",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const parent = await getParentById(req.parentId!);
    if (!parent) {
      res.status(404).json({ error: "Parent not found" });
      return;
    }
    const children = await getChildrenByParent(parent.id);
    res.json({
      parent: publicParent(parent),
      children,
      subscription: {
        tier: parent.subscriptionTier,
        status: parent.subscriptionStatus,
        trialEndsAt: parent.trialEndsAt ?? null,
        limits: getTierLimits(parent.subscriptionTier),
        childrenCount: children.length,
      },
    });
  },
);

/**
 * PUT /me — update name and/or email.
 * Password changes are done client-side via supabase.auth.updateUser({ password }).
 */
const UpdateProfileSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    email: z.string().email().optional(),
  })
  .refine((d) => d.name !== undefined || d.email !== undefined, {
    message: "At least one of name or email is required",
  });

parentRouter.put("/me", requireParentAuth, async (req: AuthRequest, res: Response) => {
  const parsed = UpdateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.format() });
    return;
  }
  const result = await updateParentProfile(req.parentId!, parsed.data);
  if (!result.ok) {
    if (result.reason === "email_taken") {
      res.status(409).json({ error: "That email is already in use" });
    } else {
      res.status(404).json({ error: "Parent not found" });
    }
    return;
  }
  res.json({ parent: publicParent(result.parent) });
});

/**
 * DELETE /me — hard delete the account and all dependent data.
 *
 * Requires `confirm: "DELETE"` in the body. We rely on the bearer token
 * (already verified) as the auth challenge — Supabase requires reauth on
 * the client side before producing a still-fresh token for sensitive ops.
 */
const DeleteAccountSchema = z.object({
  confirm: z.literal("DELETE"),
});

parentRouter.delete(
  "/me",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const parsed = DeleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request — body must include confirm:'DELETE'",
        details: parsed.error.format(),
      });
      return;
    }
    const result = await deleteParent(req.parentId!);
    if (!result.deleted) {
      res.status(500).json({ error: "Failed to delete account" });
      return;
    }
    res.json({ ok: true, sweptRows: result.sweptRows });
  },
);

// ---------- Child profiles ----------

const CreateChildSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(0).max(25),
  gradeLevel: z.number().int().min(0).max(20).optional(),
  avatar: z.string().optional(),
  interests: z.array(z.string()).optional(),
});

parentRouter.post(
  "/children",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const parsed = CreateChildSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.format() });
      return;
    }
    const child = await createChildProfile(req.parentId!, parsed.data);
    await upsertControls({
      childId: child.id,
      dailyScreenTimeMinutes: undefined,
      blockedCategories: [],
      blockedKeywords: [],
      requireApprovalForYellow: false,
      notificationsEnabled: true,
    });
    res.status(201).json({ child });
  },
);

parentRouter.get(
  "/children",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const children = await getChildrenByParent(req.parentId!);
    res.json({ children });
  },
);

const UpdateChildSchema = z.object({
  name: z.string().min(1).optional(),
  age: z.number().int().min(0).max(25).optional(),
  gradeLevel: z.number().int().min(0).max(20).optional().nullable(),
  avatar: z.string().optional().nullable(),
  interests: z.array(z.string()).optional(),
});

parentRouter.patch(
  "/children/:childId",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const childId = req.params.childId;
    if (!(await ensureChildOwnedBy(childId, req.parentId!, res))) return;

    const parsed = UpdateChildSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.format() });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.age !== undefined) updates.age = parsed.data.age;
    if (parsed.data.gradeLevel !== undefined)
      updates.gradeLevel = parsed.data.gradeLevel ?? undefined;
    if (parsed.data.avatar !== undefined)
      updates.avatar = parsed.data.avatar ?? undefined;
    if (parsed.data.interests !== undefined)
      updates.interests = parsed.data.interests;

    const updated = await updateChildProfile(childId, updates);
    res.json({ child: updated });
  },
);

parentRouter.delete(
  "/children/:childId",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const childId = req.params.childId;
    if (!(await ensureChildOwnedBy(childId, req.parentId!, res))) return;
    const ok = await deleteChildProfile(childId);
    res.json({ deleted: ok });
  },
);

// ---------- Parental controls ----------

parentRouter.get(
  "/children/:childId/controls",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const childId = req.params.childId;
    if (!(await ensureChildOwnedBy(childId, req.parentId!, res))) return;
    const controls =
      (await getControls(childId)) ??
      (await upsertControls({
        childId,
        dailyScreenTimeMinutes: undefined,
        blockedCategories: [],
        blockedKeywords: [],
        requireApprovalForYellow: false,
        notificationsEnabled: true,
      }));
    res.json({ controls });
  },
);

const ControlsSchema = z.object({
  dailyScreenTimeMinutes: z.number().int().min(0).optional().nullable(),
  blockedCategories: z.array(z.string()).optional(),
  blockedKeywords: z.array(z.string()).optional(),
  requireApprovalForYellow: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
});

parentRouter.put(
  "/children/:childId/controls",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const childId = req.params.childId;
    if (!(await ensureChildOwnedBy(childId, req.parentId!, res))) return;

    const parsed = ControlsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.format() });
      return;
    }

    const existing = await getControls(childId);
    const next = await upsertControls({
      childId,
      dailyScreenTimeMinutes:
        parsed.data.dailyScreenTimeMinutes !== undefined
          ? parsed.data.dailyScreenTimeMinutes ?? undefined
          : existing?.dailyScreenTimeMinutes,
      blockedCategories:
        parsed.data.blockedCategories ?? existing?.blockedCategories ?? [],
      blockedKeywords:
        parsed.data.blockedKeywords ?? existing?.blockedKeywords ?? [],
      requireApprovalForYellow:
        parsed.data.requireApprovalForYellow ??
        existing?.requireApprovalForYellow ??
        false,
      notificationsEnabled:
        parsed.data.notificationsEnabled ?? existing?.notificationsEnabled ?? true,
    });

    res.json({ controls: next });
  },
);

// ---------- Activity & screen time ----------

parentRouter.get(
  "/children/:childId/activity",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const childId = req.params.childId;
    if (!(await ensureChildOwnedBy(childId, req.parentId!, res))) return;

    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1),
      500,
    );
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const activity = await getActivityLog(childId, limit, offset);
    res.json({ activity });
  },
);

parentRouter.get(
  "/children/:childId/screen-time",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const childId = req.params.childId;
    if (!(await ensureChildOwnedBy(childId, req.parentId!, res))) return;

    const days = Math.min(
      Math.max(parseInt(String(req.query.days ?? "7"), 10) || 7, 1),
      365,
    );
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - (days - 1));
    const usage = await getScreenTimeRange(childId, formatDate(start), formatDate(today));
    res.json({ usage });
  },
);

parentRouter.get(
  "/children/:childId/summary",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const childId = req.params.childId;
    if (!(await ensureChildOwnedBy(childId, req.parentId!, res))) return;

    // Aggregates still live in SQLite (gamification, notebook).
    const db = getDb();

    const xpRow = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events WHERE child_id = ?")
      .get(childId) as { total: number };
    const totalXP = Number(xpRow.total) || 0;

    const streakRow = db
      .prepare("SELECT current_streak FROM streaks WHERE child_id = ?")
      .get(childId) as { current_streak: number } | undefined;
    const streak = streakRow?.current_streak ?? 0;

    const expRow = db
      .prepare(
        "SELECT COUNT(*) AS count FROM xp_events WHERE child_id = ? AND type = 'experiment_completed'",
      )
      .get(childId) as { count: number };
    const totalExperiments = Number(expRow.count) || 0;

    const notebookRow = db
      .prepare("SELECT COUNT(*) AS count FROM notebook_entries WHERE child_id = ?")
      .get(childId) as { count: number };
    const totalNotebookEntries = Number(notebookRow.count) || 0;

    const today = new Date();
    const weekStart = new Date();
    weekStart.setDate(today.getDate() - 6);
    const startDate = formatDate(weekStart);
    const endDate = formatDate(today);

    // Screen-time lives on Supabase now.
    const weekUsage = await getScreenTimeRange(childId, startDate, endDate);
    const totalMinutesThisWeek = weekUsage.reduce((s, u) => s + u.minutesUsed, 0);
    const todayUsage = await getScreenTime(childId, formatDate(today));
    const todayMinutesUsed = todayUsage?.minutesUsed ?? 0;

    const controls = await getControls(childId);
    const dailyLimit = controls?.dailyScreenTimeMinutes;

    res.json({
      summary: {
        totalXP,
        streak,
        totalExperiments,
        totalNotebookEntries,
        totalMinutesThisWeek,
        todayMinutesUsed,
        dailyLimit,
      },
    });
  },
);

// ---------- Notifications ----------

parentRouter.get(
  "/notifications",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const unreadOnly = String(req.query.unreadOnly ?? "false") === "true";
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1),
      500,
    );
    const notifications = await getNotifications(req.parentId!, unreadOnly, limit);
    res.json({ notifications });
  },
);

parentRouter.patch(
  "/notifications/:id/read",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    await markNotificationRead(req.params.id);
    res.json({ ok: true });
  },
);

parentRouter.post(
  "/notifications/read-all",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    await markAllRead(req.parentId!);
    res.json({ ok: true });
  },
);
