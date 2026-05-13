import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../mock-lab.css';

// ---------- types ----------

type Vendor = 'Walmart' | 'Amazon' | 'DoorDash' | 'Target';
type SafetyTier = 'green' | 'yellow' | 'red';
type Difficulty = 'easy' | 'medium' | 'hard';
type Category = 'chemistry' | 'physics' | 'biology' | 'earth-science';

interface VendorOffer {
  vendor: Vendor;
  price: number;
  shippingDays: number;
  inStock: boolean;
  freeShipping: boolean;
  rating: number;
  reviews: number;
  url: string;
}

interface Supply {
  id: string;
  name: string;
  quantity: string;
  category: string;
  icon: string;
  offers: VendorOffer[];
}

interface ExperimentSummary {
  id: string;
  title: string;
  emoji: string;
  unit: string;
  category: Category;
  difficulty: Difficulty;
  duration: number;
  safetyTier: SafetyTier;
  description: string;
}

interface ExperimentFull extends ExperimentSummary {
  scienceConcept: string;
  ngssStandard: string;
  hypothesis: string;
  procedure: string[];
  diagramSvg: string;
  diagramCaption: string;
  supplies: Supply[];
  funFact: string;
}

interface SyllabusUnit {
  unitNumber: number;
  title: string;
  topics: string[];
  standards: string[];
  timeframe: string;
  experimentIds: string[];
}

interface Syllabus {
  id: string;
  subject: string;
  gradeLevel: string;
  teacher: string;
  school: string;
  term: string;
  rawSummary: string;
  units: SyllabusUnit[];
}

interface UploadResponse {
  ok: boolean;
  filename: string;
  parsedAt: string;
  syllabus: Syllabus;
  experimentSummaries: ExperimentSummary[];
}

type Step = 'upload' | 'pick' | 'detail';

// ---------- vendor metadata ----------

const VENDOR_META: Record<Vendor, { color: string; tagline: string; logo: string }> = {
  Walmart: { color: '#0071dc', tagline: 'Save money. Live better.', logo: 'W' },
  Amazon: { color: '#ff9900', tagline: 'Prime ships in 1 day', logo: 'a' },
  Target: { color: '#cc0000', tagline: 'Expect more. Pay less.', logo: 'T' },
  DoorDash: { color: '#eb1700', tagline: 'Same-day delivery', logo: 'D' },
};

// ---------- helpers ----------

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} hr`;
  return `${Math.round(min / 1440)} day${min >= 2880 ? 's' : ''}`;
}

function bestPriceVendor(offers: VendorOffer[]): VendorOffer {
  return [...offers].sort((a, b) => a.price - b.price)[0];
}

// ---------- component ----------

export default function MockLabPage({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'reading' | 'parsing' | 'done'>('idle');
  const [uploaded, setUploaded] = useState<UploadResponse | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [selectedExp, setSelectedExp] = useState<ExperimentFull | null>(null);
  const [chosenVendor, setChosenVendor] = useState<Record<string, Vendor>>({});
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- upload (any file or none) ----------

  const performUpload = useCallback(async (file: File | null) => {
    setUploadProgress('reading');
    setFilename(file?.name ?? 'demo-syllabus.pdf');

    // Brief simulated read
    await new Promise((r) => setTimeout(r, 600));
    setUploadProgress('parsing');

    try {
      const fd = new FormData();
      if (file) fd.append('syllabus', file);
      fd.append('filename', file?.name ?? 'demo-syllabus.pdf');

      const res = await fetch('/api/mock-lab/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data: UploadResponse = await res.json();
      setUploaded(data);
      setUploadProgress('done');
      // brief celebration pause
      setTimeout(() => setStep('pick'), 600);
    } catch {
      // Even on failure, fall back to GET endpoint so the demo always works.
      const res = await fetch('/api/mock-lab/syllabus');
      const data = await res.json();
      setUploaded({
        ok: true,
        filename: file?.name ?? 'demo-syllabus.pdf',
        parsedAt: new Date().toISOString(),
        syllabus: data.syllabus,
        experimentSummaries: data.experimentSummaries,
      });
      setUploadProgress('done');
      setTimeout(() => setStep('pick'), 600);
    }
  }, []);

  const handleSkip = useCallback(() => {
    performUpload(null);
  }, [performUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    performUpload(file ?? null);
  }, [performUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    performUpload(file);
  }, [performUpload]);

  // ---------- choose experiment ----------

  const pickExperiment = useCallback(async (id: string) => {
    const res = await fetch(`/api/mock-lab/experiments/${id}`);
    const data = await res.json();
    if (data.ok) {
      setSelectedExp(data.experiment);
      // default to best price for each supply
      const defaults: Record<string, Vendor> = {};
      for (const s of data.experiment.supplies as Supply[]) {
        defaults[s.id] = bestPriceVendor(s.offers).vendor;
      }
      setChosenVendor(defaults);
      setCartIds(new Set((data.experiment.supplies as Supply[]).map((s) => s.id)));
      setStep('detail');
    }
  }, []);

  // ---------- cart math ----------

  const cartTotals = useMemo(() => {
    if (!selectedExp) return null;
    const byVendor: Record<Vendor, number> = { Walmart: 0, Amazon: 0, Target: 0, DoorDash: 0 };
    let chosenSubtotal = 0;
    let bestSubtotal = 0;
    for (const s of selectedExp.supplies) {
      if (!cartIds.has(s.id)) continue;
      const chosen = s.offers.find((o) => o.vendor === chosenVendor[s.id]);
      if (chosen) chosenSubtotal += chosen.price;
      const best = bestPriceVendor(s.offers);
      bestSubtotal += best.price;
      for (const o of s.offers) byVendor[o.vendor] += o.price;
    }
    return {
      chosenSubtotal: Math.round(chosenSubtotal * 100) / 100,
      bestSubtotal: Math.round(bestSubtotal * 100) / 100,
      byVendor: Object.fromEntries(
        Object.entries(byVendor).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ) as Record<Vendor, number>,
    };
  }, [selectedExp, cartIds, chosenVendor]);

  // ---------- render ----------

  useEffect(() => {
    document.body.classList.add('mock-lab-body');
    return () => document.body.classList.remove('mock-lab-body');
  }, []);

  return (
    <div className="mock-lab">
      <header className="mock-lab__header">
        <button className="mock-lab__back" onClick={onClose} aria-label="Back">
          ← Back to LabBuddy
        </button>
        <div className="mock-lab__crumbs">
          <span className={`crumb ${step === 'upload' ? 'crumb--active' : 'crumb--done'}`}>
            <span className="crumb__num">1</span>Upload syllabus
          </span>
          <span className="crumb__sep">›</span>
          <span className={`crumb ${step === 'pick' ? 'crumb--active' : step === 'detail' ? 'crumb--done' : ''}`}>
            <span className="crumb__num">2</span>Pick experiment
          </span>
          <span className="crumb__sep">›</span>
          <span className={`crumb ${step === 'detail' ? 'crumb--active' : ''}`}>
            <span className="crumb__num">3</span>Diagram & supplies
          </span>
        </div>
      </header>

      <main className="mock-lab__main">
        {step === 'upload' && (
          <UploadStep
            dragActive={dragActive}
            setDragActive={setDragActive}
            uploadProgress={uploadProgress}
            filename={filename}
            fileInputRef={fileInputRef}
            onDrop={handleDrop}
            onFileInput={handleFileInput}
            onSkip={handleSkip}
          />
        )}

        {step === 'pick' && uploaded && (
          <PickStep
            uploaded={uploaded}
            onPick={pickExperiment}
          />
        )}

        {step === 'detail' && selectedExp && cartTotals && (
          <DetailStep
            exp={selectedExp}
            cartIds={cartIds}
            setCartIds={setCartIds}
            chosenVendor={chosenVendor}
            setChosenVendor={setChosenVendor}
            cartTotals={cartTotals}
            onBack={() => setStep('pick')}
          />
        )}
      </main>
    </div>
  );
}

// ---------- Step 1: Upload ----------

function UploadStep(props: {
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  uploadProgress: 'idle' | 'reading' | 'parsing' | 'done';
  filename: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSkip: () => void;
}) {
  const { dragActive, setDragActive, uploadProgress, filename, fileInputRef, onDrop, onFileInput, onSkip } = props;
  const isLoading = uploadProgress !== 'idle';

  return (
    <section className="step step--upload">
      <div className="step__hero">
        <div className="step__eyebrow">Step 1 of 3</div>
        <h1 className="step__title">Drop your syllabus, get a curated lab plan.</h1>
        <p className="step__lede">
          Upload a PDF, photo, or Word doc — we'll detect units, NGSS standards, and matching hands-on experiments. <span className="muted">(Demo mode: any file works.)</span>
        </p>
      </div>

      <div className="upload-wrap">
        {!isLoading && (
          <div
            className={`dropzone ${dragActive ? 'dropzone--active' : ''}`}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <div className="dropzone__icon" aria-hidden>
              <svg viewBox="0 0 64 64" width="64" height="64">
                <defs>
                  <linearGradient id="dzG" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#6C63FF"/><stop offset="1" stopColor="#4ECDC4"/>
                  </linearGradient>
                </defs>
                <rect x="10" y="6" width="36" height="44" rx="4" fill="#fff" stroke="url(#dzG)" strokeWidth="2.5"/>
                <path d="M46 6 L46 18 L58 18" fill="none" stroke="url(#dzG)" strokeWidth="2.5"/>
                <path d="M58 18 L46 6" fill="#fff" stroke="url(#dzG)" strokeWidth="2.5"/>
                <line x1="18" y1="24" x2="38" y2="24" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round"/>
                <line x1="18" y1="32" x2="42" y2="32" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round"/>
                <line x1="18" y1="40" x2="34" y2="40" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="dropzone__title">Drag your syllabus here</div>
            <div className="dropzone__or">or click to browse</div>
            <div className="dropzone__formats">PDF · DOCX · JPG · PNG · TXT</div>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={onFileInput}
              accept=".pdf,.docx,.jpg,.jpeg,.png,.txt"
            />
          </div>
        )}

        {isLoading && (
          <div className="processing">
            <div className="processing__filebar">
              <div className="processing__file-icon">📄</div>
              <div>
                <div className="processing__file-name">{filename}</div>
                <div className="processing__file-status">
                  {uploadProgress === 'reading' && 'Reading file…'}
                  {uploadProgress === 'parsing' && 'Detecting units & standards with AI…'}
                  {uploadProgress === 'done' && 'Done — opening curriculum'}
                </div>
              </div>
              {uploadProgress === 'done' && <div className="processing__check">✓</div>}
            </div>

            <div className="progress">
              <div
                className={`progress__bar ${uploadProgress === 'done' ? 'progress__bar--done' : ''}`}
                style={{
                  width:
                    uploadProgress === 'reading' ? '35%' :
                    uploadProgress === 'parsing' ? '75%' :
                    '100%',
                }}
              />
            </div>

            <ul className="processing__steps">
              <li className={uploadProgress === 'reading' || uploadProgress === 'parsing' || uploadProgress === 'done' ? 'done' : ''}>
                <span className="dot" /> Extracting text from document
              </li>
              <li className={uploadProgress === 'parsing' || uploadProgress === 'done' ? 'done' : ''}>
                <span className="dot" /> Identifying units, topics, standards
              </li>
              <li className={uploadProgress === 'done' ? 'done' : ''}>
                <span className="dot" /> Matching to hands-on experiments
              </li>
            </ul>
          </div>
        )}

        {!isLoading && (
          <button className="skip-btn" onClick={onSkip}>
            <span>or skip — try the demo curriculum</span>
            <span aria-hidden>→</span>
          </button>
        )}
      </div>

      <div className="reassure">
        <div className="reassure__item"><span className="reassure__icon">🔒</span> Your file stays on your device</div>
        <div className="reassure__item"><span className="reassure__icon">⚡</span> Parsed in under 5 seconds</div>
        <div className="reassure__item"><span className="reassure__icon">🎯</span> NGSS-aligned matches</div>
      </div>
    </section>
  );
}

// ---------- Step 2: Pick experiment ----------

function PickStep({ uploaded, onPick }: { uploaded: UploadResponse; onPick: (id: string) => void }) {
  const { syllabus, experimentSummaries } = uploaded;

  // Group experiments by unit
  const byUnit = useMemo(() => {
    const map = new Map<number, ExperimentSummary[]>();
    for (const u of syllabus.units) map.set(u.unitNumber, []);
    for (const e of experimentSummaries) {
      const unit = syllabus.units.find((u) => u.experimentIds.includes(e.id));
      if (unit) {
        const arr = map.get(unit.unitNumber) ?? [];
        arr.push(e);
        map.set(unit.unitNumber, arr);
      }
    }
    return map;
  }, [syllabus, experimentSummaries]);

  return (
    <section className="step step--pick">
      <div className="syllabus-card">
        <div className="syllabus-card__icon">📚</div>
        <div className="syllabus-card__body">
          <div className="syllabus-card__row">
            <span className="syllabus-card__pill">Parsed</span>
            <span className="syllabus-card__filename">{uploaded.filename}</span>
          </div>
          <h2 className="syllabus-card__title">{syllabus.subject}</h2>
          <div className="syllabus-card__meta">
            <span>{syllabus.gradeLevel}</span>
            <span className="dot-sep">•</span>
            <span>{syllabus.teacher}</span>
            <span className="dot-sep">•</span>
            <span>{syllabus.school}</span>
            <span className="dot-sep">•</span>
            <span>{syllabus.term}</span>
          </div>
          <p className="syllabus-card__summary">{syllabus.rawSummary}</p>
        </div>
        <div className="syllabus-card__stats">
          <div className="stat"><div className="stat__num">{syllabus.units.length}</div><div className="stat__label">Units</div></div>
          <div className="stat"><div className="stat__num">{experimentSummaries.length}</div><div className="stat__label">Experiments</div></div>
          <div className="stat">
            <div className="stat__num">
              {syllabus.units.reduce((acc, u) => acc + u.standards.length, 0)}
            </div>
            <div className="stat__label">Standards</div>
          </div>
        </div>
      </div>

      <div className="step__section-head">
        <h2>Pick an experiment to run</h2>
        <p>One curated, age-appropriate experiment per unit, matched to NGSS standards.</p>
      </div>

      <div className="units-list">
        {syllabus.units.map((unit) => {
          const exps = byUnit.get(unit.unitNumber) ?? [];
          return (
            <div className="unit" key={unit.unitNumber}>
              <div className="unit__head">
                <div className="unit__number">U{unit.unitNumber}</div>
                <div className="unit__meta">
                  <h3 className="unit__title">{unit.title}</h3>
                  <div className="unit__sub">
                    <span>{unit.timeframe}</span>
                    <span className="dot-sep">•</span>
                    <span>{unit.standards.join(', ')}</span>
                  </div>
                  <div className="unit__topics">
                    {unit.topics.map((t) => (
                      <span className="topic-chip" key={t}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="exp-grid">
                {exps.map((exp) => (
                  <button className="exp-card" onClick={() => onPick(exp.id)} key={exp.id}>
                    <div className={`exp-card__hero exp-card__hero--${exp.category}`}>
                      <span className="exp-card__emoji">{exp.emoji}</span>
                    </div>
                    <div className="exp-card__body">
                      <h4 className="exp-card__title">{exp.title}</h4>
                      <p className="exp-card__desc">{exp.description}</p>
                      <div className="exp-card__tags">
                        <span className={`tag tag--safety-${exp.safetyTier}`}>
                          {exp.safetyTier === 'green' ? '✓ Safe' : exp.safetyTier === 'yellow' ? '⚠ Adult help' : '⛔ Adult only'}
                        </span>
                        <span className={`tag tag--diff-${exp.difficulty}`}>{exp.difficulty}</span>
                        <span className="tag tag--time">⏱ {formatDuration(exp.duration)}</span>
                      </div>
                    </div>
                    <div className="exp-card__cta">Run experiment →</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Step 3: Detail (diagram + buy) ----------

function DetailStep(props: {
  exp: ExperimentFull;
  cartIds: Set<string>;
  setCartIds: (s: Set<string>) => void;
  chosenVendor: Record<string, Vendor>;
  setChosenVendor: (v: Record<string, Vendor>) => void;
  cartTotals: { chosenSubtotal: number; bestSubtotal: number; byVendor: Record<Vendor, number> };
  onBack: () => void;
}) {
  const { exp, cartIds, setCartIds, chosenVendor, setChosenVendor, cartTotals, onBack } = props;

  const toggleSupply = (id: string) => {
    const next = new Set(cartIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCartIds(next);
  };

  const setVendor = (supplyId: string, vendor: Vendor) => {
    setChosenVendor({ ...chosenVendor, [supplyId]: vendor });
  };

  const oneClickAll = (vendor: Vendor) => {
    const next: Record<string, Vendor> = {};
    for (const s of exp.supplies) next[s.id] = vendor;
    setChosenVendor(next);
  };

  return (
    <section className="step step--detail">
      <button className="back-pill" onClick={onBack}>← All experiments</button>

      <div className="detail-head">
        <div className={`detail-head__hero detail-head__hero--${exp.category}`}>
          <span className="detail-head__emoji">{exp.emoji}</span>
        </div>
        <div className="detail-head__body">
          <div className="detail-head__unit">{exp.unit}</div>
          <h1 className="detail-head__title">{exp.title}</h1>
          <p className="detail-head__desc">{exp.description}</p>
          <div className="detail-head__tags">
            <span className={`tag tag--safety-${exp.safetyTier}`}>
              {exp.safetyTier === 'green' ? '✓ Safe to run' : exp.safetyTier === 'yellow' ? '⚠ Adult help needed' : '⛔ Adult only'}
            </span>
            <span className={`tag tag--diff-${exp.difficulty}`}>{exp.difficulty}</span>
            <span className="tag tag--time">⏱ {formatDuration(exp.duration)}</span>
            <span className="tag tag--ngss">{exp.ngssStandard.split(' — ')[0]}</span>
          </div>
        </div>
      </div>

      {/* DIAGRAM */}
      <div className="diagram-card">
        <div className="diagram-card__head">
          <div className="diagram-card__title">
            <span className="diagram-card__icon">🧪</span> How it works
          </div>
          <div className="diagram-card__sub">{exp.diagramCaption}</div>
        </div>
        <div
          className="diagram-card__svg"
          dangerouslySetInnerHTML={{ __html: exp.diagramSvg }}
        />
        <div className="diagram-card__legend">
          <div className="legend-item">
            <span className="legend-item__label">Concept</span>
            <span className="legend-item__value">{exp.scienceConcept}</span>
          </div>
        </div>
      </div>

      {/* TWO-COL: procedure + hypothesis/funfact */}
      <div className="info-grid">
        <div className="info-card">
          <div className="info-card__title">📝 Procedure</div>
          <ol className="procedure">
            {exp.procedure.map((p, i) => (
              <li key={i}><span className="procedure__num">{i + 1}</span><span>{p}</span></li>
            ))}
          </ol>
        </div>
        <div className="info-card-stack">
          <div className="info-card info-card--accent">
            <div className="info-card__title">💡 Hypothesis</div>
            <p>{exp.hypothesis}</p>
          </div>
          <div className="info-card info-card--purple">
            <div className="info-card__title">🎯 NGSS standard</div>
            <p>{exp.ngssStandard}</p>
          </div>
          <div className="info-card info-card--coral">
            <div className="info-card__title">✨ Fun fact</div>
            <p>{exp.funFact}</p>
          </div>
        </div>
      </div>

      {/* SUPPLIES */}
      <div className="step__section-head">
        <h2>Supplies — buy in one click</h2>
        <p>Compare prices across Walmart, Amazon, Target, and DoorDash. We default to the lowest price.</p>
      </div>

      <div className="quick-actions">
        <span className="quick-actions__label">One-click cart at:</span>
        {(Object.keys(VENDOR_META) as Vendor[]).map((v) => (
          <button key={v} className="vendor-pill" style={{ borderColor: VENDOR_META[v].color, color: VENDOR_META[v].color }} onClick={() => oneClickAll(v)}>
            <span className="vendor-pill__logo" style={{ background: VENDOR_META[v].color }}>{VENDOR_META[v].logo}</span>
            <span>{v} — ${cartTotals.byVendor[v].toFixed(2)}</span>
          </button>
        ))}
      </div>

      <div className="supplies-list">
        {exp.supplies.map((s) => (
          <SupplyRow
            key={s.id}
            supply={s}
            inCart={cartIds.has(s.id)}
            onToggle={() => toggleSupply(s.id)}
            chosenVendor={chosenVendor[s.id]}
            onChoose={(v) => setVendor(s.id, v)}
          />
        ))}
      </div>

      {/* CART */}
      <div className="cart">
        <div className="cart__row">
          <div className="cart__items">{cartIds.size} of {exp.supplies.length} supplies in cart</div>
          <div className="cart__total">
            <span className="cart__total-label">Estimated total</span>
            <span className="cart__total-value">${cartTotals.chosenSubtotal.toFixed(2)}</span>
          </div>
        </div>
        <div className="cart__actions">
          <button className="cart__btn cart__btn--ghost">Save list to lab notebook</button>
          <button className="cart__btn cart__btn--primary">
            Check out — ${cartTotals.chosenSubtotal.toFixed(2)}
            <span className="cart__btn-sub">across {new Set(Object.values(chosenVendor).filter((v, i) => Array.from(cartIds)[i])).size} stores</span>
          </button>
        </div>
        {cartTotals.chosenSubtotal > cartTotals.bestSubtotal && (
          <div className="cart__hint">
            Save ${(cartTotals.chosenSubtotal - cartTotals.bestSubtotal).toFixed(2)} by switching to lowest-price vendor for each item.
          </div>
        )}
      </div>
    </section>
  );
}

function SupplyRow(props: {
  supply: Supply;
  inCart: boolean;
  onToggle: () => void;
  chosenVendor: Vendor;
  onChoose: (v: Vendor) => void;
}) {
  const { supply, inCart, onToggle, chosenVendor, onChoose } = props;
  const cheapest = bestPriceVendor(supply.offers);

  return (
    <div className={`supply ${inCart ? '' : 'supply--unchecked'}`}>
      <label className="supply__check">
        <input type="checkbox" checked={inCart} onChange={onToggle} />
        <span className="supply__check-box" />
      </label>

      <div className="supply__icon" aria-hidden>{supply.icon}</div>

      <div className="supply__info">
        <div className="supply__name">{supply.name}</div>
        <div className="supply__qty">{supply.quantity} · {supply.category}</div>
      </div>

      <div className="supply__offers">
        {supply.offers.map((o) => {
          const isChosen = o.vendor === chosenVendor;
          const isCheapest = o.vendor === cheapest.vendor;
          return (
            <button
              key={o.vendor}
              className={`offer ${isChosen ? 'offer--chosen' : ''}`}
              style={isChosen ? { borderColor: VENDOR_META[o.vendor].color } : undefined}
              onClick={() => onChoose(o.vendor)}
            >
              <div className="offer__head">
                <span className="offer__vendor-logo" style={{ background: VENDOR_META[o.vendor].color }}>
                  {VENDOR_META[o.vendor].logo}
                </span>
                <span className="offer__vendor">{o.vendor}</span>
                {isCheapest && <span className="offer__badge">cheapest</span>}
              </div>
              <div className="offer__price">${o.price.toFixed(2)}</div>
              <div className="offer__ship">
                {o.shippingDays === 0 ? 'Today' : o.shippingDays === 1 ? 'Tomorrow' : `${o.shippingDays} days`}
                {o.freeShipping && ' · free ship'}
              </div>
              <div className="offer__rating">★ {o.rating.toFixed(1)} <span>({o.reviews.toLocaleString()})</span></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
