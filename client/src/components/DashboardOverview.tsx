import { useState, useEffect } from 'react';
import type { ActivityLogEntry } from '../../../shared/types';
import { fetchChildSummary, type ChildSummary } from '../api/parent';

interface DashboardOverviewProps {
  childId: string;
  onViewFullActivity?: () => void;
}

function formatActivitySummary(entry: ActivityLogEntry): string {
  return entry.summary || entry.type.replace(/_/g, ' ');
}

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

export default function DashboardOverview({
  childId,
  onViewFullActivity,
}: DashboardOverviewProps) {
  const [summary, setSummary] = useState<ChildSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchChildSummary(childId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load summary.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (loading) {
    return (
      <div className="dashboard-overview">
        <div className="dashboard-overview__loading">Loading overview…</div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="dashboard-overview">
        <div className="dashboard-overview__error">
          {error || 'No data available for this child yet.'}
        </div>
      </div>
    );
  }

  const dailyLimit = summary.dailyLimit ?? 0;
  const screenTimePct =
    dailyLimit > 0
      ? Math.min(100, Math.round((summary.minutesToday / dailyLimit) * 100))
      : 0;

  return (
    <div className="dashboard-overview">
      <h2 className="dashboard-overview__heading">
        {summary.child.name}&apos;s Overview
      </h2>

      <div className="dashboard-overview__grid">
        <div className="dashboard-overview__metric-card metric--purple">
          <div className="metric-card__icon">{'\u2B50'}</div>
          <div className="metric-card__label">Total XP</div>
          <div className="metric-card__value">{summary.totalXP}</div>
          <div className="metric-card__sub">Level {summary.level}</div>
        </div>

        <div className="dashboard-overview__metric-card metric--orange">
          <div className="metric-card__icon">{'\uD83D\uDD25'}</div>
          <div className="metric-card__label">Current Streak</div>
          <div className="metric-card__value">{summary.currentStreak}</div>
          <div className="metric-card__sub">
            {summary.currentStreak === 1 ? 'day' : 'days'}
          </div>
        </div>

        <div className="dashboard-overview__metric-card metric--teal">
          <div className="metric-card__icon">{'\uD83E\uDDEA'}</div>
          <div className="metric-card__label">Experiments</div>
          <div className="metric-card__value">{summary.experimentsCompleted}</div>
          <div className="metric-card__sub">completed</div>
        </div>

        <div className="dashboard-overview__metric-card metric--pink">
          <div className="metric-card__icon">{'\uD83D\uDCD3'}</div>
          <div className="metric-card__label">Notebook</div>
          <div className="metric-card__value">{summary.notebookEntries}</div>
          <div className="metric-card__sub">entries</div>
        </div>

        <div className="dashboard-overview__metric-card dashboard-overview__metric-card--wide metric--blue">
          <div className="metric-card__icon">{'\u23F1\uFE0F'}</div>
          <div className="metric-card__label">Screen Time Today</div>
          <div className="metric-card__value">
            {summary.minutesToday} min
            {dailyLimit > 0 && (
              <span className="metric-card__limit"> / {dailyLimit} min</span>
            )}
          </div>
          {dailyLimit > 0 && (
            <div className="progress-bar">
              <div
                className="progress-bar__fill"
                style={{ width: `${screenTimePct}%` }}
              />
            </div>
          )}
        </div>

        <div className="dashboard-overview__metric-card metric--green">
          <div className="metric-card__icon">{'\uD83D\uDCC5'}</div>
          <div className="metric-card__label">This Week</div>
          <div className="metric-card__value">{summary.minutesThisWeek}</div>
          <div className="metric-card__sub">minutes</div>
        </div>
      </div>

      <div className="dashboard-overview__recent">
        <div className="dashboard-overview__recent-header">
          <h3>Recent activity</h3>
          {onViewFullActivity && (
            <button
              type="button"
              className="link-btn"
              onClick={onViewFullActivity}
            >
              View full activity &rarr;
            </button>
          )}
        </div>
        {summary.recentActivity.length === 0 ? (
          <div className="dashboard-overview__empty">
            No activity yet. Encourage your kid to start exploring!
          </div>
        ) : (
          <ul className="dashboard-overview__activity-list">
            {summary.recentActivity.slice(0, 5).map((entry) => (
              <li key={entry.id} className="dashboard-overview__activity-item">
                <span className="dashboard-overview__activity-icon">
                  {iconForActivityType(entry.type)}
                </span>
                <span className="dashboard-overview__activity-text">
                  {formatActivitySummary(entry)}
                </span>
                <span className="dashboard-overview__activity-time">
                  {new Date(entry.createdAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
