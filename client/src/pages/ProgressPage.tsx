import { useEffect, useState } from 'react';
import type {
  Badge,
  EarnedBadge,
  Streak,
  XPEvent,
  XPStats,
} from '../../../shared/types';
import XPBar from '../components/XPBar';
import StreakBadge from '../components/StreakBadge';
import BadgeShelf from '../components/BadgeShelf';
import {
  fetchBadgeCatalog,
  fetchGamificationStats,
} from '../api/engagement';

interface ProgressPageProps {
  childId: string;
  onClose: () => void;
}

function formatTimeAgo(ts: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(ts).toLocaleDateString();
}

function humanizeEventType(type: string): string {
  switch (type) {
    case 'message_sent':
      return 'Asked a question';
    case 'experiment_designed':
      return 'Designed an experiment';
    case 'experiment_started':
      return 'Started an experiment';
    case 'step_completed':
      return 'Completed a step';
    case 'experiment_completed':
      return 'Finished an experiment';
    case 'notebook_entry_created':
      return 'Wrote in lab notebook';
    case 'reflection_answered':
      return 'Answered a reflection';
    case 'syllabus_topic_explored':
      return 'Explored a syllabus topic';
    case 'streak_day':
      return 'Daily check-in';
    case 'badge_earned':
      return 'Earned a badge';
    default:
      return type.replace(/_/g, ' ');
  }
}

function eventSummary(event: XPEvent): string {
  const base = humanizeEventType(event.type);
  const title = event.metadata?.experimentTitle ?? event.metadata?.title;
  if (title) return `${base} — ${title}`;
  return base;
}

/**
 * Kid's progress dashboard: XP, streak, badges, recent XP timeline.
 */
export default function ProgressPage({ childId, onClose }: ProgressPageProps) {
  const [stats, setStats] = useState<XPStats | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [events, setEvents] = useState<XPEvent[]>([]);
  const [catalog, setCatalog] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, catalogRes] = await Promise.all([
          fetchGamificationStats(childId),
          fetchBadgeCatalog(),
        ]);
        if (cancelled) return;
        setStats(statsRes.stats);
        setStreak(statsRes.streak);
        setEarned(statsRes.earnedBadges);
        setEvents(statsRes.recentEvents);
        setCatalog(catalogRes);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load progress:', err);
        setError('Could not load your progress. Try again in a moment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  return (
    <div className="progress-page">
      <header className="progress-page__header">
        <button
          type="button"
          className="progress-page__back"
          onClick={onClose}
          aria-label="Back to chat"
        >
          &larr; Back to Chat
        </button>
        <h1 className="progress-page__title">Your Progress</h1>
        <p className="progress-page__subtitle">
          Keep exploring to earn more Curiosity Points and unlock badges!
        </p>
      </header>

      <div className="progress-page__body">
        {loading && (
          <div className="progress-page__loading">Loading your progress…</div>
        )}
        {error && <div className="progress-page__error">{error}</div>}

        {!loading && !error && stats && streak && (
          <>
            <section className="progress-page__hero">
              <div className="progress-page__level-circle">
                <div className="progress-page__level-num">{stats.level}</div>
                <div className="progress-page__level-label">CURIOSITY LEVEL</div>
              </div>
              <div className="progress-page__xp-wrap">
                <XPBar stats={stats} />
              </div>
            </section>

            <section className="progress-page__section">
              <StreakBadge streak={streak} />
            </section>

            <section className="progress-page__section">
              <BadgeShelf earned={earned} catalog={catalog} />
            </section>

            <section className="progress-page__section">
              <h3 className="progress-page__section-title">Recent Activity</h3>
              {events.length === 0 ? (
                <div className="progress-page__empty">
                  No activity yet. Start exploring to earn Curiosity Points!
                </div>
              ) : (
                <ul className="progress-page__timeline">
                  {events.map((event) => (
                    <li key={event.id} className="progress-page__event">
                      <div className="progress-page__event-xp">
                        +{event.amount}
                      </div>
                      <div className="progress-page__event-body">
                        <div className="progress-page__event-title">
                          {eventSummary(event)}
                        </div>
                        <div className="progress-page__event-time">
                          {formatTimeAgo(event.createdAt)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
