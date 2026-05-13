interface SafetyAlertProps {
  level: 'info' | 'caution' | 'warning';
  message: string;
}

const LEVEL_ICON: Record<string, string> = {
  info: 'ℹ️',
  caution: '⚠️',
  warning: '🛑',
};

export default function SafetyAlert({ level, message }: SafetyAlertProps) {
  return (
    <div className={`safety-alert safety-alert--${level}`}>
      <span className="safety-alert__icon">{LEVEL_ICON[level]}</span>
      <span>{message}</span>
    </div>
  );
}
