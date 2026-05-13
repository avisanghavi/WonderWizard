import { useRef, useState } from 'react';
import type { NotebookEntry } from '../../../shared/types';

interface NotebookEntryDetailProps {
  entry: NotebookEntry;
  onClose: () => void;
  onPhotoAdd: (file: File) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Full-screen modal with the full notebook entry contents.
 */
export default function NotebookEntryDetail({
  entry,
  onClose,
  onPhotoAdd,
}: NotebookEntryDetailProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [heroIdx, setHeroIdx] = useState(0);

  const hero = entry.photoUrls[heroIdx];
  const rating = entry.rating ?? 0;

  const reflectionEntries = entry.reflectionAnswers
    ? Object.entries(entry.reflectionAnswers)
    : [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPhotoAdd(file);
    // reset so the same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      className="notebook-entry-detail"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="notebook-entry-detail__modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="notebook-entry-detail__close"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>

        {hero && (
          <div className="notebook-entry-detail__hero">
            <img
              src={hero}
              alt={entry.experimentTitle}
              className="notebook-entry-detail__hero-img"
            />
          </div>
        )}

        <div className="notebook-entry-detail__body">
          <div className="notebook-entry-detail__meta">
            <span className="notebook-entry-detail__category">
              {entry.experimentCategory}
            </span>
            <span className="notebook-entry-detail__date">
              {formatDate(entry.createdAt)}
            </span>
          </div>
          <h2 className="notebook-entry-detail__title">
            {entry.experimentTitle}
          </h2>

          {rating > 0 && (
            <div
              className="notebook-entry-detail__rating"
              aria-label={`${rating} stars`}
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={`notebook-entry-detail__star${
                    i < rating ? ' notebook-entry-detail__star--filled' : ''
                  }`}
                  aria-hidden="true"
                >
                  {i < rating ? '\u2605' : '\u2606'}
                </span>
              ))}
            </div>
          )}

          {entry.hypothesis && (
            <section className="notebook-entry-detail__section">
              <h3 className="notebook-entry-detail__section-title">Hypothesis</h3>
              <p className="notebook-entry-detail__text">{entry.hypothesis}</p>
            </section>
          )}

          <section className="notebook-entry-detail__section">
            <h3 className="notebook-entry-detail__section-title">Observation</h3>
            <p className="notebook-entry-detail__text notebook-entry-detail__text--large">
              {entry.observation}
            </p>
          </section>

          {entry.conclusion && (
            <section className="notebook-entry-detail__section">
              <h3 className="notebook-entry-detail__section-title">Conclusion</h3>
              <p className="notebook-entry-detail__text">{entry.conclusion}</p>
            </section>
          )}

          {reflectionEntries.length > 0 && (
            <section className="notebook-entry-detail__section">
              <h3 className="notebook-entry-detail__section-title">
                Reflections
              </h3>
              <dl className="notebook-entry-detail__reflections">
                {reflectionEntries.map(([question, answer]) => (
                  <div
                    key={question}
                    className="notebook-entry-detail__reflection"
                  >
                    <dt className="notebook-entry-detail__reflection-q">
                      {question}
                    </dt>
                    <dd className="notebook-entry-detail__reflection-a">
                      {answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="notebook-entry-detail__section">
            <div className="notebook-entry-detail__photos-header">
              <h3 className="notebook-entry-detail__section-title">
                Photos ({entry.photoUrls.length})
              </h3>
              <button
                type="button"
                className="notebook-entry-detail__add-photo"
                onClick={() => fileInputRef.current?.click()}
              >
                + Add Photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
            {entry.photoUrls.length === 0 ? (
              <div className="notebook-entry-detail__no-photos">
                No photos yet. Tap “Add Photo” to upload one!
              </div>
            ) : (
              <div className="notebook-entry-detail__gallery">
                {entry.photoUrls.map((url, i) => (
                  <button
                    key={url + i}
                    type="button"
                    className={`notebook-entry-detail__thumb${
                      i === heroIdx ? ' notebook-entry-detail__thumb--active' : ''
                    }`}
                    onClick={() => setHeroIdx(i)}
                    aria-label={`Photo ${i + 1}`}
                  >
                    <img src={url} alt={`Photo ${i + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
