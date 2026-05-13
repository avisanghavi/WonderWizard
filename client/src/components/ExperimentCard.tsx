import { useState } from 'react';
import type { GeneratedExperiment, DIYGuide } from '../../../shared/types';

const CATEGORY_ICONS: Record<string, string> = {
  chemistry: '\uD83E\uDDEA',
  physics: '\u26A1',
  biology: '\uD83C\uDF31',
  geology: '\uD83C\uDF0B',
  astronomy: '\uD83C\uDF0C',
  engineering: '\uD83D\uDD27',
  default: '\uD83D\uDD2C',
};

const SAFETY_LABELS: Record<string, string> = {
  green: '\u2705 Safe to do alone',
  yellow: '\u26A0\uFE0F Adult nearby',
  red: '\uD83D\uDED1 Adult required',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '\u2B50 Easy',
  medium: '\u2B50\u2B50 Medium',
  hard: '\u2B50\u2B50\u2B50 Hard',
};

interface ExperimentCardProps {
  experiment: GeneratedExperiment;
  onOpenDIYGuide?: (guide: DIYGuide) => void;
  sessionId?: string;
}

export default function ExperimentCard({ experiment, onOpenDIYGuide, sessionId }: ExperimentCardProps) {
  const icon = CATEGORY_ICONS[experiment.category.toLowerCase()] ?? CATEGORY_ICONS.default;
  const [loading, setLoading] = useState(false);

  const handleViewGuide = async () => {
    if (!onOpenDIYGuide || !sessionId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/diy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiment, sessionId }),
      });
      if (!res.ok) throw new Error('Failed to generate guide');
      const guide: DIYGuide = await res.json();
      onOpenDIYGuide(guide);
    } catch (err) {
      console.error('Error generating DIY guide:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="experiment-card">
      <div className="experiment-card__header">
        <span className="experiment-card__category-icon">{icon}</span>
        <span className="experiment-card__title">{experiment.title}</span>
      </div>

      <div className="experiment-card__desc">{experiment.description}</div>

      <div className="experiment-card__badges">
        <span className={`badge badge--safety-${experiment.safetyTier}`}>
          {SAFETY_LABELS[experiment.safetyTier]}
        </span>
        <span className={`badge badge--difficulty-${experiment.difficulty}`}>
          {DIFFICULTY_LABELS[experiment.difficulty]}
        </span>
        <span className="badge badge--duration">
          {'\u23F1'} {experiment.durationMinutes} min
        </span>
      </div>

      {experiment.scienceConcepts.length > 0 && (
        <div className="experiment-card__concepts">
          {experiment.scienceConcepts.map((concept, i) => (
            <span key={i} className="tag">{concept}</span>
          ))}
        </div>
      )}

      {onOpenDIYGuide && sessionId && (
        <button
          className="experiment-card__guide-btn"
          onClick={handleViewGuide}
          disabled={loading}
        >
          {loading ? 'Generating your guide...' : '\uD83D\uDCD6 View Full Guide'}
        </button>
      )}
    </div>
  );
}
