/**
 * Typed API module for billing / subscription endpoints.
 *
 * All endpoints are relative — the Vite dev server / reverse proxy forwards
 * `/api/*` to the Express backend. Mirrors the token scheme used by
 * `api/parent.ts` (Bearer token stored in `localStorage` under
 * `labbuddy_parent_token`).
 */

import type { SubscriptionTier, TierLimits } from '../../../shared/types';

const TOKEN_KEY = 'labbuddy_parent_token';

function authHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body === 'object' && 'error' in body) {
        message = String((body as { error: unknown }).error);
      } else if (body && typeof body === 'object' && 'message' in body) {
        message = String((body as { message: unknown }).message);
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

// ---------- Types ----------

export interface TierDisplay {
  id: SubscriptionTier;
  name: string;
  price: number;
  period: string;
  yearlyPrice?: number;
  features: string[];
  limits: TierLimits;
}

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: string;
  trialEndsAt: number | null;
  limits: TierLimits;
}

export interface CreateCheckoutResponse {
  url: string;
  sessionId: string;
}

// ---------- Default (fallback) tier catalog ----------
//
// The server *may* expose a /api/billing/tiers endpoint that returns a
// richer display catalog. If it doesn't (or it returns bare TierLimits
// objects), we fall back to this catalog so the upgrade page always has
// something useful to render.

const DEFAULT_TIER_CATALOG: TierDisplay[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    features: [
      '3 experiments per day',
      '1 child profile',
      'Basic chat copilot',
      'Age-appropriate safety filters',
    ],
    limits: {
      tier: 'free',
      maxExperimentsPerDay: 3,
      maxChildProfiles: 1,
      syllabusUploads: false,
      diyGuides: false,
      labNotebook: false,
      parentDashboard: true,
      prioritySupport: false,
    },
  },
  {
    id: 'family',
    name: 'Family',
    price: 9.99,
    period: 'month',
    yearlyPrice: 79.99,
    features: [
      'Unlimited experiments',
      'Up to 3 child profiles',
      'Syllabus uploads & curriculum map',
      'Printable DIY guides',
      'Lab notebook with photos',
      'Full parent dashboard',
    ],
    limits: {
      tier: 'family',
      maxExperimentsPerDay: 9999,
      maxChildProfiles: 3,
      syllabusUploads: true,
      diyGuides: true,
      labNotebook: true,
      parentDashboard: true,
      prioritySupport: false,
    },
  },
  {
    id: 'classroom',
    name: 'Classroom',
    price: 29.99,
    period: 'month',
    features: [
      'Everything in Family',
      'Up to 35 student profiles',
      'Bulk school pricing',
      'Priority email support',
      'Teacher dashboard',
    ],
    limits: {
      tier: 'classroom',
      maxExperimentsPerDay: 9999,
      maxChildProfiles: 35,
      syllabusUploads: true,
      diyGuides: true,
      labNotebook: true,
      parentDashboard: true,
      prioritySupport: true,
    },
  },
];

// ---------- Public API ----------

/**
 * Fetch the pricing / tier catalog. Tries the server first and falls
 * back to the bundled catalog if the server is unreachable or returns
 * an unexpected shape.
 */
export async function fetchTiers(): Promise<{ tiers: TierDisplay[] }> {
  try {
    const res = await fetch('/api/billing/tiers', {
      headers: { ...authHeaders() },
    });
    if (!res.ok) {
      return { tiers: DEFAULT_TIER_CATALOG };
    }
    const body = (await res.json()) as unknown;
    if (
      body &&
      typeof body === 'object' &&
      'tiers' in body &&
      Array.isArray((body as { tiers: unknown }).tiers)
    ) {
      const rawTiers = (body as { tiers: unknown[] }).tiers;
      // If the server already returns TierDisplay-shaped objects, use them.
      const looksLikeDisplay = rawTiers.every(
        (t) =>
          t &&
          typeof t === 'object' &&
          'name' in (t as object) &&
          'price' in (t as object)
      );
      if (looksLikeDisplay) {
        return { tiers: rawTiers as TierDisplay[] };
      }
    }
    return { tiers: DEFAULT_TIER_CATALOG };
  } catch {
    return { tiers: DEFAULT_TIER_CATALOG };
  }
}

/**
 * Fetch the current parent's subscription. Requires a valid auth token.
 */
export async function fetchSubscription(): Promise<SubscriptionInfo> {
  return apiFetch<SubscriptionInfo>('/api/billing/subscription');
}

/**
 * Create a Stripe checkout session (or stub) for the given tier.
 */
export async function createCheckout(
  tier: 'family' | 'classroom',
  period: 'monthly' | 'yearly'
): Promise<CreateCheckoutResponse> {
  return apiFetch<CreateCheckoutResponse>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ tier, period }),
  });
}

/**
 * Cancel the current subscription.
 */
export async function cancelSubscription(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/api/billing/cancel', {
    method: 'POST',
  });
}

/**
 * Open the Stripe billing portal for the current customer.
 */
export async function openBillingPortal(): Promise<{ url: string }> {
  return apiFetch<{ url: string }>('/api/billing/portal', {
    method: 'POST',
  });
}

export { DEFAULT_TIER_CATALOG };
