import { useState, useCallback, type FormEvent } from 'react';
import { supabase } from '../supabase';

interface AuthModalProps {
  mode: 'signup' | 'login';
  onClose: () => void;
  /** Called with the authenticated user id once Supabase confirms the session. */
  onSuccess: (userId: string) => void;
}

export default function AuthModal({
  mode: initialMode,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setInfo(null);

      if (!email.trim() || !password.trim()) {
        setError('Please enter your email and password.');
        return;
      }
      if (mode === 'signup' && !name.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }

      setLoading(true);
      try {
        if (mode === 'signup') {
          const { data, error: err } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { name: name.trim() } },
          });
          if (err) throw err;
          // When email confirmations are ON, data.session is null and the user
          // has to click a link. When OFF (dev mode), session is populated.
          if (data.session && data.user) {
            onSuccess(data.user.id);
          } else if (data.user) {
            setInfo(
              "Account created. Check your email for a confirmation link, then sign in.",
            );
            setMode('login');
          }
        } else {
          const { data, error: err } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (err) throw err;
          if (data.user) onSuccess(data.user.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        setError(friendlyError(msg, mode));
      } finally {
        setLoading(false);
      }
    },
    [mode, name, email, password, onSuccess],
  );

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'signup' ? 'login' : 'signup'));
    setError(null);
    setInfo(null);
  }, []);

  return (
    <div className="auth-modal__overlay" onClick={onClose}>
      <div
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          className="auth-modal__close"
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          &times;
        </button>

        <div className="auth-modal__header">
          <div
            aria-hidden="true"
            style={{
              fontSize: 36,
              lineHeight: 1,
              marginBottom: 10,
              filter: 'drop-shadow(0 2px 6px rgba(99, 102, 241, 0.25))',
            }}
          >
            {'🧪'}
          </div>
          <h2 className="auth-modal__title">
            {mode === 'signup' ? 'Create your parent account' : 'Welcome back'}
          </h2>
          <p className="auth-modal__subtitle">
            {mode === 'signup'
              ? "We'll keep your kids' learning safe, monitored, and on track."
              : 'Sign in to your parent dashboard.'}
          </p>
        </div>

        <form className="auth-modal__form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="auth-modal__field">
              <label htmlFor="auth-name">Your name</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
                disabled={loading}
              />
            </div>
          )}

          <div className="auth-modal__field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="auth-modal__field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="auth-modal__error" role="alert">
              {error}
            </div>
          )}
          {info && (
            <div className="auth-modal__error" role="status" style={{ background: '#e6f4ea', color: '#1e4620' }}>
              {info}
            </div>
          )}

          <button type="submit" className="auth-modal__submit" disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
          </button>

          <div className="auth-modal__toggle">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button type="button" onClick={toggleMode}>Sign in</button>
              </>
            ) : (
              <>
                New to LabBuddy?{' '}
                <button type="button" onClick={toggleMode}>Create account</button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function friendlyError(raw: string, mode: 'signup' | 'login'): string {
  const lower = raw.toLowerCase();
  if (lower.includes('already registered') || lower.includes('exists') || lower.includes('duplicate')) {
    return 'An account with that email already exists. Try signing in.';
  }
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'Incorrect email or password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email — check your inbox for the link.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network problem — check your connection and try again.';
  }
  return mode === 'login' && lower.includes('invalid') ? 'Incorrect email or password.' : raw;
}
