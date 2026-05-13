import type { NotebookEntry } from '../../../shared/types';

interface NotebookEntryCardProps {
  entry: NotebookEntry;
  onClick: () => void;
}

function categoryEmoji(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('chem')) return '\u2697\uFE0F';
  if (c.includes('bio')) return '\uD83E\uDDEC';
  if (c.includes('physics')) return '\uD83E\uDDB2';
  if (c.includes('earth') || c.includes('geo')) return '\uD83C\uDF0D';
  if (c.includes('space') || c.includes('astro')) return '\uD83D\uDE80';
  if (c.includes('math')) return '\uD83D\uDD22';
  if (c.includes('engineering') || c.includes('build')) return '\uD83D\uDD27';
  if (c.includes('art')) return '\uD83C\uDFA8';
  if (c.includes('writ')) return '\u270D\uFE0F';
  return '\uD83E\uDDEA';
}

function gradientFor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('chem')) return 'linear-gradient(135deg, #FF6B6B, #FFB84D)';
  if (c.includes('bio')) return 'linear-gradient(135deg, #4ECDC4, #2ECC71)';
  if (c.includes('physics')) return 'linear-gradient(135deg, #6C63FF, #4ECDC4)';
  if (c.includes('earth') || c.includes('geo'))
    return 'linear-gradient(135deg, #2ECC71, #4ECDC4)';
  if (c.includes('space') || c.includes('astro'))
    return 'linear-gradient(135deg, #5A52E0, #6C63FF)';
  if (c.includes('math')) return 'linear-gradient(135deg, #F1C40F, #FF6B6B)';
  if (c.includes('art')) return 'linear-gradient(135deg, #FF6B6B, #6C63FF)';
  return 'linear-gradient(135deg, #6C63FF, #8B83FF)';
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Compact card showing a notebook entry preview.
 */
export default function NotebookEntryCard({
  entry,
  onClick,
}: NotebookEntryCardProps) {
  const cover = entry.photoUrls[0];
  const rating = entry.rating ?? 0;

  return (
    <button
      type="button"
      className="notebook-entry-card"
      onClick={onClick}
      aria-label={`Open notebook entry: ${entry.experimentTitle}`}
    >
      <div className="notebook-entry-card__cover">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="notebook-entry-card__cover-img"
            loading="lazy"
          />
        ) : (
          <div
            className="notebook-entry-card__cover-fallback"
            style={{ background: gradientFor(entry.experimentCategory) }}
          >
            <span className="notebook-entry-card__cover-emoji" aria-hidden="true">
              {categoryEmoji(entry.experimentCategory)}
            </span>
          </div>
        )}
        {entry.photoUrls.length > 1 && (
          <div className="notebook-entry-card__photo-count">
            {'\uD83D\uDCF7'} {entry.photoUrls.length}
          </div>
        )}
      </div>
      <div className="notebook-entry-card__body">
        <div className="notebook-entry-card__top">
          <span className="notebook-entry-card__category">
            {entry.experimentCategory}
          </span>
          <span className="notebook-entry-card__date">
            {formatDate(entry.createdAt)}
          </span>
        </div>
        <h4 className="notebook-entry-card__title">{entry.experimentTitle}</h4>
        <p className="notebook-entry-card__observation">
          {truncate(entry.observation, 90)}
        </p>
        {rating > 0 && (
          <div className="notebook-entry-card__rating" aria-label={`${rating} stars`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`notebook-entry-card__star${
                  i < rating ? ' notebook-entry-card__star--filled' : ''
                }`}
                aria-hidden="true"
              >
                {i < rating ? '\u2605' : '\u2606'}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
