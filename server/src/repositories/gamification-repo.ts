// LabBuddy — Gamification repository (SQLite-backed)
// XP events, streaks, and earned badges.

import { randomUUID } from "node:crypto";
import { getDb } from "../db.js";
import type {
  XPEvent,
  XPEventType,
  XPStats,
  Streak,
  EarnedBadge,
} from "../../../shared/types.js";

// ---------- date helpers ----------

/** Format a Date as YYYY-MM-DD in local time. */
function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Difference in whole days between two YYYY-MM-DD strings (b - a). */
function dayDiff(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// ---------- XP ----------

function rowToXPEvent(row: {
  id: string;
  child_id: string;
  type: string;
  amount: number;
  metadata: string | null;
  created_at: number;
}): XPEvent {
  return {
    id: row.id,
    childId: row.child_id,
    type: row.type as XPEventType,
    amount: row.amount,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, string | number>) : undefined,
    createdAt: row.created_at,
  };
}

export function awardXP(
  childId: string,
  type: XPEventType,
  amount: number,
  metadata?: Record<string, string | number>,
): XPEvent {
  const db = getDb();
  const id = randomUUID();
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO xp_events (id, child_id, type, amount, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, childId, type, amount, metadata ? JSON.stringify(metadata) : null, createdAt);

  return {
    id,
    childId,
    type,
    amount,
    metadata,
    createdAt,
  };
}

export function getXPStats(childId: string): XPStats {
  const db = getDb();
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events WHERE child_id = ?")
    .get(childId) as { total: number };

  const totalXP = Number(row.total) || 0;

  // level = floor(sqrt(totalXP / 50)) + 1
  const level = Math.floor(Math.sqrt(totalXP / 50)) + 1;
  // XP required to reach `level`:
  const previousLevelXP = Math.pow(level - 1, 2) * 50;
  // XP required to reach the next level:
  const nextLevelXP = Math.pow(level, 2) * 50;
  const xpToNextLevel = Math.max(0, nextLevelXP - totalXP);
  const span = nextLevelXP - previousLevelXP;
  const progressToNextLevel = span > 0 ? (totalXP - previousLevelXP) / span : 0;

  return {
    totalXP,
    level,
    xpToNextLevel,
    progressToNextLevel: Math.max(0, Math.min(1, progressToNextLevel)),
  };
}

export function getRecentXPEvents(childId: string, limit = 20): XPEvent[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, child_id, type, amount, metadata, created_at
       FROM xp_events
       WHERE child_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(childId, limit) as Array<{
    id: string;
    child_id: string;
    type: string;
    amount: number;
    metadata: string | null;
    created_at: number;
  }>;

  return rows.map(rowToXPEvent);
}

// ---------- Streaks ----------

function rowToStreak(row: {
  child_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string;
  streak_frozen: number;
}): Streak {
  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActiveDate: row.last_active_date,
    streakFrozen: row.streak_frozen === 1,
  };
}

export function getStreak(childId: string): Streak {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT child_id, current_streak, longest_streak, last_active_date, streak_frozen
       FROM streaks WHERE child_id = ?`,
    )
    .get(childId) as
    | {
        child_id: string;
        current_streak: number;
        longest_streak: number;
        last_active_date: string;
        streak_frozen: number;
      }
    | undefined;

  if (!row) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: "",
      streakFrozen: false,
    };
  }
  return rowToStreak(row);
}

/**
 * Called whenever the child is "active" today.
 * Compares last_active_date to today:
 *   - same day   -> no-op
 *   - yesterday  -> increment current streak
 *   - older      -> reset to 1 (unless streakFrozen)
 *   - no record  -> create with current_streak = 1
 */
export function updateStreak(childId: string): Streak {
  const db = getDb();
  const today = formatDate(new Date());
  const now = Date.now();

  const existing = db
    .prepare(
      `SELECT child_id, current_streak, longest_streak, last_active_date, streak_frozen
       FROM streaks WHERE child_id = ?`,
    )
    .get(childId) as
    | {
        child_id: string;
        current_streak: number;
        longest_streak: number;
        last_active_date: string;
        streak_frozen: number;
      }
    | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO streaks (child_id, current_streak, longest_streak, last_active_date, streak_frozen, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(childId, 1, 1, today, 0, now);
    return {
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: today,
      streakFrozen: false,
    };
  }

  const frozen = existing.streak_frozen === 1;

  // Same day — no change
  if (existing.last_active_date === today) {
    return rowToStreak(existing);
  }

  const diff = dayDiff(existing.last_active_date, today);
  let newCurrent = existing.current_streak;

  if (diff === 1) {
    newCurrent = existing.current_streak + 1;
  } else if (diff > 1) {
    newCurrent = frozen ? existing.current_streak : 1;
  } else {
    // diff <= 0 (date in the future / clock skew) — treat as no-op
    newCurrent = existing.current_streak;
  }

  const newLongest = Math.max(existing.longest_streak, newCurrent);

  db.prepare(
    `UPDATE streaks
     SET current_streak = ?, longest_streak = ?, last_active_date = ?, updated_at = ?
     WHERE child_id = ?`,
  ).run(newCurrent, newLongest, today, now, childId);

  return {
    currentStreak: newCurrent,
    longestStreak: newLongest,
    lastActiveDate: today,
    streakFrozen: frozen,
  };
}

export function freezeStreak(childId: string, frozen: boolean): void {
  const db = getDb();
  const now = Date.now();
  const existing = db
    .prepare("SELECT child_id FROM streaks WHERE child_id = ?")
    .get(childId) as { child_id: string } | undefined;

  if (!existing) {
    // Create a baseline record so the freeze flag has somewhere to live.
    db.prepare(
      `INSERT INTO streaks (child_id, current_streak, longest_streak, last_active_date, streak_frozen, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(childId, 0, 0, formatDate(new Date()), frozen ? 1 : 0, now);
    return;
  }

  db.prepare(
    `UPDATE streaks SET streak_frozen = ?, updated_at = ? WHERE child_id = ?`,
  ).run(frozen ? 1 : 0, now, childId);
}

// ---------- Badges ----------

export function getEarnedBadges(childId: string): EarnedBadge[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT badge_id, child_id, earned_at, xp_awarded
       FROM earned_badges
       WHERE child_id = ?
       ORDER BY earned_at DESC`,
    )
    .all(childId) as Array<{
    badge_id: string;
    child_id: string;
    earned_at: number;
    xp_awarded: number;
  }>;

  return rows.map((r) => ({
    badgeId: r.badge_id,
    childId: r.child_id,
    earnedAt: r.earned_at,
    xpAwarded: r.xp_awarded,
  }));
}

/** Award a badge. Returns null if the badge was already earned. */
export function awardBadge(
  childId: string,
  badgeId: string,
  xpReward: number,
): EarnedBadge | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT badge_id FROM earned_badges WHERE badge_id = ? AND child_id = ?")
    .get(badgeId, childId) as { badge_id: string } | undefined;

  if (existing) return null;

  const earnedAt = Date.now();
  db.prepare(
    `INSERT INTO earned_badges (badge_id, child_id, earned_at, xp_awarded)
     VALUES (?, ?, ?, ?)`,
  ).run(badgeId, childId, earnedAt, xpReward);

  return {
    badgeId,
    childId,
    earnedAt,
    xpAwarded: xpReward,
  };
}
