import { useEffect, useState } from 'react';
import type { Badge, EarnedBadge } from '../../../shared/types';

interface RewardPopupProps {
  xpGained: number;
  newBadges: EarnedBadge[];
  catalog: Badge[];
  onClose: () => void;
}

/**
 * Celebration overlay shown when XP or badges are earned.
 * Auto-dismisses after ~3 seconds. Click anywhere to close.
 */
export default function RewardPopup({
  xpGained,
  newBadges,
  catalog,
  onClose,
}: RewardPopupProps) {
  const [displayXP, setDisplayXP] = useState(0);

  // Count-up animation for XP number
  useEffect(() => {
    if (xpGained <= 0) {
      setDisplayXP(0);
      return;
    }
    const duration = 1000;
    const steps = 30;
    const stepTime = duration / steps;
    let current = 0;
    const inc = xpGained / steps;
    const timer = window.setInterval(() => {
      current += inc;
      if (current >= xpGained) {
        setDisplayXP(xpGained);
        window.clearInterval(timer);
      } else {
        setDisplayXP(Math.floor(current));
      }
    }, stepTime);
    return () => window.clearInterval(timer);
  }, [xpGained]);

  // Auto-dismiss
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  const catalogMap = new Map<string, Badge>();
  for (const b of catalog) catalogMap.set(b.id, b);

  // Generate confetti particles
  const confettiCount = 24;
  const confettiColors = [
    '#6C63FF',
    '#4ECDC4',
    '#FF6B6B',
    '#F1C40F',
    '#2ECC71',
  ];

  return (
    <div
      className="reward-popup"
      onClick={onClose}
      role="alertdialog"
      aria-label="Reward earned"
    >
      <div className="reward-popup__flash" aria-hidden="true" />
      <div className="reward-popup__confetti" aria-hidden="true">
        {Array.from({ length: confettiCount }).map((_, i) => (
          <div
            key={i}
            className="reward-popup__confetti-piece"
            style={{
              left: `${(i / confettiCount) * 100}%`,
              background: confettiColors[i % confettiColors.length],
              animationDelay: `${(i % 6) * 0.08}s`,
              transform: `rotate(${(i * 37) % 360}deg)`,
            }}
          />
        ))}
      </div>

      <div
        className="reward-popup__card"
        onClick={(e) => e.stopPropagation()}
      >
        {xpGained > 0 && (
          <div className="reward-popup__xp">
            <div className="reward-popup__xp-label">You earned</div>
            <div className="reward-popup__xp-value">+{displayXP} Curiosity Points!</div>
          </div>
        )}

        {newBadges.length > 0 && (
          <div className="reward-popup__badges">
            {newBadges.map((earned) => {
              const badge = catalogMap.get(earned.badgeId);
              if (!badge) return null;
              return (
                <div key={earned.badgeId} className="reward-popup__badge">
                  <div className="reward-popup__badge-banner">
                    Badge Unlocked!
                  </div>
                  <div className="reward-popup__badge-icon">{badge.icon}</div>
                  <div className="reward-popup__badge-name">{badge.name}</div>
                  <div className="reward-popup__badge-desc">
                    {badge.description}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="reward-popup__dismiss"
          onClick={onClose}
        >
          Awesome!
        </button>
      </div>
    </div>
  );
}
