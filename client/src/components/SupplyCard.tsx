import { useState } from 'react';
import type { Supply } from '../../../shared/types';

interface SupplyCardProps {
  supplies: Supply[];
  estimatedTotal: { min: number; max: number };
}

export default function SupplyCard({ supplies, estimatedTotal }: SupplyCardProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="supply-card">
      <div className="supply-card__title">🛒 What you'll need</div>
      <div className="supply-card__items">
        {supplies.map((s, i) => (
          <div key={i} className="supply-item">
            <div
              className={`supply-item__checkbox ${checked.has(i) ? 'supply-item__checkbox--checked' : ''}`}
              onClick={() => toggle(i)}
              role="checkbox"
              aria-checked={checked.has(i)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(i);
                }
              }}
            >
              {checked.has(i) ? '✓' : ''}
            </div>
            {s.icon && <span className="supply-item__icon">{s.icon}</span>}
            <div className="supply-item__info">
              <div className="supply-item__name">
                {s.item}
                <span className="supply-item__quantity"> — {s.quantity}</span>
              </div>
              {s.budgetAlternative && (
                <div className="supply-item__budget">💡 Or use: {s.budgetAlternative}</div>
              )}
            </div>
            <span className="supply-item__price">${s.estimatedPrice.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="supply-card__total">
        Estimated total: ${estimatedTotal.min.toFixed(2)} – ${estimatedTotal.max.toFixed(2)}
      </div>
    </div>
  );
}
