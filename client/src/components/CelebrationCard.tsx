const CONFETTI = ['🎉', '🎊', '⭐', '🏆', '🎈'];

interface CelebrationCardProps {
  message: string;
}

export default function CelebrationCard({ message }: CelebrationCardProps) {
  return (
    <div className="celebration-card">
      <div className="celebration-card__confetti">
        {CONFETTI.map((emoji, i) => (
          <span key={i} className="confetti-piece">{emoji}</span>
        ))}
      </div>
      <div className="celebration-card__message">{message}</div>
    </div>
  );
}
