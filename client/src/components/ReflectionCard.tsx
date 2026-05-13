import { useState } from 'react';

interface ReflectionCardProps {
  question: string;
  hint?: string;
  onSubmit: (text: string) => void;
}

export default function ReflectionCard({ question, hint, onSubmit }: ReflectionCardProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    if (!answer.trim()) return;
    onSubmit(answer.trim());
    setAnswer('');
  };

  return (
    <div className="reflection-card">
      <div className="reflection-card__question">🤔 {question}</div>
      {hint && <div className="reflection-card__hint">{hint}</div>}
      <textarea
        className="reflection-card__textarea"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Write your thoughts here..."
      />
      <button
        className="btn btn--primary"
        onClick={handleSubmit}
        disabled={!answer.trim()}
      >
        💬 Share my answer
      </button>
    </div>
  );
}
