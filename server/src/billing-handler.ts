// LabBuddy — Stripe billing HTTP handlers
//
// All endpoints degrade gracefully when STRIPE_SECRET_KEY is not configured:
// the handler still returns valid responses (stub URLs, direct DB updates),
// so the rest of the app can run without Stripe credentials during
// development.

import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import Stripe from "stripe";
import { requireParentAuth, type AuthRequest } from "./auth-middleware.js";
import {
  getParentById,
  getParentByStripeSubscriptionId,
  updateParentSubscription,
  updateParentSubscriptionStatusByStripeSubscriptionId,
} from "./repositories/parent-repo.js";
import { TIER_LIMITS } from "./tier-limits.js";
import type {
  CheckoutSession,
  ParentAccount,
  SubscriptionTier,
  TierLimits,
} from "../../shared/types.js";

// ---------- Stripe client (lazy, optional) ----------

let stripeClient: Stripe | null = null;
let stripeUnavailableLogged = false;

function getStripe(): Stripe | null {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    if (!stripeUnavailableLogged) {
      console.warn(
        "[billing] STRIPE_SECRET_KEY not set — billing endpoints will return stub responses.",
      );
      stripeUnavailableLogged = true;
    }
    return null;
  }
  // Cast the options object so we stay pinned to a known-good API version
  // without blocking compilation when the Stripe SDK's apiVersion literal
  // type changes between releases.
  const config = { apiVersion: "2024-12-18.acacia" } as unknown as ConstructorParameters<typeof Stripe>[1];
  stripeClient = new Stripe(key, config);
  return stripeClient;
}

// ---------- Price IDs ----------

const PRICE_IDS = {
  family_monthly:
    process.env.STRIPE_PRICE_FAMILY_MONTHLY || "price_family_monthly_stub",
  family_yearly:
    process.env.STRIPE_PRICE_FAMILY_YEARLY || "price_family_yearly_stub",
  classroom_monthly:
    process.env.STRIPE_PRICE_CLASSROOM_MONTHLY ||
    "price_classroom_monthly_stub",
} as const;

// ---------- Tier catalog (for GET /tiers) ----------

interface TierCatalogEntry {
  id: SubscriptionTier;
  name: string;
  price: number;
  period: "forever" | "month" | "year";
  yearlyPrice?: number;
  features: string[];
  limits: TierLimits;
}

const TIER_CATALOG: TierCatalogEntry[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "forever",
    features: [
      "3 experiments per day",
      "1 child profile",
      "Basic parent dashboard",
      "Safety-screened AI copilot",
    ],
    limits: TIER_LIMITS.free,
  },
  {
    id: "family",
    name: "Family",
    price: 9.99,
    period: "month",
    yearlyPrice: 79.99,
    features: [
      "Unlimited experiments",
      "Up to 3 child profiles",
      "Upload school syllabi",
      "Printable DIY guides",
      "Lab notebook with photos",
      "Full parent dashboard",
    ],
    limits: TIER_LIMITS.family,
  },
  {
    id: "classroom",
    name: "Classroom",
    price: 29.99,
    period: "month",
    features: [
      "Unlimited experiments",
      "Up to 35 child profiles",
      "Upload school syllabi",
      "Printable DIY guides",
      "Lab notebook with photos",
      "Full parent dashboard",
      "Priority support",
    ],
    limits: TIER_LIMITS.classroom,
  },
];

// ---------- Helpers ----------

function pickPriceId(
  tier: "family" | "classroom",
  period: "monthly" | "yearly",
): string | null {
  if (tier === "family") {
    return period === "yearly" ? PRICE_IDS.family_yearly : PRICE_IDS.family_monthly;
  }
  if (tier === "classroom") {
    // Classroom only has a monthly price for MVP.
    return PRICE_IDS.classroom_monthly;
  }
  return null;
}

function clientOrigin(): string {
  return process.env.CLIENT_ORIGIN || "http://localhost:3000";
}

async function loadAuthedParent(
  req: AuthRequest,
  res: Response,
): Promise<ParentAccount | null> {
  const parentId = req.parentId;
  if (!parentId) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  const parent = await getParentById(parentId);
  if (!parent) {
    res.status(401).json({ error: "Invalid session." });
    return null;
  }
  return parent;
}

// ---------- Router ----------

export const billingRouter = Router();

/**
 * GET /api/billing/tiers
 * Public tier catalog for pricing pages.
 */
billingRouter.get("/tiers", (_req, res) => {
  res.json({ tiers: TIER_CATALOG });
});

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout Session for the selected tier.
 * Falls back to a direct DB upgrade when Stripe is not configured.
 */
billingRouter.post(
  "/checkout",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const parent = await loadAuthedParent(req, res);
    if (!parent) return;

    const body = (req.body ?? {}) as {
      tier?: SubscriptionTier;
      period?: "monthly" | "yearly";
    };
    const tier = body.tier;
    const period = body.period ?? "monthly";

    if (tier !== "family" && tier !== "classroom") {
      res
        .status(400)
        .json({ error: "Invalid tier. Must be 'family' or 'classroom'." });
      return;
    }
    if (period !== "monthly" && period !== "yearly") {
      res
        .status(400)
        .json({ error: "Invalid period. Must be 'monthly' or 'yearly'." });
      return;
    }

    const priceId = pickPriceId(tier, period);
    if (!priceId) {
      res.status(400).json({ error: "No price configured for that tier/period." });
      return;
    }

    const stripe = getStripe();

    // ---- Fallback: Stripe not configured — simulate the upgrade. ----
    if (!stripe) {
      console.warn(
        `[billing] Stripe not configured — simulating upgrade to ${tier} for parent ${parent.id}`,
      );
      await updateParentSubscription(parent.id, tier, "active");
      const session: CheckoutSession = {
        url: `/upgrade-success?session=stub`,
        sessionId: `stub_${randomUUID()}`,
      };
      res.json(session);
      return;
    }

    // ---- Real Stripe checkout flow. ----
    try {
      const origin = clientOrigin();
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: parent.stripeCustomerId ? undefined : parent.email,
        customer: parent.stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/upgrade-success?session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/upgrade-canceled`,
        client_reference_id: parent.id,
        metadata: {
          parentId: parent.id,
          tier,
          period,
        },
        subscription_data: {
          metadata: {
            parentId: parent.id,
            tier,
          },
        },
      });

      const response: CheckoutSession = {
        url: checkoutSession.url ?? `${origin}/upgrade-canceled`,
        sessionId: checkoutSession.id,
      };
      res.json(response);
    } catch (err) {
      console.error("[billing] Stripe checkout error:", err);
      res.status(500).json({ error: "Failed to create checkout session." });
    }
  },
);

/**
 * POST /api/billing/webhook
 * Stripe webhook endpoint. Handles subscription lifecycle events.
 * NOTE: For proper signature verification this should be mounted with the
 * raw body parser BEFORE express.json(). For the MVP we accept JSON bodies
 * and only verify signatures when a webhook secret is configured AND the
 * raw body is available on req.
 */
billingRouter.post("/webhook", async (req, res) => {
  const stripe = getStripe();

  if (!stripe) {
    console.warn(
      "[billing] Stripe webhook received but Stripe is not configured — acknowledging.",
    );
    res.status(200).json({ received: true, stub: true });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event: Stripe.Event;

  try {
    const signature = req.header("stripe-signature");
    // If a secret and signature are present, and the raw body was captured
    // upstream, verify it; otherwise fall back to the parsed JSON body.
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (webhookSecret && signature && rawBody) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      event = req.body as Stripe.Event;
    }
  } catch (err) {
    console.error("[billing] Webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid webhook payload." });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const parentId =
          session.client_reference_id ??
          (session.metadata?.parentId as string | undefined);
        const tier =
          (session.metadata?.tier as SubscriptionTier | undefined) ?? "family";
        if (parentId) {
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id;
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;
          await updateParentSubscription(
            parentId,
            tier,
            "active",
            customerId,
            subscriptionId,
          );
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const mappedStatus: ParentAccount["subscriptionStatus"] =
          sub.status === "active"
            ? "active"
            : sub.status === "trialing"
              ? "trialing"
              : sub.status === "past_due"
                ? "past_due"
                : sub.status === "canceled"
                  ? "canceled"
                  : "none";
        await updateParentSubscriptionStatusByStripeSubscriptionId(sub.id, mappedStatus);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await updateParentSubscriptionStatusByStripeSubscriptionId(sub.id, "canceled");
        // Step the tier back down to free so feature gates re-engage.
        const existing = await getParentByStripeSubscriptionId(sub.id);
        if (existing) {
          await updateParentSubscription(existing.id, "free", "canceled");
        }
        break;
      }

      default:
        // Unhandled events are fine — acknowledge so Stripe stops retrying.
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[billing] Webhook handler error:", err);
    res.status(500).json({ error: "Webhook handler failed." });
  }
});

/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session so the parent can manage their
 * subscription, payment method, and invoices.
 */
billingRouter.post(
  "/portal",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const parent = await loadAuthedParent(req, res);
    if (!parent) return;

    const stripe = getStripe();
    if (!stripe || !parent.stripeCustomerId) {
      res.json({ url: "/settings" });
      return;
    }

    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: parent.stripeCustomerId,
        return_url: `${clientOrigin()}/settings`,
      });
      res.json({ url: portal.url });
    } catch (err) {
      console.error("[billing] Stripe portal error:", err);
      res.status(500).json({ error: "Failed to create portal session." });
    }
  },
);

/**
 * GET /api/billing/subscription
 * Returns the authenticated parent's current subscription snapshot.
 */
billingRouter.get(
  "/subscription",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const parent = await loadAuthedParent(req, res);
    if (!parent) return;
    res.json({
      tier: parent.subscriptionTier,
      status: parent.subscriptionStatus,
      trialEndsAt: parent.trialEndsAt ?? null,
      limits: TIER_LIMITS[parent.subscriptionTier],
    });
  },
);

/**
 * POST /api/billing/cancel
 * Cancels the parent's subscription at period end (or immediately if Stripe
 * is not configured).
 */
billingRouter.post(
  "/cancel",
  requireParentAuth,
  async (req: AuthRequest, res: Response) => {
    const parent = await loadAuthedParent(req, res);
    if (!parent) return;

    const stripe = getStripe();
    if (!stripe || !parent.stripeSubscriptionId) {
      await updateParentSubscription(parent.id, parent.subscriptionTier, "canceled");
      res.json({ ok: true, status: "canceled" });
      return;
    }

    try {
      const updated = await stripe.subscriptions.update(
        parent.stripeSubscriptionId,
        { cancel_at_period_end: true },
      );
      res.json({
        ok: true,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancel_at_period_end,
      });
    } catch (err) {
      console.error("[billing] Stripe cancel error:", err);
      res.status(500).json({ error: "Failed to cancel subscription." });
    }
  },
);
