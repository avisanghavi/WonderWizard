import { useMemo } from 'react';
import type { ParsedSyllabus } from '../../../shared/types';

interface ReverseSyllabusProps {
  syllabus: ParsedSyllabus;
  onTopicClick: (unitTitle: string, topic: string) => void;
  completedTopics?: Set<string>;
  onClose: () => void;
}

/** Pick a subject-specific color theme based on subject name. */
function getSubjectTheme(subject: string): { accent: string; accentLight: string; emoji: string } {
  const lower = subject.toLowerCase();
  if (lower.includes('math') || lower.includes('algebra') || lower.includes('geometry') || lower.includes('calculus'))
    return { accent: '#7C3AED', accentLight: '#EDE9FE', emoji: '\uD83D\uDCD0' };
  if (lower.includes('science') || lower.includes('biology') || lower.includes('chemistry') || lower.includes('physics'))
    return { accent: '#0D9488', accentLight: '#CCFBF1', emoji: '\uD83D\uDCD8' };
  if (lower.includes('english') || lower.includes('writing') || lower.includes('literature') || lower.includes('reading'))
    return { accent: '#E11D48', accentLight: '#FFE4E6', emoji: '\uD83D\uDCD5' };
  if (lower.includes('history') || lower.includes('social') || lower.includes('geography'))
    return { accent: '#D97706', accentLight: '#FEF3C7', emoji: '\uD83D\uDCD9' };
  if (lower.includes('art') || lower.includes('music'))
    return { accent: '#DB2777', accentLight: '#FCE7F3', emoji: '\uD83C\uDFA8' };
  return { accent: '#6C63FF', accentLight: '#F0EEFF', emoji: '\uD83D\uDCD7' };
}

/** Cycle through a palette for unit accent colors. */
const UNIT_COLORS = [
  { border: '#6C63FF', bg: '#F0EEFF', number: '#6C63FF' },
  { border: '#0D9488', bg: '#CCFBF1', number: '#0D9488' },
  { border: '#E11D48', bg: '#FFE4E6', number: '#E11D48' },
  { border: '#D97706', bg: '#FEF3C7', number: '#D97706' },
  { border: '#7C3AED', bg: '#EDE9FE', number: '#7C3AED' },
  { border: '#DB2777', bg: '#FCE7F3', number: '#DB2777' },
  { border: '#2563EB', bg: '#DBEAFE', number: '#2563EB' },
  { border: '#059669', bg: '#D1FAE5', number: '#059669' },
];

/** Pick an emoji for a topic based on simple keyword matching. */
function topicEmoji(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes('cell') || t.includes('organ')) return '\uD83E\uDDE0';
  if (t.includes('plant') || t.includes('photo')) return '\uD83C\uDF31';
  if (t.includes('animal') || t.includes('species')) return '\uD83D\uDC3E';
  if (t.includes('rock') || t.includes('mineral') || t.includes('geo')) return '\uD83E\uDEA8';
  if (t.includes('water') || t.includes('ocean') || t.includes('wave')) return '\uD83C\uDF0A';
  if (t.includes('space') || t.includes('star') || t.includes('planet') || t.includes('solar')) return '\uD83C\uDF0C';
  if (t.includes('energy') || t.includes('electric') || t.includes('power')) return '\u26A1';
  if (t.includes('force') || t.includes('motion') || t.includes('newton')) return '\uD83C\uDFAF';
  if (t.includes('chem') || t.includes('atom') || t.includes('element') || t.includes('react')) return '\u2697\uFE0F';
  if (t.includes('dna') || t.includes('gene') || t.includes('hered')) return '\uD83E\uDDEC';
  if (t.includes('equation') || t.includes('solve') || t.includes('variable')) return '\uD83D\uDD23';
  if (t.includes('graph') || t.includes('function') || t.includes('slope')) return '\uD83D\uDCC8';
  if (t.includes('fraction') || t.includes('decimal') || t.includes('percent')) return '\uD83E\uDE99';
  if (t.includes('triangle') || t.includes('angle') || t.includes('shape')) return '\uD83D\uDD3A';
  if (t.includes('write') || t.includes('essay') || t.includes('narrative')) return '\u270D\uFE0F';
  if (t.includes('read') || t.includes('book') || t.includes('novel')) return '\uD83D\uDCDA';
  if (t.includes('war') || t.includes('revolution') || t.includes('battle')) return '\u2694\uFE0F';
  if (t.includes('map') || t.includes('continent')) return '\uD83D\uDDFA\uFE0F';
  if (t.includes('weather') || t.includes('climate')) return '\uD83C\uDF26\uFE0F';
  if (t.includes('volcano') || t.includes('earthquake')) return '\uD83C\uDF0B';
  if (t.includes('light') || t.includes('optic')) return '\uD83D\uDD2C';
  if (t.includes('sound') || t.includes('acoust')) return '\uD83D\uDD0A';
  if (t.includes('magnet')) return '\uD83E\uDDF2';
  if (t.includes('heat') || t.includes('therm')) return '\uD83C\uDF21\uFE0F';
  if (t.includes('eco') || t.includes('environment') || t.includes('habitat')) return '\uD83C\uDF3F';
  if (t.includes('evol')) return '\uD83E\uDDA0';
  if (t.includes('body') || t.includes('muscle') || t.includes('bone')) return '\uD83E\uDDB4';
  return '\u2728';
}

/** Create a unique key for a topic (unitTitle::topic). */
function topicKey(unitTitle: string, topic: string): string {
  return `${unitTitle}::${topic}`;
}

export default function ReverseSyllabus({
  syllabus,
  onTopicClick,
  completedTopics,
  onClose,
}: ReverseSyllabusProps) {
  const theme = useMemo(() => getSubjectTheme(syllabus.subject), [syllabus.subject]);

  const totalTopics = useMemo(
    () => syllabus.units.reduce((sum, u) => sum + u.topics.length, 0),
    [syllabus.units],
  );

  const completedCount = useMemo(() => {
    if (!completedTopics) return 0;
    let count = 0;
    for (const unit of syllabus.units) {
      for (const topic of unit.topics) {
        if (completedTopics.has(topicKey(unit.title, topic))) count++;
      }
    }
    return count;
  }, [syllabus.units, completedTopics]);

  const progressPct = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

  return (
    <div className="reverse-syllabus" style={{ '--rs-accent': theme.accent, '--rs-accent-light': theme.accentLight } as React.CSSProperties}>
      {/* Header banner */}
      <div className="reverse-syllabus__header">
        <button className="reverse-syllabus__back-btn" onClick={onClose} aria-label="Back to chat">
          &#8592; Back to Chat
        </button>
        <div className="reverse-syllabus__header-content">
          <span className="reverse-syllabus__header-emoji">{theme.emoji}</span>
          <h1 className="reverse-syllabus__title">
            {syllabus.gradeLevel} {syllabus.subject} &mdash; Your Learning Map
          </h1>
          {syllabus.teacher && (
            <span className="reverse-syllabus__teacher">{syllabus.teacher}</span>
          )}
        </div>
        <div className="reverse-syllabus__progress">
          <div className="reverse-syllabus__progress-text">
            {completedCount} of {totalTopics} topics explored ({progressPct}%)
          </div>
          <div className="reverse-syllabus__progress-bar">
            <div
              className="reverse-syllabus__progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Roadmap */}
      <div className="reverse-syllabus__roadmap">
        {syllabus.units.map((unit, idx) => {
          const color = UNIT_COLORS[idx % UNIT_COLORS.length];
          const isLast = idx === syllabus.units.length - 1;

          return (
            <div key={unit.unitNumber} className="reverse-syllabus__unit-wrapper">
              <div
                className="reverse-syllabus__unit"
                style={{
                  '--unit-border': color.border,
                  '--unit-bg': color.bg,
                  '--unit-number-color': color.number,
                } as React.CSSProperties}
              >
                <div className="reverse-syllabus__unit-header">
                  <div className="reverse-syllabus__unit-number">{unit.unitNumber}</div>
                  <div className="reverse-syllabus__unit-info">
                    {unit.mysteryQuestion ? (
                      <>
                        <h2 className="reverse-syllabus__unit-mystery">
                          {unit.mysteryQuestion}
                        </h2>
                        <div className="reverse-syllabus__unit-aka">
                          AKA: {unit.title}
                        </div>
                        {unit.mysteryHook && (
                          <div className="reverse-syllabus__unit-mystery-hook">
                            {unit.mysteryHook}
                          </div>
                        )}
                      </>
                    ) : (
                      <h2 className="reverse-syllabus__unit-title">{unit.title}</h2>
                    )}
                    <div className="reverse-syllabus__unit-meta">
                      {unit.timeframe && (
                        <span className="reverse-syllabus__unit-timeframe">{unit.timeframe}</span>
                      )}
                      {unit.standards && unit.standards.length > 0 && (
                        <span className="reverse-syllabus__unit-standards">
                          {unit.standards.map((s, i) => (
                            <span key={i} className="reverse-syllabus__standard-tag">{s}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Topics grid */}
                <div className="reverse-syllabus__topics">
                  {unit.topics.map((topic) => {
                    const key = topicKey(unit.title, topic);
                    const isCompleted = completedTopics?.has(key) ?? false;
                    return (
                      <button
                        key={topic}
                        className={`reverse-syllabus__topic${isCompleted ? ' reverse-syllabus__topic--completed' : ''}`}
                        onClick={() => onTopicClick(unit.title, topic)}
                        style={{ '--unit-border': color.border, '--unit-bg': color.bg } as React.CSSProperties}
                      >
                        <span className="reverse-syllabus__topic-emoji">{topicEmoji(topic)}</span>
                        <span className="reverse-syllabus__topic-name">{topic}</span>
                        {isCompleted ? (
                          <span className="reverse-syllabus__topic-check">{'\u2705'}</span>
                        ) : (
                          <span className="reverse-syllabus__topic-explore">{'\u2728'} Explore</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Vocabulary */}
                {unit.keyVocabulary && unit.keyVocabulary.length > 0 && (
                  <div className="reverse-syllabus__vocabulary">
                    <span className="reverse-syllabus__vocab-label">Key Vocab:</span>
                    {unit.keyVocabulary.map((v, i) => (
                      <span key={i} className="reverse-syllabus__vocab-pill">{v}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Path connector between units */}
              {!isLast && <div className="reverse-syllabus__path" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
