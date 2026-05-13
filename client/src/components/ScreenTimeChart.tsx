import { useState, useEffect, useMemo } from 'react';
import type { ScreenTimeUsage } from '../../../shared/types';
import { fetchScreenTime } from '../api/parent';

interface ScreenTimeChartProps {
  childId: string;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ScreenTimeChart({ childId }: ScreenTimeChartProps) {
  const [usage, setUsage] = useState<ScreenTimeUsage[]>([]);
  const [dailyLimit, setDailyLimit] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchScreenTime(childId, 7)
      .then((res) => {
        if (cancelled) return;
        setUsage(res.usage || []);
        setDailyLimit(res.dailyLimit);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load screen time.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  // Build a 7-day window ending today.
  const days = useMemo(() => {
    const out: { date: string; label: string; minutes: number }[] = [];
    const usageMap = new Map<string, number>();
    for (const u of usage) {
      usageMap.set(u.date, u.minutesUsed);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      out.push({
        date: iso,
        label: DAY_ABBR[d.getDay()],
        minutes: usageMap.get(iso) || 0,
      });
    }
    return out;
  }, [usage]);

  const weeklyTotal = days.reduce((sum, d) => sum + d.minutes, 0);
  const maxMinutes = Math.max(
    dailyLimit || 0,
    ...days.map((d) => d.minutes),
    60
  );

  if (loading) {
    return (
      <div className="screen-time-chart">
        <div className="screen-time-chart__loading">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen-time-chart">
        <div className="screen-time-chart__error">{error}</div>
      </div>
    );
  }

  const limitPct =
    dailyLimit && dailyLimit > 0 ? (dailyLimit / maxMinutes) * 100 : null;

  return (
    <div className="screen-time-chart">
      <div className="screen-time-chart__header">
        <h3>Weekly Screen Time</h3>
        <div className="screen-time-chart__total">
          Total: <strong>{weeklyTotal} min</strong>
        </div>
      </div>

      <div className="screen-time-chart__bars">
        {limitPct !== null && (
          <div
            className="screen-time-chart__limit-line"
            style={{ bottom: `${limitPct}%` }}
            aria-label={`Daily limit ${dailyLimit} minutes`}
          >
            <span className="screen-time-chart__limit-label">
              {dailyLimit} min
            </span>
          </div>
        )}
        {days.map((d) => {
          const heightPct = maxMinutes > 0 ? (d.minutes / maxMinutes) * 100 : 0;
          const overLimit =
            dailyLimit !== undefined && d.minutes > dailyLimit;
          return (
            <div key={d.date} className="screen-time-chart__column">
              <div className="screen-time-chart__bar-wrap">
                <div
                  className={`screen-time-chart__bar${overLimit ? ' is-over' : ''}`}
                  style={{ height: `${heightPct}%` }}
                  title={`${d.minutes} min`}
                >
                  {d.minutes > 0 && (
                    <span className="screen-time-chart__bar-value">
                      {d.minutes}
                    </span>
                  )}
                </div>
              </div>
              <div className="screen-time-chart__day-label">{d.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
