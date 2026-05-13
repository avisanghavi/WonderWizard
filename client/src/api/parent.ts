/**
 * Typed API module for all parent dashboard endpoints.
 *
 * Auth lives in Supabase now (supabase-js manages the session in localStorage
 * and refreshes the access token automatically). Every server call attaches
 * the current access token as a Bearer header.
 */

import { supabase } from '../supabase';
import type {
  ParentAccount,
  ChildProfile,
  ParentalControls,
  ActivityLogEntry,
  ScreenTimeUsage,
  Notification,
  TierLimits,
  SubscriptionTier,
  CheckoutSession,
} from '../../../shared/types';

// ---------- Token helpers ----------

/**
 * Get the current Supabase access token, or null if not signed in.
 * supabase-js refreshes automatically when getSession() is called.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Synchronous best-effort check used by route guards. */
export function hasSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------- Generic fetch wrapper ----------

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      if (err && typeof err === 'object' && 'error' in err) {
        message = String((err as { error: unknown }).error);
      } else if (err && typeof err === 'object' && 'message' in err) {
        message = String((err as { message: unknown }).message);
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ---------- Identity ----------

export async function fetchParentMe(): Promise<{
  parent: ParentAccount;
  children: ChildProfile[];
}> {
  return apiFetch<{ parent: ParentAccount; children: ChildProfile[] }>(
    '/api/parent/me'
  );
}

export async function parentLogout(): Promise<void> {
  await supabase.auth.signOut();
}

// ---------- Account management ----------

export interface AccountSummary {
  parent: ParentAccount;
  children: ChildProfile[];
  subscription: {
    tier: SubscriptionTier;
    status: string;
    trialEndsAt: number | null;
    limits: TierLimits;
    childrenCount: number;
  };
}

export async function fetchAccountSummary(): Promise<AccountSummary> {
  return apiFetch<AccountSummary>('/api/parent/me/account-summary');
}

export async function updateParentProfile(patch: {
  name?: string;
  email?: string;
}): Promise<{ parent: ParentAccount }> {
  return apiFetch<{ parent: ParentAccount }>('/api/parent/me', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

/**
 * Change the signed-in parent's password. Supabase handles this client-side
 * — no server round-trip needed.
 */
export async function changeParentPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/**
 * Permanently delete the parent's account and all dependent data.
 * The server verifies the bearer token and uses the Supabase admin API to
 * delete the auth user. Requires `confirm: "DELETE"` as a guardrail.
 */
export async function deleteParentAccount(): Promise<{
  ok: true;
  sweptRows: number;
}> {
  const result = await apiFetch<{ ok: true; sweptRows: number }>(
    '/api/parent/me',
    {
      method: 'DELETE',
      body: JSON.stringify({ confirm: 'DELETE' }),
    }
  );
  await supabase.auth.signOut();
  return result;
}

// ---------- Children ----------

export async function fetchChildren(): Promise<{ children: ChildProfile[] }> {
  return apiFetch<{ children: ChildProfile[] }>('/api/parent/children');
}

export async function createChild(data: {
  name: string;
  age: number;
  gradeLevel?: number;
  avatar?: string;
  interests?: string[];
}): Promise<{ child: ChildProfile }> {
  return apiFetch<{ child: ChildProfile }>('/api/parent/children', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateChild(
  childId: string,
  updates: Partial<ChildProfile>
): Promise<{ child: ChildProfile }> {
  return apiFetch<{ child: ChildProfile }>(`/api/parent/children/${childId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteChild(childId: string): Promise<void> {
  return apiFetch<void>(`/api/parent/children/${childId}`, {
    method: 'DELETE',
  });
}

// ---------- Controls ----------

export async function fetchControls(
  childId: string
): Promise<{ controls: ParentalControls }> {
  return apiFetch<{ controls: ParentalControls }>(
    `/api/parent/children/${childId}/controls`
  );
}

export async function updateControls(
  childId: string,
  controls: Partial<ParentalControls>
): Promise<{ controls: ParentalControls }> {
  return apiFetch<{ controls: ParentalControls }>(
    `/api/parent/children/${childId}/controls`,
    {
      method: 'PUT',
      body: JSON.stringify(controls),
    }
  );
}

// ---------- Activity & screen time ----------

export async function fetchActivity(
  childId: string,
  limit = 50,
  offset = 0
): Promise<{ activity: ActivityLogEntry[]; total?: number }> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return apiFetch<{ activity: ActivityLogEntry[]; total?: number }>(
    `/api/parent/children/${childId}/activity?${params.toString()}`
  );
}

export async function fetchScreenTime(
  childId: string,
  days = 7
): Promise<{ usage: ScreenTimeUsage[]; dailyLimit?: number }> {
  const params = new URLSearchParams({ days: String(days) });
  return apiFetch<{ usage: ScreenTimeUsage[]; dailyLimit?: number }>(
    `/api/parent/children/${childId}/screen-time?${params.toString()}`
  );
}

export interface ChildSummary {
  child: ChildProfile;
  totalXP: number;
  level: number;
  currentStreak: number;
  experimentsCompleted: number;
  notebookEntries: number;
  minutesToday: number;
  minutesThisWeek: number;
  dailyLimit?: number;
  recentActivity: ActivityLogEntry[];
}

export async function fetchChildSummary(
  childId: string
): Promise<ChildSummary> {
  return apiFetch<ChildSummary>(`/api/parent/children/${childId}/summary`);
}

// ---------- Notifications ----------

export async function fetchNotifications(
  unreadOnly = false
): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unreadOnly', 'true');
  const qs = params.toString();
  return apiFetch<{ notifications: Notification[]; unreadCount: number }>(
    `/api/parent/notifications${qs ? `?${qs}` : ''}`
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`/api/parent/notifications/${id}/read`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>('/api/parent/notifications/read-all', {
    method: 'POST',
  });
}

// ---------- Billing ----------

export async function fetchBillingTiers(): Promise<{ tiers: TierLimits[] }> {
  return apiFetch<{ tiers: TierLimits[] }>('/api/billing/tiers');
}

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  trialEndsAt?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}

export async function fetchSubscription(): Promise<{
  subscription: SubscriptionInfo;
}> {
  return apiFetch<{ subscription: SubscriptionInfo }>(
    '/api/billing/subscription'
  );
}

export async function createCheckoutSession(
  tier: 'family' | 'classroom',
  period: 'monthly' | 'yearly'
): Promise<CheckoutSession> {
  return apiFetch<CheckoutSession>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ tier, period }),
  });
}

export async function cancelSubscription(): Promise<void> {
  return apiFetch<void>('/api/billing/cancel', {
    method: 'POST',
  });
}
