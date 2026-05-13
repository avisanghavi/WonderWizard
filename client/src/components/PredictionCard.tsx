import { useState, useEffect, useRef } from 'react';
import type { ContentBlock } from '../../../shared/types';

type PredictionPromptBlock = Extract<ContentBlock, { type: 'prediction-prompt' }>;

interface PredictionCardProps {
  block: PredictionPromptBlock;
  childId: string;
}

const OPTION_PALETTE = ['primary', 'coral', 'teal', 'yellow'] as const;

function storageKey(predictionId: string): string {
  return `labbuddy:prediction:${predictionId}`;
}

/**
 * The pre-experiment "commit to a guess" prompt. Most important new UX surface.
 *
 * Once an option is tapped we POST to the prediction endpoint, persist the
 * choice in localStorage (so refreshes don't lose it) and lock the UI.
 */
export default function PredictionCard({ block, childId }: PredictionCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(storageKey(block.predictionId));
  });
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Re-hydrate from storage if predictionId changes (e.g., new block).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(storageKey(block.predictionId));
    if (stored) {
      setSelectedId(stored);
      submittedRef.current = true;
    }
  }, [block.predictionId]);

  const handlePick = async (optionId: string) => {
    if (selectedId || submitting || submittedRef.current) return;
    setSelectedId(optionId);
    setSubmitting(true);
    try {
      window.localStorage.setItem(storageKey(block.predictionId), optionId);
      await fetch(
        `/api/gamification/${encodeURIComponent(childId)}/prediction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            predictionId: block.predictionId,
            choice: optionId,
            experimentTitle: block.experimentTitle,
          }),
        },
      );
      submittedRef.current = true;
    } catch (err) {
      // Don't roll back the UI — the kid's commitment is what matters.
      // Just log; the backend will reconcile when retried.
      console.warn('prediction submit failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedOption = block.options.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="prediction-card" role="group" aria-label="Make your guess">
      <div className="prediction-card__header">
        <h3 className="prediction-card__heading">
          <span className="prediction-card__pulse-dot" aria-hidden="true">🎯</span>
          Make Your Guess First!
        </h3>
        <p className="prediction-card__question">{block.question}</p>
      </div>

      <div
        className={`prediction-card__options prediction-card__options--count-${block.options.length}`}
      >
        {block.options.map((opt, idx) => {
          const palette = OPTION_PALETTE[idx % OPTION_PALETTE.length];
          const isSelected = selectedId === opt.id;
          const isFaded = selectedId !== null && !isSelected;
          return (
            <button
              key={opt.id}
              type="button"
              className={
                'prediction-option' +
                ` prediction-option--${palette}` +
                (isSelected ? ' prediction-option--selected' : '') +
                (isFaded ? ' prediction-option--faded' : '')
              }
              onClick={() => handlePick(opt.id)}
              disabled={selectedId !== null}
              aria-pressed={isSelected}
              aria-label={`Guess: ${opt.label}`}
            >
              <span className="prediction-option__emoji" aria-hidden="true">
                {opt.emoji}
              </span>
              <span className="prediction-option__label">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {selectedOption && (
        <div className="prediction-card__locked" role="status">
          <div className="prediction-card__locked-msg">
            Locked in! 🔒 <strong>+8 Curiosity Points</strong> — guessing is half the fun
          </div>
          <div className="prediction-card__locked-sub">
            (See What Actually Happens →)
          </div>
        </div>
      )}

      <div className="prediction-card__footer">
        Wrong guesses earn the most points. Wild, right?
      </div>
    </div>
  );
}
