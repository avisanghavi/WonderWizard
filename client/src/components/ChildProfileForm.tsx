import { useState, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import type { ChildProfile } from '../../../shared/types';
import { createChild, updateChild } from '../api/parent';

interface ChildProfileFormProps {
  mode: 'create' | 'edit';
  existing?: ChildProfile;
  onSave: (child: ChildProfile) => void;
  onCancel: () => void;
}

const AVATAR_OPTIONS = [
  '\uD83E\uDDD2', // child
  '\uD83D\uDC66', // boy
  '\uD83D\uDC67', // girl
  '\uD83E\uDDD1\u200D\uD83D\uDCBB', // technologist
  '\uD83E\uDDD1\u200D\uD83D\uDD2C', // scientist
  '\uD83D\uDE80', // rocket
  '\uD83E\uDDEA', // test tube
  '\uD83D\uDD2D', // microscope
  '\uD83E\uDDEC', // dna
  '\uD83E\uDD16', // robot
  '\uD83E\uDD84', // unicorn
  '\uD83D\uDC32', // dragon
];

export default function ChildProfileForm({
  mode,
  existing,
  onSave,
  onCancel,
}: ChildProfileFormProps) {
  const [name, setName] = useState(existing?.name || '');
  const [age, setAge] = useState<number>(existing?.age || 8);
  const [gradeLevel, setGradeLevel] = useState<number | ''>(
    existing?.gradeLevel ?? ''
  );
  const [avatar, setAvatar] = useState<string>(existing?.avatar || AVATAR_OPTIONS[0]);
  const [interests, setInterests] = useState<string[]>(existing?.interests || []);
  const [interestInput, setInterestInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addInterest = useCallback(() => {
    const value = interestInput.trim();
    if (value && !interests.includes(value)) {
      setInterests((prev) => [...prev, value]);
    }
    setInterestInput('');
  }, [interestInput, interests]);

  const handleInterestKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addInterest();
      }
    },
    [addInterest]
  );

  const removeInterest = useCallback((value: string) => {
    setInterests((prev) => prev.filter((x) => x !== value));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!name.trim()) {
        setError('Please enter a name.');
        return;
      }
      if (age < 5 || age > 14) {
        setError('Age must be between 5 and 14.');
        return;
      }

      setLoading(true);
      try {
        const payload = {
          name: name.trim(),
          age,
          ...(gradeLevel === '' ? {} : { gradeLevel: Number(gradeLevel) }),
          avatar,
          interests,
        };
        if (mode === 'create') {
          const res = await createChild(payload);
          onSave(res.child);
        } else if (existing) {
          const res = await updateChild(existing.id, payload);
          onSave(res.child);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save profile.');
      } finally {
        setLoading(false);
      }
    },
    [mode, existing, name, age, gradeLevel, avatar, interests, onSave]
  );

  return (
    <div className="child-profile-form__overlay" onClick={onCancel}>
      <div
        className="child-profile-form"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="child-profile-form__close"
          onClick={onCancel}
          aria-label="Close"
        >
          &times;
        </button>

        <h2 className="child-profile-form__title">
          {mode === 'create' ? 'Add a Child' : 'Edit Profile'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="child-profile-form__field">
            <label htmlFor="child-name">Name</label>
            <input
              id="child-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Alex"
              disabled={loading}
            />
          </div>

          <div className="child-profile-form__field">
            <label htmlFor="child-age">Age</label>
            <select
              id="child-age"
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              disabled={loading}
            >
              {Array.from({ length: 10 }, (_, i) => i + 5).map((a) => (
                <option key={a} value={a}>
                  {a} years old
                </option>
              ))}
            </select>
          </div>

          <div className="child-profile-form__field">
            <label htmlFor="child-grade">Grade level (optional)</label>
            <select
              id="child-grade"
              value={gradeLevel}
              onChange={(e) =>
                setGradeLevel(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={loading}
            >
              <option value="">Not specified</option>
              {Array.from({ length: 9 }, (_, i) => i).map((g) => (
                <option key={g} value={g}>
                  {g === 0 ? 'Kindergarten' : `Grade ${g}`}
                </option>
              ))}
            </select>
          </div>

          <div className="child-profile-form__field">
            <label>Avatar</label>
            <div className="child-profile-form__avatars">
              {AVATAR_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`child-profile-form__avatar${avatar === emoji ? ' is-selected' : ''}`}
                  onClick={() => setAvatar(emoji)}
                  disabled={loading}
                  aria-label={`Avatar ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="child-profile-form__field">
            <label htmlFor="child-interests">Interests (press Enter to add)</label>
            <div className="tag-input">
              {interests.map((interest) => (
                <span key={interest} className="tag">
                  {interest}
                  <button
                    type="button"
                    onClick={() => removeInterest(interest)}
                    aria-label={`Remove ${interest}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
              <input
                id="child-interests"
                type="text"
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={handleInterestKey}
                onBlur={addInterest}
                placeholder="e.g., dinosaurs, space"
                disabled={loading}
              />
            </div>
          </div>

          {error && <div className="child-profile-form__error">{error}</div>}

          <div className="child-profile-form__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Saving\u2026' : mode === 'create' ? 'Add child' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
