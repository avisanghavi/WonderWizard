import type { SubscriptionTier } from '../../../shared/types';

interface SubscriptionBadgeProps {
  tier: SubscriptionTier;
  status?: string;
}

const TIER_LABELS: Record<SubscriptionTier, { label: string; icon: string }> = {
  free: { label: 'Free', icon: '' },
  family: { label: 'Family', icon: '\u2B50' },
  classroom: { label: 'Classroom', icon: '\uD83C\uDFEB' },
};

export default function SubscriptionBadge({
  tier,
  status,
}: SubscriptionBadgeProps) {
  const { label, icon } = TIER_LABELS[tier];
  const isTrial = status === 'trialing';

  return (
    <span
      className={`subscription-badge subscription-badge--${tier}`}
      aria-label={`Subscription tier: ${label}${isTrial ? ' (trial)' : ''}`}
    >
      <span className="subscription-badge__label">{label}</span>
      {icon && <span className="subscription-badge__icon">{icon}</span>}
      {isTrial && (
        <span className="subscription-badge__trial">(Trial)</span>
      )}
    </span>
  );
}
