import type { ChatMessage, ContentBlock, DIYGuide } from '../../../shared/types';
import ExperimentCard from './ExperimentCard';
import SupplyCard from './SupplyCard';
import StepCard from './StepCard';
import DiagramView from './DiagramView';
import SuggestionPills from './SuggestionPills';
import ReflectionCard from './ReflectionCard';
import CelebrationCard from './CelebrationCard';
import SafetyAlert from './SafetyAlert';
import PredictionCard from './PredictionCard';
import PredictionReveal from './PredictionReveal';
import MysteryCard from './MysteryCard';
import WhyTeaser from './WhyTeaser';

interface MessageBubbleProps {
  message: ChatMessage;
  onSuggestionClick: (text: string) => void;
  onSendMessage: (text: string) => void;
  onOpenDIYGuide?: (guide: DIYGuide) => void;
  sessionId?: string;
  childId?: string;
}

function renderBlock(
  block: ContentBlock,
  index: number,
  onSuggestionClick: (text: string) => void,
  onSendMessage: (text: string) => void,
  childId: string,
  onOpenDIYGuide?: (guide: DIYGuide) => void,
  sessionId?: string,
) {
  switch (block.type) {
    case 'text':
      return (
        <div key={index} className="message-text">
          {block.text}
        </div>
      );
    case 'experiment-card':
      return <ExperimentCard key={index} experiment={block.experiment} onOpenDIYGuide={onOpenDIYGuide} sessionId={sessionId} />;
    case 'supply-list':
      return (
        <SupplyCard
          key={index}
          supplies={block.supplies}
          estimatedTotal={block.estimatedTotal}
        />
      );
    case 'step':
      return (
        <StepCard
          key={index}
          step={block.step}
          stepNumber={block.stepNumber}
          totalSteps={block.totalSteps}
          onDone={onSendMessage}
        />
      );
    case 'diagram':
      return (
        <DiagramView
          key={index}
          imageUrl={block.imageUrl}
          svg={block.svg}
          description={block.description}
          aspect={block.aspect}
        />
      );
    case 'suggestions':
      return <SuggestionPills key={index} options={block.options} onClick={onSuggestionClick} />;
    case 'reflection':
      return (
        <ReflectionCard
          key={index}
          question={block.question}
          hint={block.hint}
          onSubmit={onSendMessage}
        />
      );
    case 'celebration':
      return <CelebrationCard key={index} message={block.message} />;
    case 'safety-alert':
      return <SafetyAlert key={index} level={block.level} message={block.message} />;
    case 'prediction-prompt':
      return <PredictionCard key={index} block={block} childId={childId} />;
    case 'prediction-reveal':
      return <PredictionReveal key={index} block={block} childId={childId} />;
    case 'mystery-card':
      return (
        <MysteryCard
          key={index}
          mystery={block.mystery}
          variant="inline"
          onInvestigate={onSendMessage}
        />
      );
    case 'why-teaser':
      return <WhyTeaser key={index} block={block} onPullThread={onSendMessage} />;
    default:
      return null;
  }
}

export default function MessageBubble({ message, onSuggestionClick, onSendMessage, onOpenDIYGuide, sessionId, childId }: MessageBubbleProps) {
  const effectiveChildId = childId ?? sessionId ?? '';
  return (
    <div className={`message-row message-row--${message.role}`}>
      <div className={`message-bubble message-bubble--${message.role}`}>
        {message.content.map((block, i) =>
          renderBlock(block, i, onSuggestionClick, onSendMessage, effectiveChildId, onOpenDIYGuide, sessionId),
        )}
      </div>
    </div>
  );
}
