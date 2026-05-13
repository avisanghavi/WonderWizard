import { useEffect, useMemo, useState } from 'react';
import type { XPEvent, XPEventType } from '../../../shared/types';
import { fetchGamificationStats } from '../api/engagement';

interface HistoryPageProps {
  childId: string;
  onClose: () => void;
}

type FilterKey = 'all' | 'experiments' | 'notebook' | 'chat';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'experiments', label: 'Experiments' },
  { key: 'notebook', label: 'Notebook' },
  { key: 'chat', label: 'Chat' },
];

function classifyEvent(type: XPEventType): FilterKey {
  switch (type) {
    case 'experiment_designed':
    case 'experiment_started':
    case 'experiment_completed':
    case 'step_completed':
    case 'syllabus_topic_explored':
      return 'experiments';
    case 'notebook_entry_created':
    case 'reflection_answered':
      return 'notebook';
    case 'message_sent':
      return 'chat';
    default:
      return 'all';
  }
}

function iconFor(type: XPEventType): string {
  switch (type) {
    case 'experiment_designed':
      return '\uD83E\uDDEA'; // test tube
    case 'experiment_started':
      return '\uD83D\uDE80'; // rocket
    case 'experiment_completed':
      return '\uD83C\uDFC6'; // trophy
    case 'step_completed':
      return '\u2705'; // checkmark
    case 'notebook_entry_created':
      return '\uD83D\uDCD3'; // notebook
    case 'reflection_answered':
      return '\uD83D\uDCAD'; // thought bubble
    case 'syllabus_topic_explored':
      return '\uD83D\uDCDA'; // books
    case 'message_sent':
      return '\uD83D\uDCAC'; // speech bubble
    case 'streak_day':
      return '\uD83D\uDD25'; // flame
    case 'badge_earned':
      return '\uD83C\uDF96\uFE0F'; // medal
    default:
      return '\u2728';
  }
}

function titleFor(event: XPEvent): string {
  const title = event.metadata?.experimentTitle ?? event.metadata?.title;
  switch (event.type) {
    case 'experiment_designed':
      return title ? `Designed: ${title}` : 'Designed an experiment';
    case 'experiment_started':
      return title ? `Started: ${title}` : 'Started an experiment';
    case 'experiment_completed':
      return title ? `Completed: ${title}` : 'Completed an experiment';
    case 'step_completed':
      return 'Checked off a step';
    case 'notebook_entry_created':
      return title ? `Wrote about: ${title}` : 'Wrote in lab notebook';
    case 'reflection_answered':
      return 'Answered a reflection';
    case 'syllabus_topic_explored':
      return title ? `Explored: ${title}` : 'Explored a syllabus topic';
    case 'message_sent':
      return 'Asked a question';
    case 'streak_day':
      return 'Daily check-in';
    case 'badge_earned':
      return 'Earned a badge';
    default:
      return event.type.replace(/_/g, ' ');
  }
}

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function groupLabel(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const weekAgo = startOfToday - 6 * 86_400_000;

  if (ts >= startOfToday) return 'Today';
  if (ts >= startOfYesterday) return 'Yesterday';
  if (ts >= weekAgo) return 'Last Week';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'long',
    year: sameYear ? undefined : 'numeric',
  });
}

/**
 * Experiment + activity history timeline, grouped by date.
 */
export default function HistoryPage({ childId, onClose }: HistoryPageProps) {
  const [events, setEvents] = useState<XPEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchGamificationStats(childId);
        if (cancelled) return;
        // Sort newest first just in case
        const sorted = [...data.recentEvents].sort(
          (a, b) => b.createdAt - a.createdAt,
        );
        setEvents(sorted);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load history:', err);
        setError('Could not load your history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => classifyEvent(e.type) === filter);
  }, [events, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, XPEvent[]>();
    for (const event of filtered) {
      const key = groupLabel(event.createdAt);
      const arr = map.get(key);
      if (arr) arr.push(event);
      else map.set(key, [event]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="history-page">
      <header className="history-page__header">
        <button
          type="button"
          className="history-page__back"
          onClick={onClose}
          aria-label="Back to chat"
        >
          &larr; Back to Chat
        </button>
        <h1 className="history-page__title">Your History</h1>
        <p className="history-page__subtitle">
          Everything you've explored so far
        </p>
      </header>

      <div className="history-page__filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`history-page__filter${
              filter === f.key ? ' history-page__filter--active' : ''
            }`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="history-page__body">
        {loading && (
          <div className="history-page__loading">Loading history…</div>
        )}
        {error && <div className="history-page__error">{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div className="history-page__empty">
            <div className="history-page__empty-icon">{'\uD83D\uDD2D'}</div>
            <div className="history-page__empty-text">
              No experiments yet. Start exploring!
            </div>
          </div>
        )}

        {!loading && !error && grouped.length > 0 && (
          <div className="history-timeline">
            {grouped.map(([label, groupEvents]) => (
              <div key={label} className="history-timeline__group">
                <h3 className="history-timeline__group-label">{label}</h3>
                <ul className="history-timeline__list">
                  {groupEvents.map((event) => {
                    const category = classifyEvent(event.type);
                    return (
                      <li key={event.id} className="history-timeline__item">
                        <div className="history-timeline__icon" aria-hidden="true">
                          {iconFor(event.type)}
                        </div>
                        <div className="history-timeline__content">
                          <div className="history-timeline__title">
                            {titleFor(event)}
                          </div>
                          <div className="history-timeline__meta">
                            <span className="history-timeline__time">
                              {timeAgo(event.createdAt)}
                            </span>
                            <span
                              className={`history-timeline__tag history-timeline__tag--${category}`}
                            >
                              {category}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
