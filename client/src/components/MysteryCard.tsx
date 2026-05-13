import type { MysteryQuestion, WeeklyMystery } from '../../../shared/types';

interface MysteryCardProps {
  mystery: MysteryQuestion | WeeklyMystery;
  variant?: 'inline' | 'banner';
  onInvestigate: (starterPrompt: string) => void;
}

function isWeekly(m: MysteryQuestion | WeeklyMystery): m is WeeklyMystery {
  return 'weekStartsOn' in m;
}

/**
 * Curious-question card. Used inline in chat (variant='inline') and as the
 * weekly banner above the messages list (variant='banner').
 */
export default function MysteryCard({
  mystery,
  variant = 'inline',
  onInvestigate,
}: MysteryCardProps) {
  const weekly = isWeekly(mystery);
  const label = weekly ? '🔮 Mystery of the Week' : '🌀 Curious Question';
  const participantCount = weekly ? mystery.participantCount : undefined;

  return (
    <div
      className={`mystery-card mystery-card--${variant}`}
      role="region"
      aria-label={label}
    >
      <div className="mystery-card__bg" aria-hidden="true" />
      <div className="mystery-card__content">
        <div className="mystery-card__label">{label}</div>
        <h3 className="mystery-card__question">{mystery.question}</h3>
        <p className="mystery-card__hook">{mystery.hook}</p>
        <button
          type="button"
          className="mystery-card__cta"
          onClick={() => onInvestigate(mystery.starterPrompt)}
          aria-label="Investigate this mystery"
        >
          🔍 Investigate
        </button>
        {participantCount !== undefined && participantCount > 0 && (
          <div className="mystery-card__participants">
            {participantCount.toLocaleString()} kids investigating this
          </div>
        )}
      </div>
    </div>
  );
}
