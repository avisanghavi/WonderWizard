import { useEffect, useRef } from 'react';
import type { ContentBlock } from '../../../shared/types';

type PredictionRevealBlock = Extract<ContentBlock, { type: 'prediction-reveal' }>;

interface PredictionRevealProps {
  block: PredictionRevealBlock;
  childId: string;
}

/** Side-by-side reveal of "Your guess" vs "What actually happened". */
export default function PredictionReveal({ block, childId }: PredictionRevealProps) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    fetch(
      `/api/gamification/${encodeURIComponent(childId)}/prediction/reveal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictionId: block.predictionId,
          theirChoice: block.theirChoice,
          correctChoice: block.correctChoice,
          wasCorrect: block.wasCorrect,
        }),
      },
    ).catch((err) => {
      console.warn('prediction reveal submit failed', err);
    });
    // intentionally empty deps — fire once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heading = block.wasCorrect ? 'Nailed it!' : 'Plot twist! 🌀';
  const subheading = block.wasCorrect
    ? 'You called it — your guess matched reality.'
    : 'Your wrong guess just earned you +20 Curiosity Points — that’s where real learning happens.';

  return (
    <div
      className={
        'prediction-reveal' +
        (block.wasCorrect ? ' prediction-reveal--correct' : ' prediction-reveal--twist')
      }
      role="region"
      aria-label="Prediction reveal"
    >
      {block.wasCorrect && (
        <div className="prediction-reveal__confetti" aria-hidden="true">
          <span>🎉</span>
          <span>🎊</span>
          <span>✨</span>
          <span>🎉</span>
          <span>✨</span>
        </div>
      )}

      <h3 className="prediction-reveal__heading">{heading}</h3>
      <p className="prediction-reveal__sub">{subheading}</p>

      <div className="prediction-reveal__compare">
        <div className="prediction-reveal__side prediction-reveal__side--guess">
          <div className="prediction-reveal__side-label">Your guess</div>
          <div className="prediction-reveal__side-value">{block.theirChoice}</div>
        </div>
        <div className="prediction-reveal__vs" aria-hidden="true">vs</div>
        <div className="prediction-reveal__side prediction-reveal__side--actual">
          <div className="prediction-reveal__side-label">What actually happened</div>
          <div className="prediction-reveal__side-value">{block.correctChoice}</div>
        </div>
      </div>

      <div className="prediction-reveal__explain">
        <span className="prediction-reveal__explain-icon" aria-hidden="true">💡</span>
        <span className="prediction-reveal__explain-text">{block.explanation}</span>
      </div>
    </div>
  );
}
