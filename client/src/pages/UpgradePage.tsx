import { useCallback, useEffect, useState } from 'react';
import type { ParentAccount, SubscriptionTier } from '../../../shared/types';
import {
  fetchSubscription,
  fetchTiers,
  createCheckout,
  type TierDisplay,
} from '../api/billing';
import { hasSession } from '../api/parent';
import AuthModal from '../components/AuthModal';
import '../billing.css';

interface UpgradePageProps {
  onClose: () => void;
}

type BillingPeriod = 'monthly' | 'yearly';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes, cancel from your parent dashboard.',
  },
  {
    question: 'What happens to my data if I cancel?',
    answer: 'Your data stays yours. You can export anytime.',
  },
  {
    question: 'Is there a student discount?',
    answer: 'Classroom tier includes bulk pricing for schools.',
  },
  {
    question: 'Do you offer refunds?',
    answer: 'Full refund within 14 days, no questions asked.',
  },
];

interface ComparisonRow {
  label: string;
  free: string;
  family: string;
  classroom: string;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: 'Experiments per day',
    free: '3',
    family: 'Unlimited',
    classroom: 'Unlimited',
  },
  {
    label: 'Child profiles',
    free: '1',
    family: '3',
    classroom: '35',
  },
  {
    label: 'Syllabus uploads',
    free: 'no',
    family: 'yes',
    classroom: 'yes',
  },
  {
    label: 'DIY guides',
    free: 'no',
    family: 'yes',
    classroom: 'yes',
  },
  {
    label: 'Lab notebook',
    free: 'no',
    family: 'yes',
    classroom: 'yes',
  },
  {
    label: 'Parent dashboard',
    free: 'Basic',
    family: 'Full',
    classroom: 'Full',
  },
  {
    label: 'Priority support',
    free: 'no',
    family: 'no',
    classroom: 'yes',
  },
];

function formatPrice(n: number): string {
  if (n === 0) return '$0';
  if (Number.isInteger(n)) return `$${n}`;
  return `$${n.toFixed(2)}`;
}

function renderCell(value: string): React.ReactNode {
  if (value === 'yes') {
    return (
      <span className="feature-table__check" aria-label="Included">
        {'\u2713'}
      </span>
    );
  }
  if (value === 'no') {
    return (
      <span className="feature-table__cross" aria-label="Not included">
        {'\u00D7'}
      </span>
    );
  }
  return <span className="feature-table__value">{value}</span>;
}

function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="faq-section">
      {items.map((item, idx) => {
        const open = openIdx === idx;
        return (
          <div
            key={item.question}
            className={`faq-item${open ? ' faq-item--open' : ''}`}
          >
            <button
              type="button"
              className="faq-item__question"
              aria-expanded={open}
              onClick={() => setOpenIdx(open ? null : idx)}
            >
              <span>{item.question}</span>
              <span className="faq-item__chevron" aria-hidden="true">
                {open ? '\u2212' : '+'}
              </span>
            </button>
            {open && <div className="faq-item__answer">{item.answer}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function UpgradePage({ onClose }: UpgradePageProps) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [tiers, setTiers] = useState<TierDisplay[] | null>(null);
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('free');
  const [loading, setLoading] = useState(false);
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTier, setPendingTier] =
    useState<'family' | 'classroom' | null>(null);

  // Load tiers + current subscription
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const tiersRes = await fetchTiers();
        if (cancelled) return;
        setTiers(tiersRes.tiers);
      } catch {
        /* fall back to defaults inside fetchTiers */
      }

      if (hasSession()) {
        try {
          const sub = await fetchSubscription();
          if (!cancelled) setCurrentTier(sub.tier);
        } catch {
          /* unauthenticated or error — leave as free */
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpgrade = useCallback(
    async (tier: 'family' | 'classroom') => {
      setError(null);
      setSuccessMessage(null);

      if (!hasSession()) {
        setPendingTier(tier);
        setShowAuthModal(true);
        return;
      }

      setLoadingTier(tier);
      try {
        const res = await createCheckout(tier, period);
        if (res.url.startsWith('http://') || res.url.startsWith('https://')) {
          // Real Stripe URL — redirect.
          window.location.href = res.url;
          return;
        }
        // Stub URL — show success and refresh the subscription state.
        setSuccessMessage(
          `Upgrade to ${tier} confirmed (dev stub). Your plan will refresh shortly.`
        );
        try {
          const sub = await fetchSubscription();
          setCurrentTier(sub.tier);
        } catch {
          /* ignore */
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start checkout.');
      } finally {
        setLoadingTier(null);
      }
    },
    [period]
  );

  const handleAuthSuccess = useCallback(
    async (_userId: string) => {
      setShowAuthModal(false);
      const tier = pendingTier;
      setPendingTier(null);
      if (tier) {
        // After login/signup, re-run the upgrade flow.
        await handleUpgrade(tier);
      }
    },
    [pendingTier, handleUpgrade]
  );

  const yearlyFamilySavings =
    (() => {
      const family = tiers?.find((t) => t.id === 'family');
      if (!family || !family.yearlyPrice) return null;
      const annualMonthly = family.price * 12;
      const saved = annualMonthly - family.yearlyPrice;
      if (saved <= 0) return null;
      return Math.round(saved);
    })();

  const getDisplayPrice = (tier: TierDisplay): { amount: string; suffix: string } => {
    if (tier.id === 'free') {
      return { amount: formatPrice(0), suffix: 'forever' };
    }
    if (period === 'yearly' && tier.yearlyPrice) {
      return {
        amount: formatPrice(tier.yearlyPrice),
        suffix: '/year',
      };
    }
    return {
      amount: formatPrice(tier.price),
      suffix: '/month',
    };
  };

  const getTierCta = (tier: TierDisplay) => {
    if (tier.id === 'free') {
      const isCurrent = currentTier === 'free';
      return {
        label: isCurrent ? 'Current Plan' : 'Downgrade',
        disabled: isCurrent,
      };
    }
    if (tier.id === 'family') {
      const isCurrent = currentTier === 'family';
      return {
        label: isCurrent ? 'Current Plan' : 'Start Free Trial',
        disabled: isCurrent,
      };
    }
    // classroom
    const isCurrent = currentTier === 'classroom';
    return {
      label: isCurrent ? 'Current Plan' : 'Upgrade',
      disabled: isCurrent,
    };
  };

  const tiersToRender = tiers ?? [];

  return (
    <div className="upgrade-page" role="dialog" aria-label="Choose your plan">
      <div className="upgrade-page__container">
        <header className="upgrade-page__header">
          <div className="upgrade-page__headings">
            <h1 className="upgrade-page__title">Choose your plan</h1>
            <p className="upgrade-page__subtitle">
              Unlimited curiosity for your curious kid.
            </p>
          </div>
          <button
            type="button"
            className="upgrade-page__close"
            onClick={onClose}
            aria-label="Close upgrade page"
          >
            {'\u2715'}
          </button>
        </header>

        {error && (
          <div className="upgrade-page__error" role="alert">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="upgrade-page__success" role="status">
            {successMessage}
          </div>
        )}

        <div className="period-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={period === 'monthly'}
            className={`period-toggle__option${
              period === 'monthly' ? ' period-toggle__option--active' : ''
            }`}
            onClick={() => setPeriod('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={period === 'yearly'}
            className={`period-toggle__option${
              period === 'yearly' ? ' period-toggle__option--active' : ''
            }`}
            onClick={() => setPeriod('yearly')}
          >
            Yearly
            {yearlyFamilySavings != null && (
              <span className="period-toggle__savings">
                Save ${yearlyFamilySavings}
              </span>
            )}
          </button>
        </div>

        {loading && tiersToRender.length === 0 ? (
          <div className="upgrade-page__loading">Loading plans...</div>
        ) : (
          <div className="tier-cards">
            {tiersToRender.map((tier) => {
              const priceInfo = getDisplayPrice(tier);
              const cta = getTierCta(tier);
              const isPopular = tier.id === 'family';
              const isCurrent = currentTier === tier.id;
              const busy = loadingTier === tier.id;

              return (
                <div
                  key={tier.id}
                  className={`tier-card tier-card--${tier.id}${
                    isPopular ? ' tier-card--popular' : ''
                  }${isCurrent ? ' tier-card--current' : ''}`}
                >
                  {isPopular && (
                    <div className="tier-card__ribbon">Most Popular</div>
                  )}
                  {isCurrent && (
                    <div className="tier-card__current-badge">
                      Current Plan
                    </div>
                  )}
                  <h2 className="tier-card__name">{tier.name}</h2>
                  <div className="tier-card__price">
                    <span className="tier-card__amount">
                      {priceInfo.amount}
                    </span>
                    <span className="tier-card__suffix">
                      {priceInfo.suffix}
                    </span>
                  </div>
                  <ul className="tier-card__features">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="tier-card__feature-item"
                      >
                        <span
                          className="tier-card__feature-check"
                          aria-hidden="true"
                        >
                          {'\u2713'}
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="tier-card__cta"
                    disabled={cta.disabled || busy}
                    onClick={() => {
                      if (tier.id === 'family' || tier.id === 'classroom') {
                        void handleUpgrade(tier.id);
                      }
                    }}
                  >
                    {busy ? 'Starting...' : cta.label}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <section className="feature-table-section">
          <h2 className="feature-table-section__title">
            Compare features
          </h2>
          <div className="feature-table-wrap">
            <table className="feature-table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Free</th>
                  <th scope="col" className="feature-table__col--popular">
                    Family
                  </th>
                  <th scope="col">Classroom</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{renderCell(row.free)}</td>
                    <td className="feature-table__col--popular">
                      {renderCell(row.family)}
                    </td>
                    <td>{renderCell(row.classroom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="faq-section-wrap">
          <h2 className="faq-section-wrap__title">
            Frequently asked questions
          </h2>
          <FaqAccordion items={FAQS} />
        </section>
      </div>

      {showAuthModal && (
        <AuthModal
          mode="signup"
          onClose={() => {
            setShowAuthModal(false);
            setPendingTier(null);
          }}
          onSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}
