import type { ContentBlock } from '../../../shared/types';

type WhyTeaserBlock = Extract<ContentBlock, { type: 'why-teaser' }>;

interface WhyTeaserProps {
  block: WhyTeaserBlock;
  onPullThread: (seed: string) => void;
}

/** Quote-style "want to know what's wild?" teaser that ends a thought. */
export default function WhyTeaser({ block, onPullThread }: WhyTeaserProps) {
  return (
    <div className="why-teaser" role="note">
      <div className="why-teaser__hook">{block.hook}</div>
      <div className="why-teaser__seed">{block.seed}</div>
      <button
        type="button"
        className="why-teaser__btn"
        onClick={() => onPullThread(block.seed)}
        aria-label="Pull this thread"
      >
        → Pull this thread
      </button>
    </div>
  );
}
