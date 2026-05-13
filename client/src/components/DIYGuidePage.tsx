import { useState, useRef, useCallback, useEffect } from 'react';
import type { DIYGuide } from '../../../shared/types';

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

interface DIYGuidePageProps {
  guide: DIYGuide;
  onClose: () => void;
}

/**
 * Render a step illustration. We support TWO formats because the DB has
 * both shapes:
 *   - new (post image-gen upgrade): a URL like "/api/images/render/<hash>.png"
 *   - legacy: a full <svg>…</svg> string
 *
 * We sniff by checking whether the source starts with "<" — if not, it's
 * a URL and we render an <img>.
 */
function StepIllustration({
  source,
  alt,
  className,
}: {
  source: string;
  alt: string;
  className: string;
}) {
  const trimmed = source.trim();
  const isMarkup = trimmed.startsWith('<');

  if (!isMarkup) {
    return <img className={className} src={trimmed} alt={alt} loading="lazy" />;
  }

  // Legacy inline SVG — sanitize for safety
  const cleaned = trimmed
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  return (
    <div
      className={className}
      role="img"
      aria-label={alt}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: cleaned }}
    />
  );
}

export default function DIYGuidePage({ guide, onClose }: DIYGuidePageProps) {
  const { experiment, stepIllustrations } = guide;
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [suppliesChecked, setSuppliesChecked] = useState<Set<number>>(new Set());
  const [showCelebration, setShowCelebration] = useState(false);
  const [reflectionNotes, setReflectionNotes] = useState<Record<number, string>>({});
  const [activeTimers, setActiveTimers] = useState<Record<number, number>>({});
  const timerIntervals = useRef<Record<number, ReturnType<typeof setInterval>>>({});

  const stepsRef = useRef<HTMLDivElement>(null);
  const suppliesRef = useRef<HTMLDivElement>(null);
  const tipsRef = useRef<HTMLDivElement>(null);
  const safetyRef = useRef<HTMLDivElement>(null);
  const reflectionRef = useRef<HTMLDivElement>(null);

  const totalSteps = experiment.steps.length;
  const completedCount = completedSteps.size;
  const allComplete = completedCount === totalSteps;
  const icon = CATEGORY_ICONS[experiment.category.toLowerCase()] ?? CATEGORY_ICONS.default;

  // Celebration effect
  useEffect(() => {
    if (allComplete && totalSteps > 0) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [allComplete, totalSteps]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      Object.values(timerIntervals.current).forEach(clearInterval);
    };
  }, []);

  const toggleStep = useCallback((stepIndex: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepIndex)) {
        next.delete(stepIndex);
      } else {
        next.add(stepIndex);
      }
      return next;
    });
  }, []);

  const toggleSupply = useCallback((supplyIndex: number) => {
    setSuppliesChecked(prev => {
      const next = new Set(prev);
      if (next.has(supplyIndex)) {
        next.delete(supplyIndex);
      } else {
        next.add(supplyIndex);
      }
      return next;
    });
  }, []);

  const startTimer = useCallback((stepIndex: number, minutes: number) => {
    if (timerIntervals.current[stepIndex]) return;
    let remaining = minutes * 60;
    setActiveTimers(prev => ({ ...prev, [stepIndex]: remaining }));
    timerIntervals.current[stepIndex] = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timerIntervals.current[stepIndex]);
        delete timerIntervals.current[stepIndex];
        setActiveTimers(prev => {
          const next = { ...prev };
          delete next[stepIndex];
          return next;
        });
      } else {
        setActiveTimers(prev => ({ ...prev, [stepIndex]: remaining }));
      }
    }, 1000);
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const url = `${window.location.origin}?diy=${guide.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: silent fail
    }
  };

  // Consolidated tips and safety warnings
  const allTips = experiment.steps
    .map(s => s.tip)
    .filter((t): t is string => Boolean(t));
  const allSafetyWarnings = experiment.steps
    .map(s => s.safetyWarning)
    .filter((w): w is string => Boolean(w));

  const estimatedTotal = experiment.supplies.reduce((sum, s) => sum + s.estimatedPrice, 0);

  return (
    <div className="diy-guide">
      {/* Progress Bar - Sticky */}
      <div className="diy-guide__progress">
        <div className="diy-guide__progress-bar">
          <div
            className="diy-guide__progress-fill"
            style={{ width: `${totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0}%` }}
          />
        </div>
        <span className="diy-guide__progress-text">
          {completedCount} of {totalSteps} steps completed
        </span>
        <button className="diy-guide__close-btn" onClick={onClose}>
          {'\u2715'} Back to Chat
        </button>
      </div>

      {/* Celebration Banner */}
      {showCelebration && (
        <div className="diy-guide__celebration">
          <div className="diy-guide__celebration-confetti" />
          <span className="diy-guide__celebration-text">
            Experiment Complete! {'\uD83C\uDF89'}
          </span>
        </div>
      )}

      {/* All-complete banner (persistent) */}
      {allComplete && totalSteps > 0 && !showCelebration && (
        <div className="diy-guide__complete-banner">
          {'\uD83C\uDF1F'} You did it! All steps completed!
        </div>
      )}

      {/* A. Hero Banner */}
      <div className="diy-guide__hero">
        <div className="diy-guide__hero-content">
          <div className="diy-guide__hero-badges">
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
          <h1 className="diy-guide__hero-title">
            <span className="diy-guide__hero-icon">{icon}</span>
            {experiment.title}
          </h1>
          <p className="diy-guide__hero-desc">{experiment.description}</p>
          <p className="diy-guide__hero-attribution">Created by LabBuddy AI</p>
          {experiment.scienceConcepts.length > 0 && (
            <div className="diy-guide__hero-concepts">
              {experiment.scienceConcepts.map((c, i) => (
                <span key={i} className="tag">{c}</span>
              ))}
            </div>
          )}
        </div>
        {stepIllustrations.length > 0 && (
          <StepIllustration source={stepIllustrations[0]} alt={experiment.title} className="diy-guide__hero-illustration" />
        )}
      </div>

      {/* B. Table of Contents */}
      <nav className="diy-guide__toc">
        <button className="diy-guide__toc-item" onClick={() => scrollTo(suppliesRef)}>
          {'\uD83D\uDED2'} Supplies
        </button>
        <button className="diy-guide__toc-item" onClick={() => scrollTo(stepsRef)}>
          {'\uD83D\uDCCB'} Steps (1-{totalSteps})
        </button>
        {allTips.length > 0 && (
          <button className="diy-guide__toc-item" onClick={() => scrollTo(tipsRef)}>
            {'\uD83D\uDCA1'} Tips
          </button>
        )}
        {allSafetyWarnings.length > 0 && (
          <button className="diy-guide__toc-item" onClick={() => scrollTo(safetyRef)}>
            {'\u26A0\uFE0F'} Safety
          </button>
        )}
        <button className="diy-guide__toc-item" onClick={() => scrollTo(reflectionRef)}>
          {'\uD83E\uDD14'} Reflect
        </button>
      </nav>

      {/* C. Things You'll Need */}
      <div className="diy-guide__supplies" ref={suppliesRef}>
        <h2 className="diy-guide__section-title">
          {'\uD83D\uDED2'} Things You'll Need
        </h2>
        <div className="diy-guide__supply-grid">
          {experiment.supplies.map((supply, i) => (
            <div
              key={i}
              className={`diy-guide__supply-item ${suppliesChecked.has(i) ? 'diy-guide__supply-item--checked' : ''}`}
              onClick={() => toggleSupply(i)}
            >
              <div className={`diy-guide__supply-checkbox ${suppliesChecked.has(i) ? 'diy-guide__supply-checkbox--checked' : ''}`}>
                {suppliesChecked.has(i) ? '\u2713' : ''}
              </div>
              <div className="diy-guide__supply-info">
                <span className="diy-guide__supply-name">
                  {supply.icon ? `${supply.icon} ` : ''}{supply.item}
                </span>
                <span className="diy-guide__supply-quantity">{supply.quantity}</span>
                {supply.budgetAlternative && (
                  <span className="diy-guide__supply-budget">
                    Budget: {supply.budgetAlternative}
                  </span>
                )}
              </div>
              <div className="diy-guide__supply-meta">
                <span className="diy-guide__supply-price">${supply.estimatedPrice.toFixed(2)}</span>
                <span className="diy-guide__supply-store">{supply.store}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="diy-guide__supply-total">
          Estimated Total: ${estimatedTotal.toFixed(2)}
        </div>
      </div>

      {/* D. Steps Section */}
      <div className="diy-guide__steps" ref={stepsRef}>
        <h2 className="diy-guide__section-title">
          {'\uD83D\uDCCB'} Steps
        </h2>
        {experiment.steps.map((step, i) => {
          const isCompleted = completedSteps.has(i);
          return (
            <div
              key={i}
              className={`diy-guide__step ${isCompleted ? 'diy-guide__step--completed' : ''}`}
            >
              <div className="diy-guide__step-header">
                <div
                  className={`diy-guide__step-checkbox ${isCompleted ? 'diy-guide__step-checkbox--checked' : ''}`}
                  onClick={() => toggleStep(i)}
                >
                  {isCompleted ? '\u2713' : ''}
                </div>
                <div className={`diy-guide__step-number ${isCompleted ? 'diy-guide__step-number--completed' : ''}`}>
                  {i + 1}
                </div>
                {step.durationMinutes && (
                  <span className="diy-guide__step-timer-badge">
                    {'\u23F1'} {step.durationMinutes} min
                    {activeTimers[i] !== undefined ? (
                      <span className="diy-guide__step-countdown"> ({formatTime(activeTimers[i])})</span>
                    ) : (
                      <button
                        className="diy-guide__timer-start"
                        onClick={(e) => { e.stopPropagation(); startTimer(i, step.durationMinutes!); }}
                      >
                        Start
                      </button>
                    )}
                  </span>
                )}
              </div>

              {/* Illustration */}
              {stepIllustrations[i] && (
                <StepIllustration
                  source={stepIllustrations[i]}
                  alt={`Step ${i + 1}: ${step.instruction.slice(0, 80)}`}
                  className="diy-guide__step-illustration"
                />
              )}

              {/* Instruction */}
              <h3 className="diy-guide__step-instruction">{step.instruction}</h3>

              {/* Tip */}
              {step.tip && (
                <div className="diy-guide__step-detail">
                  {'\uD83D\uDCA1'} {step.tip}
                </div>
              )}

              {/* Science Note */}
              {step.scienceNote && (
                <div className="diy-guide__science-note">
                  <span className="diy-guide__callout-icon">{'\uD83E\uDDE0'}</span>
                  <div>
                    <strong>Did you know?</strong>
                    <p>{step.scienceNote}</p>
                  </div>
                </div>
              )}

              {/* Safety Warning */}
              {step.safetyWarning && (
                <div className="diy-guide__safety-warning">
                  <span className="diy-guide__callout-icon">{'\u26A0\uFE0F'}</span>
                  <div>
                    <strong>Safety Warning</strong>
                    <p>{step.safetyWarning}</p>
                  </div>
                </div>
              )}

              {i < totalSteps - 1 && <div className="diy-guide__step-divider" />}
            </div>
          );
        })}
      </div>

      {/* F. Reflection Section */}
      {experiment.reflectionPrompts.length > 0 && (
        <div className="diy-guide__reflection" ref={reflectionRef}>
          <h2 className="diy-guide__section-title">
            {'\uD83E\uDD14'} Think About It
          </h2>
          {experiment.reflectionPrompts.map((prompt, i) => (
            <div key={i} className="diy-guide__reflection-card">
              <p className="diy-guide__reflection-question">{prompt}</p>
              <textarea
                className="diy-guide__reflection-textarea"
                placeholder="Write your thoughts here..."
                value={reflectionNotes[i] ?? ''}
                onChange={(e) =>
                  setReflectionNotes(prev => ({ ...prev, [i]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* G. Tips Section */}
      {allTips.length > 0 && (
        <div className="diy-guide__tips" ref={tipsRef}>
          <h2 className="diy-guide__section-title">
            {'\uD83D\uDCA1'} Tips
          </h2>
          <ul className="diy-guide__tips-list">
            {allTips.map((tip, i) => (
              <li key={i} className="diy-guide__tip-item">
                {'\uD83D\uDCA1'} {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* H. Safety Summary */}
      {allSafetyWarnings.length > 0 && (
        <div className="diy-guide__safety-summary" ref={safetyRef}>
          <h2 className="diy-guide__section-title">
            {'\u26A0\uFE0F'} Safety Summary
          </h2>
          <ul className="diy-guide__safety-list">
            {allSafetyWarnings.map((w, i) => (
              <li key={i} className="diy-guide__safety-item">
                {'\u26A0\uFE0F'} {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* I. What's Next */}
      <div className="diy-guide__whats-next">
        <h2 className="diy-guide__section-title">
          {'\uD83D\uDE80'} What's Next?
        </h2>
        <p className="diy-guide__whats-next-text">
          Now that you've completed this experiment, go back to chat and try asking about related topics!
        </p>
        <button className="diy-guide__back-btn" onClick={onClose}>
          {'\uD83D\uDCAC'} Back to Chat
        </button>
      </div>

      {/* J. Footer */}
      <footer className="diy-guide__footer">
        <p>Created with LabBuddy AI — Your Learning Copilot</p>
        <div className="diy-guide__footer-actions">
          <button className="diy-guide__print-btn" onClick={handlePrint}>
            {'\uD83D\uDDA8\uFE0F'} Print Guide
          </button>
          <button className="diy-guide__share-btn" onClick={handleShare}>
            {'\uD83D\uDD17'} Copy Link
          </button>
        </div>
      </footer>
    </div>
  );
}
