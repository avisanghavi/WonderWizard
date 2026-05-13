import type { ParsedSyllabus } from '../../../shared/types';

interface SyllabusBarProps {
  syllabi: ParsedSyllabus[];
  onRemove: (syllabusId: string) => void;
  onAdd: () => void;
  onSelect: (syllabus: ParsedSyllabus) => void;
  onOpenCurriculumMap?: () => void;
}

export default function SyllabusBar({ syllabi, onRemove, onAdd, onSelect, onOpenCurriculumMap }: SyllabusBarProps) {
  if (syllabi.length === 0) return null;

  const subjectIcon = (subject: string): string => {
    const lower = subject.toLowerCase();
    if (lower.includes('math') || lower.includes('algebra') || lower.includes('geometry') || lower.includes('calculus'))
      return '\uD83D\uDCD0';
    if (lower.includes('science') || lower.includes('biology') || lower.includes('chemistry') || lower.includes('physics'))
      return '\uD83D\uDCD8';
    if (lower.includes('english') || lower.includes('writing') || lower.includes('literature') || lower.includes('reading'))
      return '\uD83D\uDCD5';
    if (lower.includes('history') || lower.includes('social') || lower.includes('geography'))
      return '\uD83D\uDCD9';
    if (lower.includes('art') || lower.includes('music'))
      return '\uD83C\uDFA8';
    return '\uD83D\uDCD7';
  };

  return (
    <div className="syllabus-bar">
      <span className="syllabus-bar__label">Syllabi:</span>
      <div className="syllabus-bar__pills">
        {syllabi.map(s => (
          <span key={s.id} className="syllabus-pill" onClick={() => onSelect(s)}>
            <span className="syllabus-pill__icon">{subjectIcon(s.subject)}</span>
            <span className="syllabus-pill__text">
              {s.gradeLevel} {s.subject}
            </span>
            <button
              className="syllabus-pill__remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(s.id);
              }}
              aria-label={`Remove ${s.subject}`}
            >
              &times;
            </button>
          </span>
        ))}
        <button className="syllabus-bar__add" onClick={onAdd} aria-label="Upload another syllabus">
          +
        </button>
      </div>
      {onOpenCurriculumMap && (
        <button className="syllabus-bar__map-btn" onClick={onOpenCurriculumMap}>
          &#128215; Curriculum Map
        </button>
      )}
    </div>
  );
}
