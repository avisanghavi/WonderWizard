import { useState, useEffect, useCallback } from 'react';
import type {
  ParentAccount,
  ChildProfile,
  TierLimits,
} from '../../../shared/types';
import {
  fetchParentMe,
  fetchChildren,
  fetchBillingTiers,
  fetchSubscription,
  createCheckoutSession,
  cancelSubscription,
  type SubscriptionInfo,
} from '../api/parent';
import DashboardOverview from '../components/DashboardOverview';
import ActivityFeed from '../components/ActivityFeed';
import ParentalControlsPanel from '../components/ParentalControlsPanel';
import ChildProfileForm from '../components/ChildProfileForm';
import ScreenTimeChart from '../components/ScreenTimeChart';
import NotificationBell from '../components/NotificationBell';
import SettingsPage from './SettingsPage';

interface ParentDashboardProps {
  onClose: () => void;
  onLogout: () => void;
}

type Section = 'overview' | 'activity' | 'controls' | 'billing' | 'settings';

export default function ParentDashboard({
  onClose,
  onLogout,
}: ParentDashboardProps) {
  const [parent, setParent] = useState<ParentAccount | null>(null);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddChild, setShowAddChild] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, kids] = await Promise.all([
        fetchParentMe(),
        fetchChildren(),
      ]);
      setParent(me.parent);
      setChildren(kids.children || []);
      if (kids.children && kids.children.length > 0) {
        setSelectedChildId((prev) => prev ?? kids.children[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load dashboard.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChildSaved = useCallback((child: ChildProfile) => {
    setChildren((prev) => {
      const existing = prev.find((c) => c.id === child.id);
      if (existing) {
        return prev.map((c) => (c.id === child.id ? child : c));
      }
      return [...prev, child];
    });
    setSelectedChildId(child.id);
    setShowAddChild(false);
  }, []);

  const selectedChild =
    children.find((c) => c.id === selectedChildId) || null;

  if (loading) {
    return (
      <div className="parent-dashboard parent-dashboard--loading">
        <div className="parent-dashboard__loading">Loading dashboard…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="parent-dashboard parent-dashboard--error">
        <div className="parent-dashboard__error">
          <h2>Something went wrong</h2>
          <p>{error}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={loadData}
          >
            Try again
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="parent-dashboard">
      <header className="parent-dashboard__header">
        <div className="parent-dashboard__header-left">
          <button
            type="button"
            className="parent-dashboard__close"
            onClick={onClose}
            aria-label="Close dashboard"
          >
            &larr; Back
          </button>
          <h1 className="parent-dashboard__title">
            Hi{parent?.name ? `, ${parent.name}` : ''}
          </h1>
        </div>
        <div className="parent-dashboard__header-right">
          <NotificationBell />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setShowAddChild(true)}
          >
            + Add child
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      {children.length > 1 && (
        <div className="parent-dashboard__child-tabs">
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`child-tab${selectedChildId === c.id ? ' is-active' : ''}`}
              onClick={() => setSelectedChildId(c.id)}
            >
              <span className="child-tab__avatar">
                {c.avatar || '\uD83E\uDDD2'}
              </span>
              <span className="child-tab__name">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="parent-dashboard__body">
        <aside className="parent-sidebar">
          <nav>
            <button
              type="button"
              className={`parent-sidebar__item${section === 'overview' ? ' is-active' : ''}`}
              onClick={() => setSection('overview')}
            >
              <span className="parent-sidebar__icon">{'\uD83D\uDCCA'}</span>
              Overview
            </button>
            <button
              type="button"
              className={`parent-sidebar__item${section === 'activity' ? ' is-active' : ''}`}
              onClick={() => setSection('activity')}
            >
              <span className="parent-sidebar__icon">{'\uD83D\uDCDC'}</span>
              Activity
            </button>
            <button
              type="button"
              className={`parent-sidebar__item${section === 'controls' ? ' is-active' : ''}`}
              onClick={() => setSection('controls')}
            >
              <span className="parent-sidebar__icon">{'\uD83D\uDD12'}</span>
              Controls
            </button>
            <button
              type="button"
              className={`parent-sidebar__item${section === 'billing' ? ' is-active' : ''}`}
              onClick={() => setSection('billing')}
            >
              <span className="parent-sidebar__icon">{'\uD83D\uDC8E'}</span>
              Billing
            </button>
            <button
              type="button"
              className={`parent-sidebar__item${section === 'settings' ? ' is-active' : ''}`}
              onClick={() => setSection('settings')}
            >
              <span className="parent-sidebar__icon">{'\u2699\uFE0F'}</span>
              Settings
            </button>
          </nav>
        </aside>

        <main className="parent-content">
          {section === 'settings' ? (
            <SettingsPage onClose={() => setSection('overview')} onLogout={onLogout} />
          ) : children.length === 0 ? (
            <div className="parent-dashboard__empty">
              <h2>Welcome to LabBuddy!</h2>
              <p>Add your first child to start tracking their learning journey.</p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setShowAddChild(true)}
              >
                + Add child
              </button>
            </div>
          ) : !selectedChild ? (
            <div className="parent-dashboard__empty">
              Select a child to get started.
            </div>
          ) : (
            <>
              {section === 'overview' && (
                <>
                  <DashboardOverview
                    childId={selectedChild.id}
                    onViewFullActivity={() => setSection('activity')}
                  />
                  <ScreenTimeChart childId={selectedChild.id} />
                </>
              )}
              {section === 'activity' && (
                <ActivityFeed childId={selectedChild.id} />
              )}
              {section === 'controls' && (
                <ParentalControlsPanel childId={selectedChild.id} />
              )}
              {section === 'billing' && <BillingSection />}
            </>
          )}
        </main>
      </div>

      {showAddChild && (
        <ChildProfileForm
          mode="create"
          onSave={handleChildSaved}
          onCancel={() => setShowAddChild(false)}
        />
      )}
    </div>
  );
}

// ---------- Billing Section (inline) ----------

function BillingSection() {
  const [tiers, setTiers] = useState<TierLimits[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchBillingTiers(), fetchSubscription()])
      .then(([t, s]) => {
        if (cancelled) return;
        setTiers(t.tiers || []);
        setSubscription(s.subscription);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load billing.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpgrade = useCallback(
    async (tier: 'family' | 'classroom') => {
      setActionLoading(true);
      setError(null);
      try {
        const res = await createCheckoutSession(tier, period);
        if (res.url) {
          window.location.href = res.url;
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to start checkout.'
        );
      } finally {
        setActionLoading(false);
      }
    },
    [period]
  );

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel your subscription? You can resubscribe later.')) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await cancelSubscription();
      const s = await fetchSubscription();
      setSubscription(s.subscription);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to cancel subscription.'
      );
    } finally {
      setActionLoading(false);
    }
  }, []);

  if (loading) {
    return <div className="billing__loading">Loading billing…</div>;
  }

  return (
    <div className="billing">
      <h2 className="billing__heading">Billing & Subscription</h2>

      {subscription && (
        <div className="billing__current">
          <div>
            <strong>Current plan:</strong>{' '}
            <span className="billing__tier-name">
              {capitalize(subscription.tier)}
            </span>{' '}
            <span className={`billing__status billing__status--${subscription.status}`}>
              {subscription.status}
            </span>
          </div>
          {subscription.tier !== 'free' &&
            subscription.status === 'active' && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleCancel}
                disabled={actionLoading}
              >
                Cancel subscription
              </button>
            )}
        </div>
      )}

      <div className="billing__period-toggle">
        <button
          type="button"
          className={`period-toggle${period === 'monthly' ? ' is-active' : ''}`}
          onClick={() => setPeriod('monthly')}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`period-toggle${period === 'yearly' ? ' is-active' : ''}`}
          onClick={() => setPeriod('yearly')}
        >
          Yearly
        </button>
      </div>

      <div className="billing__tiers">
        {tiers.map((tier) => (
          <div
            key={tier.tier}
            className={`billing__tier billing__tier--${tier.tier}`}
          >
            <h3 className="billing__tier-title">{capitalize(tier.tier)}</h3>
            <ul className="billing__features">
              <li>
                {tier.maxChildProfiles === Infinity
                  ? 'Unlimited'
                  : tier.maxChildProfiles}{' '}
                child profile{tier.maxChildProfiles === 1 ? '' : 's'}
              </li>
              <li>
                {tier.maxExperimentsPerDay >= 999
                  ? 'Unlimited'
                  : tier.maxExperimentsPerDay}{' '}
                experiments/day
              </li>
              <li>
                {tier.syllabusUploads ? '\u2705' : '\u274C'} Syllabus uploads
              </li>
              <li>{tier.diyGuides ? '\u2705' : '\u274C'} DIY guides</li>
              <li>{tier.labNotebook ? '\u2705' : '\u274C'} Lab notebook</li>
              <li>
                {tier.parentDashboard ? '\u2705' : '\u274C'} Full parent
                dashboard
              </li>
              <li>
                {tier.prioritySupport ? '\u2705' : '\u274C'} Priority support
              </li>
            </ul>
            {tier.tier !== 'free' &&
              subscription?.tier !== tier.tier && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() =>
                    handleUpgrade(tier.tier as 'family' | 'classroom')
                  }
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Please wait…' : `Upgrade to ${capitalize(tier.tier)}`}
                </button>
              )}
            {subscription?.tier === tier.tier && (
              <div className="billing__current-badge">Current plan</div>
            )}
          </div>
        ))}
      </div>

      {error && <div className="billing__error">{error}</div>}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
