import { useMemo, useState } from 'react';

interface DiagramViewProps {
  /** Image URL produced by the schematic generator (preferred). */
  imageUrl?: string;
  /** Inline SVG markup (legacy fallback when no imageUrl is available). */
  svg?: string;
  description: string;
  /** Optional hint used as the <img> alt text and as a soft loading caption. */
  aspect?: 'landscape' | 'portrait' | 'square';
}

function sanitizeSvg(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '');
}

export default function DiagramView({ imageUrl, svg, description, aspect }: DiagramViewProps) {
  const cleanSvg = useMemo(() => (svg ? sanitizeSvg(svg) : ''), [svg]);
  const [imgFailed, setImgFailed] = useState(false);

  // Prefer the generated image URL, falling back to inline SVG, falling back to
  // a soft "drawing…" placeholder while we wait. Never show an error icon —
  // the placeholder absorbs failure modes gracefully.
  const showImage = !!imageUrl && !imgFailed;
  const showSvg = !showImage && !!cleanSvg;
  const showPlaceholder = !showImage && !showSvg;

  return (
    <div className={`diagram-card diagram-card--${aspect ?? 'landscape'}`}>
      {showImage && (
        <img
          className="diagram-card__image"
          src={imageUrl}
          alt={description}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      )}

      {showSvg && (
        <div
          className="diagram-card__svg"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: cleanSvg }}
        />
      )}

      {showPlaceholder && (
        <div
          className="diagram-card__placeholder"
          aria-label={description || 'Diagram'}
          role="img"
        >
          <div className="diagram-card__placeholder-icon">🎨</div>
          <div className="diagram-card__placeholder-text">{description || 'Drawing your diagram…'}</div>
        </div>
      )}

      {description && !showPlaceholder && (
        <div className="diagram-card__desc">{description}</div>
      )}
    </div>
  );
}
