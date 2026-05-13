import type { XPStats } from '../../../shared/types';

interface XPBarProps {
  stats: XPStats;
  compact?: boolean;
}

/**
 * Horizontal XP progress bar with a level badge.
 *
 * `compact` renders a tiny inline badge + mini progress bar for headers,
 * while the full mode shows the full numeric XP text.
 */
export default function XPBar({ stats, compact = false }: XPBarProps) {
  const pct = Math.max(0, Math.min(1, stats.progressToNextLevel)) * 100;
  // Current-level XP math: we don't get raw current/max from the API, so we
  // derive a display-only estimate from the progress fraction and xpToNextLevel.
  const currentLevelXP = Math.round(
    stats.xpToNextLevel > 0 && pct > 0
      ? (pct / 100) * ((stats.xpToNextLevel / (1 - pct / 100 || 1)) || 0)
      : 0,
  );
  const maxLevelXP = currentLevelXP + stats.xpToNextLevel;

  if (compact) {
    return (
      <div
        className="xp-bar xp-bar--compact"
        aria-label={`Curiosity Level ${stats.level}`}
        title={`Curiosity Level ${stats.level}`}
      >
        <div className="xp-bar__badge xp-bar__badge--sm">{stats.level}</div>
        <div className="xp-bar__track xp-bar__track--sm">
          <div className="xp-bar__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="xp-bar" aria-label={`Curiosity Level ${stats.level} progress`}>
      <div className="xp-bar__header">
        <div className="xp-bar__badge" title={`Curiosity Level ${stats.level}`}>
          <span className="xp-bar__badge-label">Lv</span>
          <span className="xp-bar__badge-num">{stats.level}</span>
        </div>
        <div className="xp-bar__meta">
          <div className="xp-bar__xp-text">
            {maxLevelXP > 0 ? `${currentLevelXP} / ${maxLevelXP}` : stats.totalXP} CP
          </div>
          <div className="xp-bar__total">
            {stats.totalXP.toLocaleString()} total Curiosity Points
          </div>
        </div>
      </div>
      <div className="xp-bar__track">
        <div className="xp-bar__fill" style={{ width: `${pct}%` }}>
          <div className="xp-bar__fill-shine" />
        </div>
      </div>
      <div className="xp-bar__next">
        {stats.xpToNextLevel > 0
          ? `${stats.xpToNextLevel} CP to Curiosity Level ${stats.level + 1}`
          : 'Max level!'}
      </div>
    </div>
  );
}
