// LabBuddy — Parent dashboard repository (Supabase-backed)
//
// All parent-scoped tables live in Supabase Postgres now:
//   parent_profiles, child_profiles, parental_controls,
//   activity_log, screen_time_usage, notifications
//
// Tables that stay on SQLite (xp_events, earned_badges, streaks,
// notebook_entries) are still swept on account deletion via the SQLite
// helpers — deleteParent crosses both stores so COPPA hard-delete still works.

import { randomUUID } from "node:crypto";
import { supabase } from "../supabase.js";
import { getDb } from "../db.js";
import type {
  ParentAccount,
  ChildProfile,
  ParentalControls,
  ActivityLogEntry,
  ScreenTimeUsage,
  Notification,
  SubscriptionTier,
} from "../../../shared/types.js";

// ============================================================================
// Parent accounts (auth.users + parent_profiles)
// ============================================================================

interface ParentProfileRow {
  id: string;
  name: string;
  subscription_tier: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: number | null;
  created_at: number;
}

/**
 * Fetch the auth.users row + parent_profiles row and assemble a ParentAccount.
 * Email lives on auth.users; everything else on parent_profiles.
 */
async function assembleParent(id: string): Promise<ParentAccount | undefined> {
  const [userRes, profileRes] = await Promise.all([
    supabase.auth.admin.getUserById(id),
    supabase.from("parent_profiles").select("*").eq("id", id).maybeSingle(),
  ]);
  if (userRes.error || !userRes.data.user) return undefined;
  const profile = profileRes.data as ParentProfileRow | null;
  const email = userRes.data.user.email ?? "";
  return {
    id,
    email,
    name: profile?.name ?? "",
    // Supabase manages passwords — we never store hashes anymore.
    passwordHash: "",
    subscriptionTier: (profile?.subscription_tier ?? "free") as ParentAccount["subscriptionTier"],
    subscriptionStatus: (profile?.subscription_status ?? "trialing") as ParentAccount["subscriptionStatus"],
    stripeCustomerId: profile?.stripe_customer_id ?? undefined,
    stripeSubscriptionId: profile?.stripe_subscription_id ?? undefined,
    trialEndsAt: profile?.trial_ends_at ?? undefined,
    createdAt: profile?.created_at ?? Date.now(),
  };
}

export async function getParentById(id: string): Promise<ParentAccount | undefined> {
  return assembleParent(id);
}

export async function getParentByStripeCustomerId(
  stripeCustomerId: string,
): Promise<ParentAccount | undefined> {
  const { data } = await supabase
    .from("parent_profiles")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (!data) return undefined;
  return assembleParent((data as { id: string }).id);
}

export async function getParentByStripeSubscriptionId(
  stripeSubscriptionId: string,
): Promise<ParentAccount | undefined> {
  const { data } = await supabase
    .from("parent_profiles")
    .select("id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (!data) return undefined;
  return assembleParent((data as { id: string }).id);
}

/**
 * Update mutable profile fields (name, email). Email updates go through
 * Supabase Admin; name updates go to parent_profiles.
 */
export async function updateParentProfile(
  id: string,
  patch: { name?: string; email?: string },
): Promise<
  | { ok: true; parent: ParentAccount }
  | { ok: false; reason: "email_taken" | "not_found" }
> {
  const current = await getParentById(id);
  if (!current) return { ok: false, reason: "not_found" };

  // Email update via Supabase Admin (handles uniqueness atomically)
  if (typeof patch.email === "string" && patch.email.trim().length > 0) {
    const normalized = patch.email.trim().toLowerCase();
    if (normalized !== current.email) {
      const { error } = await supabase.auth.admin.updateUserById(id, {
        email: normalized,
      });
      if (error) {
        if (/already (registered|in use|exists)/i.test(error.message)) {
          return { ok: false, reason: "email_taken" };
        }
        throw error;
      }
    }
  }

  // Name update on parent_profiles
  if (typeof patch.name === "string" && patch.name.trim().length > 0) {
    const newName = patch.name.trim();
    if (newName !== current.name) {
      const { error } = await supabase
        .from("parent_profiles")
        .update({ name: newName })
        .eq("id", id);
      if (error) throw error;
    }
  }

  const updated = await getParentById(id);
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, parent: updated };
}

/**
 * Hard-delete a parent and all dependent data.
 *
 * Sweeps SQLite-resident kid-data tables for every child id owned by the
 * parent, then deletes the auth user (which cascades to Supabase tables
 * via ON DELETE CASCADE on parent_profiles + child_profiles, etc.).
 */
export async function deleteParent(
  id: string,
): Promise<{ deleted: boolean; sweptRows: number }> {
  // 1. Capture child IDs from Supabase before we delete the auth user.
  const { data: childRows } = await supabase
    .from("child_profiles")
    .select("id")
    .eq("parent_id", id);
  const childIds = (childRows as Array<{ id: string }> | null)?.map((r) => r.id) ?? [];

  // 2. Sweep SQLite-resident kid tables in a transaction.
  let swept = 0;
  if (childIds.length > 0) {
    const db = getDb();
    const placeholders = childIds.map(() => "?").join(",");
    const sqliteTables = [
      "xp_events",
      "earned_badges",
      "streaks",
      "notebook_entries",
    ];
    const tx = db.transaction(() => {
      let s = 0;
      for (const table of sqliteTables) {
        const r = db
          .prepare(`DELETE FROM ${table} WHERE child_id IN (${placeholders})`)
          .run(...childIds);
        s += r.changes;
      }
      return s;
    });
    swept += tx();
  }

  // 3. Delete the auth user. ON DELETE CASCADE on parent_profiles and
  //    child_profiles handles everything else in Supabase.
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) {
    console.error("[parent-repo] deleteParent failed:", error);
    return { deleted: false, sweptRows: swept };
  }
  return { deleted: true, sweptRows: swept };
}

export async function updateParentSubscription(
  id: string,
  tier: SubscriptionTier,
  status: string,
  stripeCustomerId?: string,
  stripeSubscriptionId?: string,
  trialEndsAt?: number,
): Promise<void> {
  const patch: Record<string, unknown> = {
    subscription_tier: tier,
    subscription_status: status,
  };
  if (stripeCustomerId !== undefined) patch.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId !== undefined) patch.stripe_subscription_id = stripeSubscriptionId;
  if (trialEndsAt !== undefined) patch.trial_ends_at = trialEndsAt;

  const { error } = await supabase.from("parent_profiles").update(patch).eq("id", id);
  if (error) throw error;
}

export async function updateParentSubscriptionStatusByStripeSubscriptionId(
  stripeSubscriptionId: string,
  status: ParentAccount["subscriptionStatus"],
): Promise<void> {
  const { error } = await supabase
    .from("parent_profiles")
    .update({ subscription_status: status })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) throw error;
}

// ============================================================================
// Child profiles
// ============================================================================

interface ChildRow {
  id: string;
  parent_id: string;
  name: string;
  age: number;
  grade_level: number | null;
  avatar: string | null;
  interests: string | null;
  created_at: number;
}

function rowToChild(row: ChildRow): ChildProfile {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    age: row.age,
    gradeLevel: row.grade_level ?? undefined,
    avatar: row.avatar ?? undefined,
    interests: row.interests ? (JSON.parse(row.interests) as string[]) : undefined,
    createdAt: row.created_at,
  };
}

export async function createChildProfile(
  parentId: string,
  profile: Omit<ChildProfile, "id" | "parentId" | "createdAt">,
): Promise<ChildProfile> {
  const id = randomUUID();
  const createdAt = Date.now();
  const { error } = await supabase.from("child_profiles").insert({
    id,
    parent_id: parentId,
    name: profile.name,
    age: profile.age,
    grade_level: profile.gradeLevel ?? null,
    avatar: profile.avatar ?? null,
    interests: profile.interests ? JSON.stringify(profile.interests) : null,
    created_at: createdAt,
  });
  if (error) throw error;
  return {
    id,
    parentId,
    name: profile.name,
    age: profile.age,
    gradeLevel: profile.gradeLevel,
    avatar: profile.avatar,
    interests: profile.interests,
    createdAt,
  };
}

export async function getChildProfile(id: string): Promise<ChildProfile | undefined> {
  const { data, error } = await supabase
    .from("child_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return undefined;
  return rowToChild(data as ChildRow);
}

export async function getChildrenByParent(parentId: string): Promise<ChildProfile[]> {
  const { data, error } = await supabase
    .from("child_profiles")
    .select("*")
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as ChildRow[]).map(rowToChild);
}

export async function updateChildProfile(
  id: string,
  updates: Partial<ChildProfile>,
): Promise<ChildProfile | undefined> {
  const existing = await getChildProfile(id);
  if (!existing) return undefined;
  const merged: ChildProfile = {
    ...existing,
    ...updates,
    id: existing.id,
    parentId: existing.parentId,
    createdAt: existing.createdAt,
  };
  const { error } = await supabase
    .from("child_profiles")
    .update({
      name: merged.name,
      age: merged.age,
      grade_level: merged.gradeLevel ?? null,
      avatar: merged.avatar ?? null,
      interests: merged.interests ? JSON.stringify(merged.interests) : null,
    })
    .eq("id", id);
  if (error) throw error;
  return merged;
}

export async function deleteChildProfile(id: string): Promise<boolean> {
  // Sweep kid-data on SQLite first (gamification, notebook).
  try {
    const db = getDb();
    db.prepare("DELETE FROM xp_events WHERE child_id = ?").run(id);
    db.prepare("DELETE FROM earned_badges WHERE child_id = ?").run(id);
    db.prepare("DELETE FROM streaks WHERE child_id = ?").run(id);
    db.prepare("DELETE FROM notebook_entries WHERE child_id = ?").run(id);
  } catch (e) {
    console.warn("[parent-repo] SQLite child-data sweep failed:", e);
  }
  const { error, count } = await supabase
    .from("child_profiles")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ============================================================================
// Parental controls
// ============================================================================

interface ControlsRow {
  child_id: string;
  daily_screen_time_minutes: number | null;
  blocked_categories: string;
  blocked_keywords: string;
  require_approval_for_yellow: number;
  notifications_enabled: number;
  updated_at: number;
}

function rowToControls(row: ControlsRow): ParentalControls {
  return {
    id: row.child_id,
    childId: row.child_id,
    dailyScreenTimeMinutes: row.daily_screen_time_minutes ?? undefined,
    blockedCategories: JSON.parse(row.blocked_categories) as string[],
    blockedKeywords: JSON.parse(row.blocked_keywords) as string[],
    requireApprovalForYellow: row.require_approval_for_yellow === 1,
    notificationsEnabled: row.notifications_enabled === 1,
    updatedAt: row.updated_at,
  };
}

export async function getControls(childId: string): Promise<ParentalControls | undefined> {
  const { data, error } = await supabase
    .from("parental_controls")
    .select("*")
    .eq("child_id", childId)
    .maybeSingle();
  if (error || !data) return undefined;
  return rowToControls(data as ControlsRow);
}

export async function upsertControls(
  controls: Omit<ParentalControls, "id" | "updatedAt">,
): Promise<ParentalControls> {
  const now = Date.now();
  const { error } = await supabase
    .from("parental_controls")
    .upsert({
      child_id: controls.childId,
      daily_screen_time_minutes: controls.dailyScreenTimeMinutes ?? null,
      blocked_categories: JSON.stringify(controls.blockedCategories ?? []),
      blocked_keywords: JSON.stringify(controls.blockedKeywords ?? []),
      require_approval_for_yellow: controls.requireApprovalForYellow ? 1 : 0,
      notifications_enabled: controls.notificationsEnabled ? 1 : 0,
      updated_at: now,
    });
  if (error) throw error;
  return {
    id: controls.childId,
    childId: controls.childId,
    dailyScreenTimeMinutes: controls.dailyScreenTimeMinutes,
    blockedCategories: controls.blockedCategories ?? [],
    blockedKeywords: controls.blockedKeywords ?? [],
    requireApprovalForYellow: controls.requireApprovalForYellow,
    notificationsEnabled: controls.notificationsEnabled,
    updatedAt: now,
  };
}

// ============================================================================
// Activity log
// ============================================================================

interface ActivityRow {
  id: string;
  child_id: string;
  type: string;
  summary: string;
  metadata: string | null;
  created_at: number;
}

function rowToActivity(row: ActivityRow): ActivityLogEntry {
  return {
    id: row.id,
    childId: row.child_id,
    type: row.type as ActivityLogEntry["type"],
    summary: row.summary,
    metadata: row.metadata
      ? (JSON.parse(row.metadata) as Record<string, string | number>)
      : undefined,
    createdAt: row.created_at,
  };
}

export async function logActivity(
  entry: Omit<ActivityLogEntry, "id" | "createdAt">,
): Promise<ActivityLogEntry> {
  const id = randomUUID();
  const createdAt = Date.now();
  const { error } = await supabase.from("activity_log").insert({
    id,
    child_id: entry.childId,
    type: entry.type,
    summary: entry.summary,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    created_at: createdAt,
  });
  if (error) throw error;
  return {
    id,
    childId: entry.childId,
    type: entry.type,
    summary: entry.summary,
    metadata: entry.metadata,
    createdAt,
  };
}

export async function getActivityLog(
  childId: string,
  limit = 50,
  offset = 0,
): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data as ActivityRow[]).map(rowToActivity);
}

// ============================================================================
// Screen time
// ============================================================================

interface ScreenTimeRow {
  child_id: string;
  date: string;
  minutes_used: number;
  sessions_count: number;
}

function rowToScreenTime(row: ScreenTimeRow): ScreenTimeUsage {
  return {
    childId: row.child_id,
    date: row.date,
    minutesUsed: row.minutes_used,
    sessionsCount: row.sessions_count,
  };
}

export async function recordScreenTime(
  childId: string,
  date: string,
  minutesToAdd: number,
): Promise<ScreenTimeUsage> {
  // Read-modify-write. Supabase's PostgREST doesn't support raw SQL increments
  // without an RPC, so we fetch + update. Acceptable: low write volume.
  const { data: existing } = await supabase
    .from("screen_time_usage")
    .select("*")
    .eq("child_id", childId)
    .eq("date", date)
    .maybeSingle();

  const existingRow = existing as ScreenTimeRow | null;
  const newMinutes = (existingRow?.minutes_used ?? 0) + minutesToAdd;
  const newSessions = (existingRow?.sessions_count ?? 0) + 1;

  const { error } = await supabase.from("screen_time_usage").upsert({
    child_id: childId,
    date,
    minutes_used: newMinutes,
    sessions_count: newSessions,
  });
  if (error) throw error;
  return {
    childId,
    date,
    minutesUsed: newMinutes,
    sessionsCount: newSessions,
  };
}

export async function getScreenTime(
  childId: string,
  date: string,
): Promise<ScreenTimeUsage | undefined> {
  const { data, error } = await supabase
    .from("screen_time_usage")
    .select("*")
    .eq("child_id", childId)
    .eq("date", date)
    .maybeSingle();
  if (error || !data) return undefined;
  return rowToScreenTime(data as ScreenTimeRow);
}

export async function getScreenTimeRange(
  childId: string,
  startDate: string,
  endDate: string,
): Promise<ScreenTimeUsage[]> {
  const { data, error } = await supabase
    .from("screen_time_usage")
    .select("*")
    .eq("child_id", childId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data as ScreenTimeRow[]).map(rowToScreenTime);
}

// ============================================================================
// Notifications
// ============================================================================

interface NotificationRow {
  id: string;
  recipient_id: string;
  recipient_type: string;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  read: number;
  created_at: number;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    recipientType: row.recipient_type as Notification["recipientType"],
    type: row.type as Notification["type"],
    title: row.title,
    message: row.message,
    actionUrl: row.action_url ?? undefined,
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

export async function createNotification(
  n: Omit<Notification, "id" | "createdAt">,
): Promise<Notification> {
  const id = randomUUID();
  const createdAt = Date.now();
  const { error } = await supabase.from("notifications").insert({
    id,
    recipient_id: n.recipientId,
    recipient_type: n.recipientType,
    type: n.type,
    title: n.title,
    message: n.message,
    action_url: n.actionUrl ?? null,
    read: n.read ? 1 : 0,
    created_at: createdAt,
  });
  if (error) throw error;
  return {
    id,
    recipientId: n.recipientId,
    recipientType: n.recipientType,
    type: n.type,
    title: n.title,
    message: n.message,
    actionUrl: n.actionUrl,
    read: n.read,
    createdAt,
  };
}

export async function getNotifications(
  recipientId: string,
  unreadOnly = false,
  limit = 50,
): Promise<Notification[]> {
  let q = supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.eq("read", 0);
  const { data, error } = await q;
  if (error) throw error;
  return (data as NotificationRow[]).map(rowToNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: 1 })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllRead(recipientId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: 1 })
    .eq("recipient_id", recipientId);
  if (error) throw error;
}

export async function getUnreadCount(recipientId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .eq("read", 0);
  if (error) throw error;
  return count ?? 0;
}
