// LabBuddy — Feature gating helpers
//
// Call these from any handler that needs to check a feature flag or usage
// limit against the parent's subscription tier.

import { getDb } from "./db.js";
import { getParentById } from "./repositories/parent-repo.js";
import { TIER_LIMITS } from "./tier-limits.js";
import type { SubscriptionTier, TierLimits } from "../../shared/types.js";

export interface TierFeatureCheck {
  allowed: boolean;
  reason?: string;
  currentTier: SubscriptionTier;
}

export interface DailyLimitCheck {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Check whether a parent's current tier grants access to a boolean feature.
 * For numeric limits this returns `allowed: true` (use a dedicated counter
 * helper like `checkDailyExperimentLimit` for those).
 */
export async function requireTierFeature(
  parentId: string,
  feature: keyof TierLimits,
): Promise<TierFeatureCheck> {
  const parent = await getParentById(parentId);
  if (!parent) {
    return { allowed: false, reason: "Parent not found", currentTier: "free" };
  }
  const limits = TIER_LIMITS[parent.subscriptionTier];
  const value = limits[feature];

  if (typeof value === "boolean") {
    if (value) {
      return { allowed: true, currentTier: parent.subscriptionTier };
    }
    const upsell =
      parent.subscriptionTier === "free" ? "Family" : "Classroom";
    return {
      allowed: false,
      reason: `This feature requires a ${upsell} subscription`,
      currentTier: parent.subscriptionTier,
    };
  }

  // Numeric/string limit fields: allowed by default here.
  return { allowed: true, currentTier: parent.subscriptionTier };
}

/**
 * Count the number of `experiment_designed` XP events for a child in the
 * current UTC day and compare against the parent's tier daily limit.
 */
export async function checkDailyExperimentLimit(
  childId: string,
  parentId: string,
): Promise<DailyLimitCheck> {
  const parent = await getParentById(parentId);
  const tier: SubscriptionTier = parent?.subscriptionTier ?? "free";
  const limit = TIER_LIMITS[tier].maxExperimentsPerDay;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startMs = startOfDay.getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM xp_events
        WHERE child_id = ?
          AND type = 'experiment_designed'
          AND created_at >= ?
          AND created_at < ?`,
    )
    .get(childId, startMs, endMs) as { count: number } | undefined;

  const used = row?.count ?? 0;
  return {
    allowed: used < limit,
    used,
    limit,
  };
}
