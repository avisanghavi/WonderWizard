import {
  useState,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from 'react';
import type { ParentalControls } from '../../../shared/types';
import { fetchControls, updateControls } from '../api/parent';

interface ParentalControlsPanelProps {
  childId: string;
}

const CATEGORY_OPTIONS = [
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'physics', label: 'Physics' },
  { id: 'biology', label: 'Biology' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'math', label: 'Math' },
  { id: 'writing', label: 'Writing' },
  { id: 'art', label: 'Art' },
  { id: 'history', label: 'History' },
];

export default function ParentalControlsPanel({
  childId,
}: ParentalControlsPanelProps) {
  const [controls, setControls] = useState<ParentalControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Form fields
  const [dailyMinutes, setDailyMinutes] = useState<number>(60);
  const [unlimited, setUnlimited] = useState(false);
  const [blockedCategories, setBlockedCategories] = useState<string[]>([]);
  const [blockedKeywords, setBlockedKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [requireApprovalForYellow, setRequireApprovalForYellow] =
    useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchControls(childId)
      .then((res) => {
        if (cancelled) return;
        const c = res.controls;
        setControls(c);
        if (c.dailyScreenTimeMinutes === undefined) {
          setUnlimited(true);
          setDailyMinutes(60);
        } else {
          setUnlimited(false);
          setDailyMinutes(c.dailyScreenTimeMinutes);
        }
        setBlockedCategories(c.blockedCategories || []);
        setBlockedKeywords(c.blockedKeywords || []);
        setRequireApprovalForYellow(c.requireApprovalForYellow);
        setNotificationsEnabled(c.notificationsEnabled);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load controls.'
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

  const toggleCategory = useCallback((category: string) => {
    setBlockedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }, []);

  const addKeyword = useCallback(() => {
    const value = keywordInput.trim().toLowerCase();
    if (value && !blockedKeywords.includes(value)) {
      setBlockedKeywords((prev) => [...prev, value]);
    }
    setKeywordInput('');
  }, [keywordInput, blockedKeywords]);

  const handleKeywordKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addKeyword();
      }
    },
    [addKeyword]
  );

  const removeKeyword = useCallback((value: string) => {
    setBlockedKeywords((prev) => prev.filter((k) => k !== value));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      const updates: Partial<ParentalControls> = {
        dailyScreenTimeMinutes: unlimited ? undefined : dailyMinutes,
        blockedCategories,
        blockedKeywords,
        requireApprovalForYellow,
        notificationsEnabled,
      };
      const res = await updateControls(childId, updates);
      setControls(res.controls);
      setToast('Controls saved.');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save controls.');
    } finally {
      setSaving(false);
    }
  }, [
    childId,
    unlimited,
    dailyMinutes,
    blockedCategories,
    blockedKeywords,
    requireApprovalForYellow,
    notificationsEnabled,
  ]);

  if (loading) {
    return (
      <div className="controls-panel">
        <div className="controls-panel__loading">Loading controls…</div>
      </div>
    );
  }

  if (error && !controls) {
    return (
      <div className="controls-panel">
        <div className="controls-panel__error">{error}</div>
      </div>
    );
  }

  return (
    <div className="controls-panel">
      <h2 className="controls-panel__heading">Parental Controls</h2>

      <section className="controls-panel__section">
        <h3>Screen Time</h3>
        <label className="controls-panel__toggle">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => setUnlimited(e.target.checked)}
          />
          <span>Unlimited daily screen time</span>
        </label>
        {!unlimited && (
          <div className="controls-panel__slider-row">
            <input
              type="range"
              min={0}
              max={240}
              step={5}
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
            />
            <div className="controls-panel__slider-value">
              {dailyMinutes} min/day
            </div>
          </div>
        )}
      </section>

      <section className="controls-panel__section">
        <h3>Blocked Categories</h3>
        <p className="controls-panel__hint">
          Topics you don&apos;t want your child exploring.
        </p>
        <div className="controls-panel__categories">
          {CATEGORY_OPTIONS.map((cat) => (
            <label key={cat.id} className="controls-panel__checkbox">
              <input
                type="checkbox"
                checked={blockedCategories.includes(cat.id)}
                onChange={() => toggleCategory(cat.id)}
              />
              <span>{cat.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="controls-panel__section">
        <h3>Blocked Keywords</h3>
        <p className="controls-panel__hint">
          Type a word and press Enter. Messages containing these words will be
          filtered.
        </p>
        <div className="tag-input">
          {blockedKeywords.map((keyword) => (
            <span key={keyword} className="tag">
              {keyword}
              <button
                type="button"
                onClick={() => removeKeyword(keyword)}
                aria-label={`Remove ${keyword}`}
              >
                &times;
              </button>
            </span>
          ))}
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={handleKeywordKey}
            onBlur={addKeyword}
            placeholder="e.g., fire, explosion"
          />
        </div>
      </section>

      <section className="controls-panel__section">
        <h3>Safety Approval</h3>
        <label className="controls-panel__toggle">
          <input
            type="checkbox"
            checked={requireApprovalForYellow}
            onChange={(e) => setRequireApprovalForYellow(e.target.checked)}
          />
          <span>
            Require my approval for supervised experiments (yellow safety tier)
          </span>
        </label>
      </section>

      <section className="controls-panel__section">
        <h3>Notifications</h3>
        <label className="controls-panel__toggle">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onChange={(e) => setNotificationsEnabled(e.target.checked)}
          />
          <span>Send me notifications about my child&apos;s activity</span>
        </label>
      </section>

      {error && <div className="controls-panel__error">{error}</div>}
      {toast && <div className="controls-panel__toast">{toast}</div>}

      <div className="controls-panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
