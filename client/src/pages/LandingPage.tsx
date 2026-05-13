import '../landing.css';

interface LandingPageProps {
  onGetStarted: () => void;
  onParentSignIn: () => void;
}

interface Feature {
  emoji: string;
  title: string;
  description: string;
}

interface Step {
  number: string;
  emoji: string;
  title: string;
}

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  ctaLabel: string;
  badge?: string;
  highlighted?: boolean;
}

interface SafetyItem {
  emoji: string;
  text: string;
}

interface Testimonial {
  quote: string;
  author: string;
}

const FEATURES: Feature[] = [
  {
    emoji: '\u{1F3AF}',
    title: 'Custom experiments for any interest',
    description:
      "Just tell LabBuddy what you're curious about. It designs a hands-on activity in seconds.",
  },
  {
    emoji: '\u{1F4DA}',
    title: 'Curriculum-aligned',
    description:
      "Upload your school syllabus and every activity connects to what you're learning in class.",
  },
  {
    emoji: '\u{1F5FA}\u{FE0F}',
    title: 'Visual learning map',
    description:
      'Turn your syllabus into an interactive adventure. Click any topic to explore.',
  },
  {
    emoji: '\u{1F4D6}',
    title: 'WikiHow-style guides',
    description: 'Step-by-step illustrated instructions for every experiment.',
  },
  {
    emoji: '\u{1F3C6}',
    title: 'XP, badges & streaks',
    description: 'Make learning a habit with daily streaks and achievements.',
  },
  {
    emoji: '\u{1F4D3}',
    title: 'Lab notebook',
    description:
      'Kids photograph their work and build a portfolio parents love.',
  },
];

const STEPS: Step[] = [
  {
    number: '1',
    emoji: '\u{1F4AD}',
    title: "Tell LabBuddy what you're curious about",
  },
  {
    number: '2',
    emoji: '\u{2728}',
    title: 'Get a custom activity with supplies, steps, and diagrams',
  },
  {
    number: '3',
    emoji: '\u{1F52C}',
    title: 'Follow the guide, record observations, earn XP',
  },
];

const PRICING: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    description: 'Perfect for trying LabBuddy',
    features: [
      '3 experiments per day',
      '1 child profile',
      'Basic parent view',
    ],
    ctaLabel: 'Get Started',
  },
  {
    name: 'Family',
    price: '$9.99',
    period: '/mo',
    description: 'Everything curious kids need',
    features: [
      'Unlimited experiments',
      'Up to 3 children',
      'Syllabus uploads',
      'Lab notebook',
      'DIY guides',
      'Full parent dashboard',
    ],
    ctaLabel: 'Upgrade',
    badge: 'Most Popular',
    highlighted: true,
  },
  {
    name: 'Classroom',
    price: '$29.99',
    period: '/mo',
    description: 'Built for teachers',
    features: [
      'Up to 35 students',
      'Teacher dashboard',
      'Assignment tracking',
    ],
    ctaLabel: 'Get Started',
    badge: 'Teachers',
  },
];

const SAFETY_ITEMS: SafetyItem[] = [
  { emoji: '\u{2705}', text: 'COPPA-compliant' },
  { emoji: '\u{1F6E1}\u{FE0F}', text: 'Every activity hazard-checked' },
  { emoji: '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}', text: 'Full parent controls' },
  { emoji: '\u{1F512}', text: 'No ads, no data selling' },
];

const TESTIMONIALS: Testimonial[] = [
  { quote: 'Finally, screen time that counts.', author: 'Parent' },
  { quote: 'My daughter begged to do science over the weekend.', author: 'Parent' },
  {
    quote: "I can see exactly what she's learning and how much time she's spending.",
    author: 'Parent',
  },
];

export default function LandingPage({
  onGetStarted,
  onParentSignIn,
}: LandingPageProps) {
  return (
    <div className="landing">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav__inner">
          <div className="landing-nav__logo">
            <span className="landing-nav__logo-icon">{'\u{1F9EA}'}</span>
            <span className="landing-nav__logo-text">LabBuddy</span>
          </div>
          <div className="landing-nav__links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#pricing">Pricing</a>
            <button
              type="button"
              className="landing-nav__signin"
              onClick={onParentSignIn}
            >
              Parent Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero__inner">
          <div className="landing-hero__content">
            <div className="landing-hero__badge">
              <span>{'\u{2728}'}</span> Curiosity, meet AI
            </div>
            <h1 className="landing-hero__headline">
              Turn curiosity into{' '}
              <span className="landing-hero__headline-accent">
                hands-on learning
              </span>
            </h1>
            <p className="landing-hero__subheadline">
              LabBuddy is your kid's AI learning copilot — custom experiments,
              math challenges, writing projects, and more. Aligned to their
              school curriculum.
            </p>
            <div className="landing-hero__ctas">
              <button
                type="button"
                className="landing-btn landing-btn--primary landing-btn--large"
                onClick={onGetStarted}
              >
                Start Free {'\u{1F680}'}
              </button>
              <button
                type="button"
                className="landing-btn landing-btn--secondary landing-btn--large"
                onClick={onParentSignIn}
              >
                I'm a Parent
              </button>
            </div>
            <div className="landing-hero__proof">
              <span>{'\u{1F4AB}'}</span> Loved by curious kids ages 5-14
            </div>
          </div>
          <div className="landing-hero__visual">
            <svg
              viewBox="0 0 400 400"
              xmlns="http://www.w3.org/2000/svg"
              className="landing-hero__svg"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="flaskGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#7EDDD7" />
                  <stop offset="100%" stopColor="#4ECDC4" />
                </linearGradient>
                <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8B83FF" />
                  <stop offset="100%" stopColor="#6C63FF" />
                </linearGradient>
              </defs>
              {/* Background circle */}
              <circle cx="200" cy="200" r="180" fill="url(#bgGrad)" opacity="0.12" />
              <circle cx="200" cy="200" r="140" fill="url(#bgGrad)" opacity="0.18" />
              {/* Orbit dots */}
              <circle cx="60" cy="120" r="10" fill="#FF6B6B" className="landing-orbit landing-orbit--1" />
              <circle cx="340" cy="110" r="8" fill="#F1C40F" className="landing-orbit landing-orbit--2" />
              <circle cx="350" cy="300" r="12" fill="#4ECDC4" className="landing-orbit landing-orbit--3" />
              <circle cx="60" cy="310" r="9" fill="#8B83FF" className="landing-orbit landing-orbit--4" />
              {/* Flask shape */}
              <g transform="translate(150, 100)">
                {/* Neck */}
                <rect x="35" y="0" width="30" height="70" rx="6" fill="#E0E3F0" />
                <rect x="30" y="0" width="40" height="10" rx="4" fill="#6C63FF" />
                {/* Body */}
                <path
                  d="M 20 70 L 80 70 L 95 200 Q 95 230 50 230 Q 5 230 5 200 Z"
                  fill="url(#flaskGrad)"
                  stroke="#4ECDC4"
                  strokeWidth="3"
                />
                {/* Liquid surface highlight */}
                <ellipse cx="50" cy="130" rx="38" ry="6" fill="#FFFFFF" opacity="0.3" />
                {/* Bubbles */}
                <circle cx="35" cy="170" r="5" fill="#FFFFFF" opacity="0.7" className="landing-bubble landing-bubble--1" />
                <circle cx="60" cy="155" r="4" fill="#FFFFFF" opacity="0.7" className="landing-bubble landing-bubble--2" />
                <circle cx="50" cy="190" r="6" fill="#FFFFFF" opacity="0.7" className="landing-bubble landing-bubble--3" />
                <circle cx="70" cy="180" r="3" fill="#FFFFFF" opacity="0.7" className="landing-bubble landing-bubble--4" />
              </g>
              {/* Sparkles */}
              <text x="100" y="90" fontSize="28" className="landing-sparkle landing-sparkle--1">{'\u{2728}'}</text>
              <text x="290" y="220" fontSize="32" className="landing-sparkle landing-sparkle--2">{'\u{1F31F}'}</text>
              <text x="110" y="340" fontSize="26" className="landing-sparkle landing-sparkle--3">{'\u{1F4A1}'}</text>
            </svg>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="landing-section landing-features">
        <div className="landing-section__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">
              Everything kids need to{' '}
              <span className="landing-gradient-text">explore the world</span>
            </h2>
            <p className="landing-section__subtitle">
              Built for curiosity. Designed for real learning.
            </p>
          </div>
          <div className="landing-feature-grid">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="landing-feature-card">
                <div className="landing-feature-card__emoji">{feature.emoji}</div>
                <h3 className="landing-feature-card__title">{feature.title}</h3>
                <p className="landing-feature-card__description">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="landing-section landing-how">
        <div className="landing-section__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">How it works</h2>
            <p className="landing-section__subtitle">
              Three simple steps from curiosity to confident learner
            </p>
          </div>
          <div className="landing-steps">
            {STEPS.map((step, idx) => (
              <div key={step.number} className="landing-step">
                <div className="landing-step__number">{step.number}</div>
                <div className="landing-step__emoji">{step.emoji}</div>
                <h3 className="landing-step__title">{step.title}</h3>
                {idx < STEPS.length - 1 && (
                  <div className="landing-step__arrow" aria-hidden="true">
                    {'\u{2192}'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Curriculum alignment */}
      <section className="landing-section landing-curriculum">
        <div className="landing-section__inner landing-curriculum__inner">
          <div className="landing-curriculum__content">
            <div className="landing-pill">{'\u{1F4DA}'} Curriculum</div>
            <h2 className="landing-section__title landing-curriculum__title">
              Works with your school
            </h2>
            <p className="landing-curriculum__description">
              Upload a syllabus in any format — photo, PDF, or text. LabBuddy
              maps every activity to NGSS, Common Core, or state standards your
              teacher uses.
            </p>
            <ul className="landing-curriculum__list">
              <li>{'\u{2728}'} NGSS aligned</li>
              <li>{'\u{2728}'} Common Core ready</li>
              <li>{'\u{2728}'} State standards supported</li>
            </ul>
          </div>
          <div className="landing-curriculum__mockup" aria-hidden="true">
            <div className="landing-mockup">
              <div className="landing-mockup__header">
                <span className="landing-mockup__dot" />
                <span className="landing-mockup__dot" />
                <span className="landing-mockup__dot" />
                <span className="landing-mockup__title">
                  5th Grade Science Map
                </span>
              </div>
              <div className="landing-mockup__body">
                <div className="landing-mockup__node landing-mockup__node--1">
                  <span>{'\u{1F331}'}</span> Ecosystems
                </div>
                <div className="landing-mockup__node landing-mockup__node--2">
                  <span>{'\u{1F30D}'}</span> Earth Systems
                </div>
                <div className="landing-mockup__node landing-mockup__node--3">
                  <span>{'\u{1F52C}'}</span> Matter
                </div>
                <div className="landing-mockup__node landing-mockup__node--4">
                  <span>{'\u{26A1}'}</span> Energy
                </div>
                <div className="landing-mockup__node landing-mockup__node--5">
                  <span>{'\u{1F9EC}'}</span> Life Science
                </div>
                <svg className="landing-mockup__lines" viewBox="0 0 300 200">
                  <path d="M 60 40 Q 150 80 240 40" stroke="#6C63FF" strokeWidth="2" fill="none" opacity="0.4" strokeDasharray="4 4" />
                  <path d="M 60 40 Q 100 120 150 160" stroke="#4ECDC4" strokeWidth="2" fill="none" opacity="0.4" strokeDasharray="4 4" />
                  <path d="M 240 40 Q 200 120 150 160" stroke="#FF6B6B" strokeWidth="2" fill="none" opacity="0.4" strokeDasharray="4 4" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="landing-section landing-pricing">
        <div className="landing-section__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Simple, fair pricing</h2>
            <p className="landing-section__subtitle">
              Start free. Upgrade when your kid is hooked.
            </p>
          </div>
          <div className="landing-pricing-grid">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`landing-price-card${tier.highlighted ? ' landing-price-card--highlighted' : ''}`}
              >
                {tier.badge && (
                  <div className="landing-price-card__badge">{tier.badge}</div>
                )}
                <h3 className="landing-price-card__name">{tier.name}</h3>
                <div className="landing-price-card__price">
                  <span className="landing-price-card__amount">
                    {tier.price}
                  </span>
                  <span className="landing-price-card__period">
                    {tier.period}
                  </span>
                </div>
                <p className="landing-price-card__description">
                  {tier.description}
                </p>
                <ul className="landing-price-card__features">
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <span className="landing-price-card__check">
                        {'\u{2713}'}
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`landing-btn landing-btn--block ${tier.highlighted ? 'landing-btn--primary' : 'landing-btn--secondary'}`}
                  onClick={onGetStarted}
                >
                  {tier.ctaLabel}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="landing-section landing-safety">
        <div className="landing-section__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Built safe for kids</h2>
            <p className="landing-section__subtitle">
              Your child's wellbeing is our top priority
            </p>
          </div>
          <div className="landing-safety-grid">
            {SAFETY_ITEMS.map((item) => (
              <div key={item.text} className="landing-safety-card">
                <div className="landing-safety-card__emoji">{item.emoji}</div>
                <div className="landing-safety-card__text">{item.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="landing-section landing-testimonials">
        <div className="landing-section__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Parents love LabBuddy</h2>
            <p className="landing-section__subtitle">
              (Mockup quotes — we can't wait to feature real ones)
            </p>
          </div>
          <div className="landing-testimonial-grid">
            {TESTIMONIALS.map((t) => (
              <figure key={t.quote} className="landing-testimonial">
                <div className="landing-testimonial__quote-mark">{'\u201C'}</div>
                <blockquote className="landing-testimonial__quote">
                  {t.quote}
                </blockquote>
                <figcaption className="landing-testimonial__author">
                  — {t.author}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-section landing-final-cta">
        <div className="landing-final-cta__inner">
          <h2 className="landing-final-cta__title">
            Ready to spark curiosity?
          </h2>
          <p className="landing-final-cta__subtitle">
            Join curious kids learning the hands-on way.
          </p>
          <div className="landing-hero__ctas">
            <button
              type="button"
              className="landing-btn landing-btn--primary landing-btn--large"
              onClick={onGetStarted}
            >
              Start Free {'\u{1F680}'}
            </button>
            <button
              type="button"
              className="landing-btn landing-btn--ghost landing-btn--large"
              onClick={onParentSignIn}
            >
              I'm a Parent
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <div className="landing-nav__logo">
              <span className="landing-nav__logo-icon">{'\u{1F9EA}'}</span>
              <span className="landing-nav__logo-text">LabBuddy</span>
            </div>
            <p className="landing-footer__tagline">
              Built with {'\u{2764}\u{FE0F}'} for curious kids
            </p>
          </div>
          <div className="landing-footer__links">
            <a href="#about">About</a>
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
            <a href="#contact">Contact</a>
          </div>
          <div className="landing-footer__copy">
            &copy; {new Date().getFullYear()} LabBuddy. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
