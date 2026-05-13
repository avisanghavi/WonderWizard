import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import type { ParsedSyllabus, DIYGuide } from '../../shared/types';
import ChatView from './ChatView';
import ReverseSyllabus from './components/ReverseSyllabus';
import DIYGuidePage from './components/DIYGuidePage';
import MockLabPage from './pages/MockLabPage';
import ParentDashboard from './pages/ParentDashboard';
import AuthModal from './components/AuthModal';
import { hasSession, parentLogout } from './api/parent';
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
  // Parent auth state — drives the parent dashboard entry point
  const [parentAuthed, setParentAuthed] = useState<boolean>(() => hasSession());
  const [showAuthModal, setShowAuthModal] = useState<null | 'signup' | 'login'>(null);

  useEffect(() => {
    // Drive auth state from Supabase's own auth event stream.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setParentAuthed(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleOpenParent = useCallback(() => {
    if (parentAuthed) {
      setView('parent');
    } else {
      setShowAuthModal('login');
    }
  }, [parentAuthed]);

  const handleAuthSuccess = useCallback((_userId: string) => {
    setParentAuthed(true);
    setShowAuthModal(null);
    setView('parent');
  }, []);

  const handleParentLogout = useCallback(async () => {
    await parentLogout();
    setParentAuthed(false);
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
          {parentAuthed ? '👤 Parent Dashboard' : '👤 Parent Sign In'}
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
      ) : (
        <>
          {/* Keep ChatView always mounted so it preserves state; hide via CSS */}
          <div style={{ display: view === 'chat' ? 'contents' : 'none' }}>
            <ChatView
              childAge={childAge}
              initialMessage={initialMessage}
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
      {showAuthModal && (
        <AuthModal
          mode={showAuthModal}
          onClose={() => setShowAuthModal(null)}
          onSuccess={handleAuthSuccess}
        />
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
