import { useCallback, useEffect, useState } from 'react';
import type { NotebookEntry } from '../../../shared/types';
import NotebookEntryCard from '../components/NotebookEntryCard';
import NotebookEntryDetail from '../components/NotebookEntryDetail';
import NotebookEntryForm from '../components/NotebookEntryForm';
import {
  fetchNotebookEntries,
  uploadNotebookPhoto,
} from '../api/engagement';

interface NotebookPageProps {
  childId: string;
  onClose: () => void;
}

/**
 * Kid's lab-notebook portfolio: grid of entries, detail modal, and create form.
 */
export default function NotebookPage({ childId, onClose }: NotebookPageProps) {
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotebookEntries(childId);
      // Newest first
      setEntries([...data].sort((a, b) => b.createdAt - a.createdAt));
    } catch (err) {
      console.error('Failed to load notebook entries:', err);
      setError('Could not load your notebook.');
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const selected = selectedId
    ? entries.find((e) => e.id === selectedId) ?? null
    : null;

  const handleCreated = (entry: NotebookEntry) => {
    setEntries((prev) => [entry, ...prev]);
    setShowForm(false);
  };

  const handlePhotoAdd = async (file: File) => {
    if (!selected) return;
    try {
      const updated = await uploadNotebookPhoto(selected.id, file);
      setEntries((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e)),
      );
    } catch (err) {
      console.error('Failed to upload photo:', err);
    }
  };

  return (
    <div className="notebook-page">
      <header className="notebook-page__header">
        <button
          type="button"
          className="notebook-page__back"
          onClick={onClose}
          aria-label="Back to chat"
        >
          &larr; Back to Chat
        </button>
        <h1 className="notebook-page__title">Lab Notebook</h1>
        <p className="notebook-page__subtitle">
          Your portfolio of experiments and discoveries
        </p>
      </header>

      <div className="notebook-page__body">
        {loading && (
          <div className="notebook-page__loading">Loading notebook…</div>
        )}
        {error && <div className="notebook-page__error">{error}</div>}

        {!loading && !error && entries.length === 0 && (
          <div className="notebook-page__empty">
            <div className="notebook-page__empty-icon">{'\uD83D\uDCD3'}</div>
            <h3>Your notebook is empty!</h3>
            <p>
              Tap the + button to record your first experiment and start your
              portfolio.
            </p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="notebook-grid">
            {entries.map((entry) => (
              <NotebookEntryCard
                key={entry.id}
                entry={entry}
                onClick={() => setSelectedId(entry.id)}
              />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="notebook-page__fab"
        onClick={() => setShowForm(true)}
        aria-label="Add new notebook entry"
      >
        +
      </button>

      {selected && (
        <NotebookEntryDetail
          entry={selected}
          onClose={() => setSelectedId(null)}
          onPhotoAdd={handlePhotoAdd}
        />
      )}

      {showForm && (
        <NotebookEntryForm
          childId={childId}
          onSave={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
