import type { MouseEvent } from 'react';

type UpgradeVariant = 'banner' | 'inline' | 'floating';

interface UpgradeCTAProps {
  message?: string;
  onClick: () => void;
  variant?: UpgradeVariant;
}

const DEFAULT_MESSAGES: Record<UpgradeVariant, string> = {
  banner: 'Unlock everything with Family',
  inline: 'Upgrade to Family for unlimited experiments and more',
  floating: 'Upgrade',
};

export default function UpgradeCTA({
  message,
  onClick,
  variant = 'banner',
}: UpgradeCTAProps) {
  const text = message ?? DEFAULT_MESSAGES[variant];

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onClick();
  };

  if (variant === 'floating') {
    return (
      <button
        type="button"
        className="upgrade-cta upgrade-cta--floating"
        onClick={handleClick}
        aria-label="Upgrade your plan"
      >
        <span className="upgrade-cta__icon" aria-hidden="true">
          {'\u2B50'}
        </span>
        <span className="upgrade-cta__text">{text}</span>
      </button>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="upgrade-cta upgrade-cta--inline">
        <div className="upgrade-cta__content">
          <span
            className="upgrade-cta__icon upgrade-cta__icon--inline"
            aria-hidden="true"
          >
            {'\u2728'}
          </span>
          <span className="upgrade-cta__text">{text}</span>
        </div>
        <button
          type="button"
          className="upgrade-cta__button"
          onClick={handleClick}
        >
          Upgrade
          <span aria-hidden="true"> {'\u2192'}</span>
        </button>
      </div>
    );
  }

  // banner (default)
  return (
    <button
      type="button"
      className="upgrade-cta upgrade-cta--banner"
      onClick={handleClick}
    >
      <span className="upgrade-cta__icon" aria-hidden="true">
        {'\u2728'}
      </span>
      <span className="upgrade-cta__text">{text}</span>
      <span className="upgrade-cta__arrow" aria-hidden="true">
        {'\u2192'}
      </span>
    </button>
  );
}
