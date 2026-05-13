// LabBuddy — Gamification endpoint handler
// Handles XP awarding, streak check-ins, and badge auto-awarding.

import { Router, type Request, type Response } from "express";
import { getDb } from "./db.js";
import { BADGE_CATALOG } from "./badge-catalog.js";
import {
  awardXP,
  getXPStats,
  getRecentXPEvents,
  updateStreak,
  getStreak,
  getEarnedBadges,
  awardBadge,
} from "./repositories/gamification-repo.js";
import type {
  Badge,
  EarnedBadge,
  Streak,
  XPEvent,
  XPEventType,
  XPStats,
} from "../../shared/types.js";

// ---------- XP amounts per event type ----------

const XP_AMOUNTS: Record<XPEventType, number> = {
  message_sent: 2,
  experiment_designed: 10,
  experiment_started: 15,
  step_completed: 5,
  experiment_completed: 50,
  notebook_entry_created: 25,
  reflection_answered: 10,
  syllabus_topic_explored: 20,
  streak_day: 5,
  badge_earned: 0, // variable — overridden per badge
  // Curiosity-specific. Wrong guesses earn MORE than correct ones —
  // we reward the act of committing to a hypothesis, not just being right.
  prediction_made: 8,
  prediction_correct: 12,
  prediction_surprised: 20,
  mystery_explored: 15,
  tangent_followed: 10,
};

// ---------- criteria helpers ----------

function countXPEvents(childId: string, type: XPEventType): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM xp_events WHERE child_id = ? AND type = ?")
    .get(childId, type) as { c: number };
  return Number(row.c) || 0;
}

function countExperimentsInCategory(childId: string, category: string): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT metadata FROM xp_events
       WHERE child_id = ? AND type = 'experiment_completed'`,
    )
    .all(childId) as Array<{ metadata: string | null }>;

  let n = 0;
  for (const r of rows) {
    if (!r.metadata) continue;
    try {
      const meta = JSON.parse(r.metadata) as Record<string, string | number>;
      const cat = typeof meta.category === "string" ? meta.category.toLowerCase() : "";
      if (cat === category.toLowerCase()) n += 1;
    } catch {
      // ignore malformed metadata
    }
  }
  return n;
}

function countDistinctCategoriesExplored(childId: string): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT metadata FROM xp_events
       WHERE child_id = ? AND type = 'experiment_completed'`,
    )
    .all(childId) as Array<{ metadata: string | null }>;

  const cats = new Set<string>();
  for (const r of rows) {
    if (!r.metadata) continue;
    try {
      const meta = JSON.parse(r.metadata) as Record<string, string | number>;
      const cat = typeof meta.category === "string" ? meta.category.toLowerCase() : "";
      if (cat) cats.add(cat);
    } catch {
      // ignore
    }
  }
  return cats.size;
}

/** Return true if the child currently meets the badge's criteria. */
function meetsCriteria(childId: string, badge: Badge): boolean {
  const { type, threshold } = badge.criteria;

  switch (type) {
    case "messages_sent":
      return countXPEvents(childId, "message_sent") >= threshold;

    case "experiments_designed":
      return countXPEvents(childId, "experiment_designed") >= threshold;

    case "experiments_started":
      return countXPEvents(childId, "experiment_started") >= threshold;

    case "experiments_completed":
      return countXPEvents(childId, "experiment_completed") >= threshold;

    case "notebook_entries_created":
      return countXPEvents(childId, "notebook_entry_created") >= threshold;

    case "reflections_answered":
      return countXPEvents(childId, "reflection_answered") >= threshold;

    case "syllabus_topics_explored":
      return countXPEvents(childId, "syllabus_topic_explored") >= threshold;

    case "streak_days":
      return getStreak(childId).currentStreak >= threshold;

    case "categories_explored":
      return countDistinctCategoriesExplored(childId) >= threshold;

    case "experiments_completed_chemistry":
      return countExperimentsInCategory(childId, "chemistry") >= threshold;

    case "experiments_completed_math":
      return countExperimentsInCategory(childId, "math") >= threshold;

    default:
      return false;
  }
}

// ---------- core award + check logic (exported for internal use) ----------

export interface AwardAndCheckResult {
  event: XPEvent;
  newBadges: EarnedBadge[];
  xpStats: XPStats;
  streak: Streak;
}

/**
 * Award XP for an event, bump the streak, and auto-check any newly-eligible
 * badges. This is the shared path used by both the HTTP endpoint and
 * internal callers like the chat handler.
 */
export function awardAndCheck(
  childId: string,
  type: XPEventType,
  metadata?: Record<string, string | number>,
): AwardAndCheckResult {
  // 1. Award base XP for the event.
  const amount = XP_AMOUNTS[type] ?? 0;
  const event = awardXP(childId, type, amount, metadata);

  // 2. Bump the streak for today's activity.
  const streak = updateStreak(childId);

  // 3. Check every badge in the catalog.
  const alreadyEarned = new Set(getEarnedBadges(childId).map((b) => b.badgeId));
  const newBadges: EarnedBadge[] = [];

  for (const badge of BADGE_CATALOG) {
    if (alreadyEarned.has(badge.id)) continue;
    if (!meetsCriteria(childId, badge)) continue;

    const earned = awardBadge(childId, badge.id, badge.xpReward);
    if (!earned) continue;

    // Record the bonus XP as a separate xp_event so stats add up cleanly.
    if (badge.xpReward > 0) {
      awardXP(childId, "badge_earned", badge.xpReward, { badgeId: badge.id });
    }
    newBadges.push(earned);
    alreadyEarned.add(badge.id);
  }

  // 4. Recompute stats after all the bonus XP has been logged.
  const xpStats = getXPStats(childId);

  return { event, newBadges, xpStats, streak };
}

// ---------- router ----------

export const gamificationRouter = Router();

/** GET /api/gamification/:childId/stats */
gamificationRouter.get("/:childId/stats", (req: Request, res: Response) => {
  try {
    const childId = req.params.childId;
    if (!childId) {
      res.status(400).json({ error: "childId is required" });
      return;
    }

    const xp = getXPStats(childId);
    const streak = getStreak(childId);
    const badges = getEarnedBadges(childId);
    const recentEvents = getRecentXPEvents(childId, 20);

    res.json({ xp, streak, badges, recentEvents });
  } catch (err) {
    console.error("gamification stats error:", err);
    res.status(500).json({ error: "Failed to load gamification stats" });
  }
});

/** GET /api/gamification/badges — the whole catalog */
gamificationRouter.get("/badges", (_req: Request, res: Response) => {
  res.json({ catalog: BADGE_CATALOG });
});

/** POST /api/gamification/:childId/xp */
gamificationRouter.post("/:childId/xp", (req: Request, res: Response) => {
  try {
    const childId = req.params.childId;
    if (!childId) {
      res.status(400).json({ error: "childId is required" });
      return;
    }

    const body = req.body as {
      type?: XPEventType;
      metadata?: Record<string, string | number>;
    };

    if (!body.type || !(body.type in XP_AMOUNTS)) {
      res.status(400).json({ error: "Valid XP event 'type' is required" });
      return;
    }

    const result = awardAndCheck(childId, body.type, body.metadata);
    res.json(result);
  } catch (err) {
    console.error("gamification xp error:", err);
    res.status(500).json({ error: "Failed to award XP" });
  }
});

/** POST /api/gamification/:childId/checkin */
gamificationRouter.post("/:childId/checkin", (req: Request, res: Response) => {
  try {
    const childId = req.params.childId;
    if (!childId) {
      res.status(400).json({ error: "childId is required" });
      return;
    }
    const streak = updateStreak(childId);
    res.json(streak);
  } catch (err) {
    console.error("gamification checkin error:", err);
    res.status(500).json({ error: "Failed to update streak" });
  }
});

/**
 * POST /api/gamification/:childId/prediction
 * Body: { predictionId, choice, experimentTitle }
 *
 * Records a kid's prediction. Awards prediction_made XP immediately. The
 * frontend later calls /reveal with the outcome to award correctness XP.
 *
 * The whole point: investing in a guess is its own reward. We track it,
 * we celebrate it, we never penalize a wrong answer.
 */
gamificationRouter.post(
  "/:childId/prediction",
  (req: Request, res: Response) => {
    try {
      const childId = req.params.childId;
      const body = req.body as {
        predictionId?: string;
        choice?: string;
        experimentTitle?: string;
      };
      if (!childId || !body.predictionId || !body.choice) {
        res
          .status(400)
          .json({ error: "childId, predictionId, and choice required" });
        return;
      }
      const result = awardAndCheck(childId, "prediction_made", {
        predictionId: body.predictionId,
        choice: body.choice,
        experimentTitle: body.experimentTitle ?? "",
      });
      res.json({
        ...result,
        message:
          "Locked in! Guessing is half the fun — wrong or right, you just made science real.",
      });
    } catch (err) {
      console.error("gamification prediction error:", err);
      res.status(500).json({ error: "Failed to record prediction" });
    }
  }
);

/**
 * POST /api/gamification/:childId/prediction/reveal
 * Body: { predictionId, theirChoice, correctChoice, wasCorrect }
 *
 * The reveal moment. Wrong guesses get the BIGGEST XP because that's
 * where real learning happens. Correct guesses get a smaller bump plus
 * the satisfaction of being right.
 */
gamificationRouter.post(
  "/:childId/prediction/reveal",
  (req: Request, res: Response) => {
    try {
      const childId = req.params.childId;
      const body = req.body as {
        predictionId?: string;
        wasCorrect?: boolean;
        theirChoice?: string;
        correctChoice?: string;
      };
      if (!childId || !body.predictionId || typeof body.wasCorrect !== "boolean") {
        res.status(400).json({ error: "childId, predictionId, wasCorrect required" });
        return;
      }
      const type: XPEventType = body.wasCorrect
        ? "prediction_correct"
        : "prediction_surprised";
      const result = awardAndCheck(childId, type, {
        predictionId: body.predictionId,
        theirChoice: body.theirChoice ?? "",
        correctChoice: body.correctChoice ?? "",
      });
      res.json({
        ...result,
        celebration: body.wasCorrect
          ? "Nailed it! Your intuition is on point."
          : "Plot twist! Wrong guesses are where the BEST learning happens. +20 Curiosity Points.",
      });
    } catch (err) {
      console.error("gamification prediction reveal error:", err);
      res.status(500).json({ error: "Failed to record reveal" });
    }
  }
);
