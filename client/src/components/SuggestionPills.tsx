interface SuggestionPillsProps {
  options: string[];
  onClick: (text: string) => void;
}

export default function SuggestionPills({ options, onClick }: SuggestionPillsProps) {
  return (
    <div className="suggestion-pills">
      {options.map((option, i) => (
        <button
          key={i}
          className="suggestion-pill"
          onClick={() => onClick(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
