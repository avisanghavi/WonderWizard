export default function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <div className="typing-indicator__dots">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      <span className="typing-indicator__text">LabBuddy is thinking...</span>
    </div>
  );
}
