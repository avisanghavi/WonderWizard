import type { Streak } from '../../../shared/types';

interface StreakBadgeProps {
  streak: Streak;
}

/**
 * Compact streak display with a flame emoji.
 * Pulses when the current streak is above 3 days.
 */
export default function StreakBadge({ streak }: StreakBadgeProps) {
  const isActive = streak.currentStreak > 0;
  const shouldPulse = streak.currentStreak > 3;

  if (!isActive) {
    return (
      <div className="streak-badge streak-badge--inactive">
        <div className="streak-badge__flame" aria-hidden="true">
          {'\uD83D\uDD25'}
        </div>
        <div className="streak-badge__content">
          <div className="streak-badge__title">Start your streak today!</div>
          <div className="streak-badge__sub">
            Come back every day to build your streak
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="streak-badge">
      <div
        className={`streak-badge__flame${shouldPulse ? ' streak-badge__flame--pulse' : ''}`}
        aria-hidden="true"
      >
        {'\uD83D\uDD25'}
      </div>
      <div className="streak-badge__content">
        <div className="streak-badge__title">
          {streak.currentStreak} day streak!
        </div>
        <div className="streak-badge__sub">
          Best: {streak.longestStreak} day{streak.longestStreak === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
}
