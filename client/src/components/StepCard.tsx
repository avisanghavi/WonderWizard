import { useState, useRef, useEffect, useCallback } from 'react';
import type { ExperimentStep } from '../../../shared/types';

interface StepCardProps {
  step: ExperimentStep;
  stepNumber: number;
  totalSteps: number;
  onDone: (text: string) => void;
}

export default function StepCard({ step, stepNumber, totalSteps, onDone }: StepCardProps) {
  const [timerRunning, setTimerRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState((step.durationMinutes ?? 0) * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const startTimer = () => {
    if (timerRunning) return;
    setTimerRunning(true);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="step-card">
      <div className="step-card__counter">
        Step {stepNumber} of {totalSteps}
      </div>
      <div className="step-card__instruction">{step.instruction}</div>

      {step.tip && (
        <div className="step-box step-box--tip">
          <span className="step-box__icon">💡</span>
          <span>{step.tip}</span>
        </div>
      )}

      {step.scienceNote && (
        <div className="step-box step-box--science">
          <span className="step-box__icon">🧠</span>
          <span>{step.scienceNote}</span>
        </div>
      )}

      {step.safetyWarning && (
        <div className="step-box step-box--safety">
          <span className="step-box__icon">🛑</span>
          <span>{step.safetyWarning}</span>
        </div>
      )}

      <div className="step-card__actions">
        {step.durationMinutes != null && step.durationMinutes > 0 && (
          <button
            className="btn btn--timer"
            onClick={startTimer}
            disabled={timerRunning || secondsLeft === 0}
          >
            ⏱ {secondsLeft === 0 ? 'Done!' : timerRunning ? formatTime(secondsLeft) : `Start ${step.durationMinutes}m timer`}
          </button>
        )}
        <button
          className="btn btn--done"
          onClick={() => onDone(`Done with step ${stepNumber}!`)}
        >
          ✅ Done with this step!
        </button>
      </div>
    </div>
  );
}
