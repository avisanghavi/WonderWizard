import { useRef, useState } from 'react';
import type { NotebookEntry } from '../../../shared/types';
import {
  createNotebookEntry,
  uploadNotebookPhoto,
} from '../api/engagement';

interface NotebookEntryFormProps {
  childId: string;
  initialTitle?: string;
  initialCategory?: string;
  onSave: (entry: NotebookEntry) => void;
  onCancel: () => void;
}

const CATEGORIES = [
  'Chemistry',
  'Biology',
  'Physics',
  'Earth Science',
  'Space',
  'Math',
  'Engineering',
  'Art + Science',
  'Other',
];

/**
 * Form for creating a new notebook entry, with optional photo uploads.
 */
export default function NotebookEntryForm({
  childId,
  initialTitle = '',
  initialCategory = '',
  onSave,
  onCancel,
}: NotebookEntryFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState(initialCategory || CATEGORIES[0]);
  const [observation, setObservation] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | 0>(0);
  const [queuedPhotos, setQueuedPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i);
      if (f) {
        newFiles.push(f);
        newPreviews.push(URL.createObjectURL(f));
      }
    }
    setQueuedPhotos((prev) => [...prev, ...newFiles]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (idx: number) => {
    setQueuedPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !observation.trim()) {
      setError('Title and observation are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createNotebookEntry({
        childId,
        experimentTitle: title.trim(),
        experimentCategory: category,
        observation: observation.trim(),
        hypothesis: hypothesis.trim() || undefined,
        conclusion: conclusion.trim() || undefined,
        rating: rating === 0 ? undefined : rating,
      });

      let latest = created;
      for (const file of queuedPhotos) {
        try {
          latest = await uploadNotebookPhoto(created.id, file);
        } catch (err) {
          console.error('Photo upload failed:', err);
        }
      }

      // Revoke preview URLs
      for (const url of previews) URL.revokeObjectURL(url);
      onSave(latest);
    } catch (err) {
      console.error('Failed to save notebook entry:', err);
      setError('Could not save your entry. Try again?');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="notebook-entry-form"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <form
        className="notebook-entry-form__modal"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="notebook-entry-form__header">
          <h2>New Notebook Entry</h2>
          <button
            type="button"
            className="notebook-entry-form__close"
            onClick={onCancel}
            aria-label="Close"
          >
            &times;
          </button>
        </header>

        <div className="notebook-entry-form__body">
          <label className="notebook-entry-form__label">
            Experiment Title *
            <input
              type="text"
              className="notebook-entry-form__input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Baking Soda Volcano"
              required
              disabled={saving}
            />
          </label>

          <label className="notebook-entry-form__label">
            Category
            <select
              className="notebook-entry-form__input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={saving}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="notebook-entry-form__label">
            Observation *
            <textarea
              className="notebook-entry-form__textarea"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="What did you see, hear, smell, or feel?"
              rows={5}
              required
              disabled={saving}
            />
          </label>

          <label className="notebook-entry-form__label">
            Hypothesis (optional)
            <textarea
              className="notebook-entry-form__textarea"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="What did you think would happen before you started?"
              rows={3}
              disabled={saving}
            />
          </label>

          <label className="notebook-entry-form__label">
            Conclusion (optional)
            <textarea
              className="notebook-entry-form__textarea"
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              placeholder="What did you learn?"
              rows={3}
              disabled={saving}
            />
          </label>

          <div className="notebook-entry-form__label">
            How fun was it?
            <div className="notebook-entry-form__stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`notebook-entry-form__star${
                    n <= rating ? ' notebook-entry-form__star--filled' : ''
                  }`}
                  onClick={() =>
                    setRating((prev) => (prev === n ? 0 : (n as 1 | 2 | 3 | 4 | 5)))
                  }
                  aria-label={`${n} stars`}
                  disabled={saving}
                >
                  {n <= rating ? '\u2605' : '\u2606'}
                </button>
              ))}
            </div>
          </div>

          <div className="notebook-entry-form__label">
            Photos
            <div className="notebook-entry-form__photos">
              {previews.map((url, i) => (
                <div key={url} className="notebook-entry-form__photo">
                  <img src={url} alt={`Photo ${i + 1}`} />
                  <button
                    type="button"
                    className="notebook-entry-form__photo-remove"
                    onClick={() => removePhoto(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    disabled={saving}
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="notebook-entry-form__photo-add"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                + Add
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
          </div>

          {error && <div className="notebook-entry-form__error">{error}</div>}
        </div>

        <footer className="notebook-entry-form__footer">
          <button
            type="button"
            className="notebook-entry-form__btn notebook-entry-form__btn--secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="notebook-entry-form__btn notebook-entry-form__btn--primary"
            disabled={saving || !title.trim() || !observation.trim()}
          >
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </footer>
      </form>
    </div>
  );
}
