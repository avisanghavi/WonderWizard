import { useEffect, useState, useCallback } from 'react';
import type { MysteryQuestion, WeeklyMystery } from '../../../shared/types';
import MysteryCard from './MysteryCard';

interface WeeklyMysteryBannerProps {
  onSendMessage: (text: string) => void;
}

function dismissedKey(weekStartsOn: string): string {
  return `mystery-dismissed-${weekStartsOn}`;
}

/**
 * Top-of-chat banner showing the weekly curated mystery, plus a
 * "Surprise me with a weird question" lane button. Dismiss persists per week.
 */
export default function WeeklyMysteryBanner({ onSendMessage }: WeeklyMysteryBannerProps) {
  const [mystery, setMystery] = useState<WeeklyMystery | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loadingRandom, setLoadingRandom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/mysteries/current')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { mystery: WeeklyMystery } | null) => {
        if (cancelled || !data?.mystery) return;
        setMystery(data.mystery);
        const stored = window.localStorage.getItem(
          dismissedKey(data.mystery.weekStartsOn),
        );
        if (stored) setDismissed(true);
      })
      .catch(() => {
        // Optional surface — silently no-op.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    if (!mystery) return;
    window.localStorage.setItem(dismissedKey(mystery.weekStartsOn), '1');
    setDismissed(true);
  }, [mystery]);

  const handleSurpriseMe = useCallback(async () => {
    if (loadingRandom) return;
    setLoadingRandom(true);
    try {
      const url = mystery
        ? `/api/mysteries/random?exclude=${encodeURIComponent(mystery.id)}`
        : '/api/mysteries/random';
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { mystery: MysteryQuestion };
      if (data?.mystery?.starterPrompt) {
        onSendMessage(data.mystery.starterPrompt);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRandom(false);
    }
  }, [loadingRandom, mystery, onSendMessage]);

  if (!mystery || dismissed) {
    // Even when dismissed, still expose the "Surprise me" lane.
    return (
      <div className="weekly-mystery-banner__lane">
        <button
          type="button"
          className="weekly-mystery-banner__surprise"
          onClick={handleSurpriseMe}
          disabled={loadingRandom}
          aria-label="Surprise me with a weird question"
        >
          🌀 Surprise me with a weird question
        </button>
      </div>
    );
  }

  return (
    <div className="weekly-mystery-banner">
      <button
        type="button"
        className="weekly-mystery-banner__dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss mystery banner"
      >
        ×
      </button>
      <MysteryCard mystery={mystery} variant="banner" onInvestigate={onSendMessage} />
      <div className="weekly-mystery-banner__lane">
        <button
          type="button"
          className="weekly-mystery-banner__surprise"
          onClick={handleSurpriseMe}
          disabled={loadingRandom}
          aria-label="Surprise me with a weird question"
        >
          🌀 Surprise me with a weird question
        </button>
      </div>
    </div>
  );
}
