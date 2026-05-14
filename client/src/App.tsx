import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import type { ParsedSyllabus, DIYGuide } from '../../shared/types';
import ChatView from './ChatView';
import ReverseSyllabus from './components/ReverseSyllabus';
import DIYGuidePage from './components/DIYGuidePage';
import MockLabPage from './pages/MockLabPage';
import ParentDashboard from './pages/ParentDashboard';
import AuthModal from './components/AuthModal';
import { parentLogout } from './api/parent';
import { supabase } from './supabase';

type AppView = 'chat' | 'syllabus-map' | 'diy-guide' | 'parent';

/** Build a unique key for tracking completed topics. */
function topicKey(unitTitle: string, topic: string): string {
  return `${unitTitle}::${topic}`;
}

function MainApp() {
  const navigate = useNavigate();
  const [childAge, setChildAge] = useState<number | null>(null);
  const [view, setView] = useState<AppView>('chat');
  const [syllabi, setSyllabi] = useState<ParsedSyllabus[]>([]);
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set());
  const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined);
  const [currentDIYGuide, setCurrentDIYGuide] = useState<DIYGuide | null>(null);
  // Which syllabus to show in the map — default to first
  const [activeSyllabusIdx, setActiveSyllabusIdx] = useState(0);
  // Auth state.
  //   authStatus: 'loading'  → first paint, still hydrating session from storage
  //                'out'     → no session — show landing/auth gate
  //                'in'      → signed in, app is usable
  // authMode is the AuthModal variant shown on top of the gate (signup vs login).
  const [authStatus, setAuthStatus] = useState<'loading' | 'in' | 'out'>('loading');
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('login');

  // Session restored from the server after sign-in. While null, ChatView
  // generates its own fresh sessionId. While a string, ChatView adopts it
  // and loads prior messages + syllabi.
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(null);
  // `restoreReady` flips true after we've checked the server for a prior
  // session (or determined this is a fresh user). Until then we hold off on
  // mounting ChatView so we don't flash a fresh session before restoring.
  const [restoreReady, setRestoreReady] = useState(false);

  useEffect(() => {
    // Hydrate session once on mount.
    supabase.auth.getSession().then(({ data }) => {
      setAuthStatus(data.session ? 'in' : 'out');
    });
    // Then subscribe to auth state changes (login, logout, refresh).
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthStatus(session ? 'in' : 'out');
      if (!session) {
        // Logged out — clear any restored session so a future login starts fresh.
        setRestoredSessionId(null);
        setRestoreReady(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Once signed in, ask the server for the parent's most recent session
  // (auto-restore "ChatGPT-style"). If they have one, ChatView adopts that
  // sessionId and pulls history. If not, restoreReady still flips so we
  // mount ChatView with a fresh sessionId.
  useEffect(() => {
    if (authStatus !== 'in') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sessions/mine');
        if (!res.ok) {
          if (!cancelled) setRestoreReady(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const id = (data?.session?.id as string | undefined) ?? null;
        if (id) setRestoredSessionId(id);
        setRestoreReady(true);
      } catch {
        if (!cancelled) setRestoreReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  const parentAuthed = authStatus === 'in';

  const handleOpenParent = useCallback(() => {
    setView('parent');
  }, []);

  const handleAuthSuccess = useCallback((_userId: string) => {
    // onAuthStateChange will flip authStatus to 'in' automatically.
    setView('chat');
  }, []);

  const handleParentLogout = useCallback(async () => {
    await parentLogout();
    // onAuthStateChange flips authStatus → 'out' automatically.
    setChildAge(null);
    setView('chat');
  }, []);

  const handleSyllabiChange = useCallback((newSyllabi: ParsedSyllabus[]) => {
    setSyllabi(newSyllabi);
  }, []);

  const handleOpenCurriculumMap = useCallback(() => {
    if (syllabi.length > 0) {
      setActiveSyllabusIdx(0);
      setView('syllabus-map');
    }
  }, [syllabi]);

  const handleTopicClick = useCallback((unitTitle: string, topic: string) => {
    const key = topicKey(unitTitle, topic);
    setCompletedTopics((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    const message = `Design a hands-on activity for "${topic}" from the unit "${unitTitle}"`;
    setInitialMessage(message);
    setView('chat');
  }, []);

  const handleCloseMap = useCallback(() => {
    setView('chat');
  }, []);

  const handleOpenDIYGuide = useCallback((guide: DIYGuide) => {
    setCurrentDIYGuide(guide);
    setView('diy-guide');
  }, []);

  const handleCloseDIYGuide = useCallback(() => {
    setCurrentDIYGuide(null);
    setView('chat');
  }, []);

  // ---------- auth gate ----------

  // Loading state — Supabase is hydrating the session from localStorage.
  // Show a minimal splash so we don't flash the unauthed UI on every reload.
  if (authStatus === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ opacity: 0.7 }}>Loading…</div>
      </div>
    );
  }

  // Signed out — block the entire app behind a welcome + AuthModal.
  if (authStatus === 'out') {
    return (
      <div className="app">
        <header className="app-header">
          <div className="app-header__logo">
            <span className="app-header__icon">{'🧪'}</span>
            <span className="app-header__title">LabBuddy</span>
          </div>
          <p className="app-header__tagline">Your AI Learning Copilot</p>
        </header>

        <div
          style={{
            minHeight: 'calc(100vh - 100px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            color: 'white',
            gap: '1.25rem',
          }}
        >
          <div style={{ fontSize: '4rem', lineHeight: 1 }}>{'🧪'}</div>
          <h1 style={{ fontSize: '2.25rem', margin: 0, fontWeight: 800, letterSpacing: '-0.5px' }}>
            Welcome to LabBuddy
          </h1>
          <p style={{ maxWidth: 460, margin: 0, fontSize: '1.05rem', lineHeight: 1.55, opacity: 0.92 }}>
            The AI learning copilot for curious kids. Parents create a free
            account to keep things safe, supervised, and on track.
          </p>
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: '0.5rem',
            }}
          >
            <button
              onClick={() => setAuthMode('signup')}
              style={{
                background: 'white',
                color: '#5b21b6',
                border: 'none',
                padding: '0.85rem 1.6rem',
                borderRadius: 999,
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
              }}
            >
              Create parent account
            </button>
            <button
              onClick={() => setAuthMode('login')}
              style={{
                background: 'rgba(255, 255, 255, 0.18)',
                border: '1.5px solid rgba(255, 255, 255, 0.4)',
                color: 'white',
                padding: '0.85rem 1.6rem',
                borderRadius: 999,
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                backdropFilter: 'blur(8px)',
              }}
            >
              Sign in
            </button>
          </div>
        </div>

        {/* Modal is always open in the gate — the user can't dismiss it.
            They toggle signup/login from the buttons above. */}
        <AuthModal
          mode={authMode}
          onClose={() => {
            /* no-op — gated */
          }}
          onSuccess={handleAuthSuccess}
        />
      </div>
    );
  }

  // ---------- signed in: full app ----------

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__logo">
          <span className="app-header__icon">{'\uD83E\uDDEA'}</span>
          <span className="app-header__title">LabBuddy</span>
        </div>
        <p className="app-header__tagline">Your AI Learning Copilot</p>
        <button
          onClick={() => navigate('/mock-lab')}
          style={{
            marginLeft: '1rem',
            background: 'rgba(255, 255, 255, 0.18)',
            border: '1.5px solid rgba(255, 255, 255, 0.4)',
            color: 'white',
            padding: '0.45rem 0.95rem',
            borderRadius: '999px',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
            backdropFilter: 'blur(8px)',
          }}
        >
          {'✨ Try Mock Lab'}
        </button>
        <button
          onClick={handleOpenParent}
          style={{
            marginLeft: '0.5rem',
            background: 'rgba(255, 255, 255, 0.18)',
            border: '1.5px solid rgba(255, 255, 255, 0.4)',
            color: 'white',
            padding: '0.45rem 0.95rem',
            borderRadius: '999px',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
            backdropFilter: 'blur(8px)',
          }}
        >
          {'👤 Parent Dashboard'}
        </button>
      </header>

      {view === 'parent' && parentAuthed ? (
        <ParentDashboard
          onClose={() => setView('chat')}
          onLogout={handleParentLogout}
        />
      ) : childAge === null ? (
        <div className="age-selector">
          <div className="age-selector__icon">{'\uD83D\uDD2C'}</div>
          <h2>How old are you?</h2>
          <p>Pick your age so I can design the perfect activities for you!</p>
          <div className="age-selector__buttons">
            {Array.from({ length: 10 }, (_, i) => i + 5).map((age) => (
              <button
                key={age}
                className="age-btn"
                onClick={() => setChildAge(age)}
              >
                {age}
              </button>
            ))}
          </div>
        </div>
      ) : !restoreReady ? (
        // Briefly show nothing while we ask the server whether the user has
        // a prior session to restore. Avoids flashing a fresh chat then
        // replacing it with restored history.
        <div
          style={{
            minHeight: 'calc(100vh - 100px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            opacity: 0.7,
          }}
        >
          Loading your lab…
        </div>
      ) : (
        <>
          {/* Keep ChatView always mounted so it preserves state; hide via CSS */}
          <div style={{ display: view === 'chat' ? 'contents' : 'none' }}>
            <ChatView
              childAge={childAge}
              initialMessage={initialMessage}
              initialSessionId={restoredSessionId ?? undefined}
              onSyllabiChange={handleSyllabiChange}
              onOpenCurriculumMap={syllabi.length > 0 ? handleOpenCurriculumMap : undefined}
              onOpenDIYGuide={handleOpenDIYGuide}
            />
          </div>
          {view === 'diy-guide' && currentDIYGuide && (
            <DIYGuidePage
              guide={currentDIYGuide}
              onClose={handleCloseDIYGuide}
            />
          )}
          {view === 'syllabus-map' && syllabi.length > 0 && (
            <ReverseSyllabus
              syllabus={syllabi[activeSyllabusIdx] ?? syllabi[0]}
              onTopicClick={handleTopicClick}
              completedTopics={completedTopics}
              onClose={handleCloseMap}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/mock-lab" element={<MockLabRoute />} />
      <Route path="*" element={<MainApp />} />
    </Routes>
  );
}

function MockLabRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  void location;
  return <MockLabPage onClose={() => navigate('/')} />;
}
