// LabBuddy — Subscription tier limit catalog
//
// Central source of truth for what each subscription tier unlocks. All feature
// gating (in tier-gate.ts and the billing handler) should read from here.

import type { SubscriptionTier, TierLimits } from "../../shared/types.js";

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    tier: "free",
    maxExperimentsPerDay: 3,
    maxChildProfiles: 1,
    syllabusUploads: false,
    diyGuides: false,
    labNotebook: false,
    parentDashboard: true, // basic
    prioritySupport: false,
  },
  family: {
    tier: "family",
    maxExperimentsPerDay: 999,
    maxChildProfiles: 3,
    syllabusUploads: true,
    diyGuides: true,
    labNotebook: true,
    parentDashboard: true,
    prioritySupport: false,
  },
  classroom: {
    tier: "classroom",
    maxExperimentsPerDay: 999,
    maxChildProfiles: 35,
    syllabusUploads: true,
    diyGuides: true,
    labNotebook: true,
    parentDashboard: true,
    prioritySupport: true,
  },
};

export function getTierLimits(tier: SubscriptionTier): TierLimits {
  return TIER_LIMITS[tier];
}
