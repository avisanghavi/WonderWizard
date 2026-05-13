import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ActivityLogEntry } from '../../../shared/types';
import { fetchActivity } from '../api/parent';

interface ActivityFeedProps {
  childId: string;
}

type FilterType = 'all' | 'experiments' | 'chat' | 'notebook';

const PAGE_SIZE = 25;

function iconForActivityType(type: ActivityLogEntry['type']): string {
  switch (type) {
    case 'chat_message':
      return '\uD83D\uDCAC';
    case 'experiment_designed':
      return '\uD83E\uDDEA';
    case 'experiment_completed':
      return '\u2705';
    case 'step_completed':
      return '\u25B6\uFE0F';
    case 'notebook_entry':
      return '\uD83D\uDCD3';
    case 'topic_explored':
      return '\uD83D\uDDFA\uFE0F';
    case 'login':
      return '\uD83D\uDD11';
    default:
      return '\u2728';
  }
}

function matchesFilter(entry: ActivityLogEntry, filter: FilterType): boolean {
  if (filter === 'all') return true;
  if (filter === 'experiments') {
    return (
      entry.type === 'experiment_designed' ||
      entry.type === 'experiment_completed' ||
      entry.type === 'step_completed'
    );
  }
  if (filter === 'chat') return entry.type === 'chat_message';
  if (filter === 'notebook') return entry.type === 'notebook_entry';
  return true;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function dayLabel(key: string): string {
  const d = new Date(key);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function ActivityFeed({ childId }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchActivity(childId, PAGE_SIZE, nextOffset);
        const list = res.activity || [];
        setEntries((prev) => (append ? [...prev, ...list] : list));
        setHasMore(list.length === PAGE_SIZE);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load activity.'
        );
      } finally {
        setLoading(false);
      }
    },
    [childId]
  );

  useEffect(() => {
    setOffset(0);
    setEntries([]);
    setHasMore(true);
    load(0, false);
  }, [childId, load]);

  const handleLoadMore = useCallback(() => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    load(next, true);
  }, [offset, load]);

  const filtered = useMemo(
    () => entries.filter((e) => matchesFilter(e, filter)),
    [entries, filter]
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, ActivityLogEntry[]>();
    for (const e of filtered) {
      const key = dayKey(e.createdAt);
      const arr = groups.get(key) || [];
      arr.push(e);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).sort((a, b) =>
      a[0] < b[0] ? 1 : -1
    );
  }, [filtered]);

  return (
    <div className="activity-feed">
      <div className="activity-feed__header">
        <h2>Activity Feed</h2>
        <div className="activity-feed__filters">
          {(['all', 'experiments', 'chat', 'notebook'] as FilterType[]).map(
            (f) => (
              <button
                key={f}
                type="button"
                className={`filter-pill${filter === f ? ' is-active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            )
          )}
        </div>
      </div>

      {error && <div className="activity-feed__error">{error}</div>}

      {loading && entries.length === 0 && (
        <div className="activity-feed__loading">Loading activity…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="activity-feed__empty">
          No activity matching this filter yet.
        </div>
      )}

      {grouped.map(([key, items]) => (
        <div key={key} className="activity-feed__day">
          <h3 className="activity-feed__day-label">{dayLabel(key)}</h3>
          <ul className="activity-feed__list">
            {items.map((entry) => (
              <li key={entry.id} className="activity-feed__item">
                <span className="activity-feed__item-icon">
                  {iconForActivityType(entry.type)}
                </span>
                <div className="activity-feed__item-body">
                  <div className="activity-feed__item-summary">
                    {entry.summary}
                  </div>
                  <div className="activity-feed__item-time">
                    {new Date(entry.createdAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {hasMore && entries.length > 0 && (
        <div className="activity-feed__load-more">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleLoadMore}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
