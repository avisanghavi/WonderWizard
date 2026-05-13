import type { ReactNode } from 'react';
import type { SubscriptionTier } from '../../../shared/types';

type GatedFeature =
  | 'syllabusUploads'
  | 'diyGuides'
  | 'labNotebook'
  | 'prioritySupport';

interface TierGateProps {
  feature: GatedFeature;
  currentTier?: SubscriptionTier;
  children: ReactNode;
  onUpgradeClick: () => void;
}

/**
 * Client-side mirror of server-side tier-limits.ts.
 * Keeps the TierGate self-contained — the definitive source of truth
 * is still the server. Reflect any server changes here.
 */
const FEATURE_MATRIX: Record<GatedFeature, Record<SubscriptionTier, boolean>> =
  {
    syllabusUploads: { free: false, family: true, classroom: true },
    diyGuides: { free: false, family: true, classroom: true },
    labNotebook: { free: false, family: true, classroom: true },
    prioritySupport: { free: false, family: false, classroom: true },
  };

const FEATURE_COPY: Record<
  GatedFeature,
  { title: string; description: string; requiredTier: 'Family' | 'Classroom' }
> = {
  syllabusUploads: {
    title: 'Syllabus uploads are a Family feature',
    description:
      'Upload your child\u2019s curriculum and LabBuddy will turn it into a hands-on experiment map.',
    requiredTier: 'Family',
  },
  diyGuides: {
    title: 'Printable DIY guides are a Family feature',
    description:
      'Get printable step-by-step guides with illustrations for every experiment.',
    requiredTier: 'Family',
  },
  labNotebook: {
    title: 'The Lab Notebook is a Family feature',
    description:
      'Save observations, photos, and reflections for every experiment your child runs.',
    requiredTier: 'Family',
  },
  prioritySupport: {
    title: 'Priority support is a Classroom feature',
    description:
      'Get white-glove support and fast response times for your whole classroom.',
    requiredTier: 'Classroom',
  },
};

export default function TierGate({
  feature,
  currentTier = 'free',
  children,
  onUpgradeClick,
}: TierGateProps) {
  const allowed = FEATURE_MATRIX[feature][currentTier];

  if (allowed) {
    return <>{children}</>;
  }

  const copy = FEATURE_COPY[feature];

  return (
    <div className="tier-gate">
      <div className="tier-gate__content" aria-hidden="true">
        {children}
      </div>
      <div className="tier-gate__locked" role="region" aria-label={copy.title}>
        <div className="tier-gate__locked-card">
          <div className="tier-gate__lock-icon" aria-hidden="true">
            {'\uD83D\uDD12'}
          </div>
          <h3 className="tier-gate__locked-title">{copy.title}</h3>
          <p className="tier-gate__locked-description">{copy.description}</p>
          <button
            type="button"
            className="tier-gate__locked-button"
            onClick={onUpgradeClick}
          >
            Upgrade to {copy.requiredTier}
            <span aria-hidden="true"> {'\u2192'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
