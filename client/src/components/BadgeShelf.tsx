import { useState } from 'react';
import type { Badge, EarnedBadge } from '../../../shared/types';

interface BadgeShelfProps {
  earned: EarnedBadge[];
  catalog: Badge[];
}

interface BadgeCardProps {
  badge: Badge;
  earnedAt?: number;
  isEarned: boolean;
  onClick: () => void;
}

function formatEarnedDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function BadgeCard({ badge, earnedAt, isEarned, onClick }: BadgeCardProps) {
  return (
    <button
      type="button"
      className={`badge-card${isEarned ? ' badge-card--earned' : ' badge-card--locked'}`}
      onClick={onClick}
      aria-label={`${badge.name} badge: ${isEarned ? 'earned' : 'locked'}`}
    >
      <div className="badge-card__icon" aria-hidden="true">
        {badge.icon}
        {!isEarned && (
          <div className="badge-card__lock" aria-hidden="true">
            {'\uD83D\uDD12'}
          </div>
        )}
      </div>
      <div className="badge-card__name">{badge.name}</div>
      <div className="badge-card__desc">
        {isEarned && earnedAt
          ? `Earned ${formatEarnedDate(earnedAt)}`
          : `${badge.criteria.threshold} ${badge.criteria.type.replace(/_/g, ' ')}`}
      </div>
    </button>
  );
}

/**
 * Grid of all badges with earned/locked states and a detail popup.
 */
export default function BadgeShelf({ earned, catalog }: BadgeShelfProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const earnedMap = new Map<string, EarnedBadge>();
  for (const e of earned) {
    earnedMap.set(e.badgeId, e);
  }

  const earnedCount = earned.length;
  const totalCount = catalog.length;

  // Sort: earned badges first, then locked (by threshold asc)
  const sorted = [...catalog].sort((a, b) => {
    const aEarned = earnedMap.has(a.id) ? 0 : 1;
    const bEarned = earnedMap.has(b.id) ? 0 : 1;
    if (aEarned !== bEarned) return aEarned - bEarned;
    return a.criteria.threshold - b.criteria.threshold;
  });

  const selected = selectedId ? catalog.find((b) => b.id === selectedId) : null;
  const selectedEarned = selectedId ? earnedMap.get(selectedId) : undefined;

  return (
    <div className="badge-shelf">
      <div className="badge-shelf__header">
        <h3 className="badge-shelf__title">Badges</h3>
        <span className="badge-shelf__count">
          {earnedCount} / {totalCount} earned
        </span>
      </div>
      <div className="badge-shelf__grid">
        {sorted.map((badge) => (
          <BadgeCard
            key={badge.id}
            badge={badge}
            earnedAt={earnedMap.get(badge.id)?.earnedAt}
            isEarned={earnedMap.has(badge.id)}
            onClick={() => setSelectedId(badge.id)}
          />
        ))}
      </div>

      {selected && (
        <div
          className="badge-shelf__modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="badge-shelf__popup"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="badge-shelf__popup-close"
              aria-label="Close"
              onClick={() => setSelectedId(null)}
            >
              &times;
            </button>
            <div className="badge-shelf__popup-icon">{selected.icon}</div>
            <h4 className="badge-shelf__popup-name">{selected.name}</h4>
            <p className="badge-shelf__popup-desc">{selected.description}</p>
            <div className="badge-shelf__popup-meta">
              <span className="badge-shelf__popup-category">
                {selected.category}
              </span>
              <span className="badge-shelf__popup-xp">
                +{selected.xpReward} XP
              </span>
            </div>
            {selectedEarned ? (
              <div className="badge-shelf__popup-earned">
                Earned {formatEarnedDate(selectedEarned.earnedAt)}
              </div>
            ) : (
              <div className="badge-shelf__popup-locked">
                Requires: {selected.criteria.threshold}{' '}
                {selected.criteria.type.replace(/_/g, ' ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
