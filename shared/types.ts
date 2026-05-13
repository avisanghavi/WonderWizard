// LabBuddy — Chat-based copilot types

// ---------- Chat messages ----------

export type MessageRole = 'user' | 'assistant';

/**
 * Rich content blocks that the AI can send in a single message.
 * The frontend renders each block type differently.
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'experiment-card'; experiment: GeneratedExperiment }
  | { type: 'supply-list'; supplies: Supply[]; estimatedTotal: { min: number; max: number } }
  | { type: 'step'; step: ExperimentStep; stepNumber: number; totalSteps: number }
  | {
      type: 'diagram';
      description: string;
      svg?: string;                // legacy / inline SVG (fallback path)
      imageUrl?: string;           // URL to a generated raster/vector image (preferred)
      style?: DiagramStyle;        // hint for the renderer / image generator
      aspect?: 'landscape' | 'portrait' | 'square';
    }
  | { type: 'safety-alert'; level: 'info' | 'caution' | 'warning'; message: string }
  | { type: 'reflection'; question: string; hint?: string }
  | { type: 'celebration'; message: string }
  | { type: 'suggestions'; options: string[] }
  // ---------- Curiosity-driven blocks (predict-then-reveal, mysteries) ----------
  // The kid commits to a guess BEFORE the experiment. Investment makes the
  // outcome land harder. This block is mandatory before any experiment-card.
  | {
      type: 'prediction-prompt';
      experimentTitle: string;        // what they're predicting about
      question: string;               // "What do you think happens when…?"
      options: PredictionOption[];    // 2-4 visual choices
      predictionId: string;           // server-generated; client echoes back on submit
    }
  // After the kid does the experiment, this block reveals their prediction
  // alongside reality. The gap is the lesson.
  | {
      type: 'prediction-reveal';
      predictionId: string;
      theirChoice: string;            // option label they picked
      correctChoice: string;          // option label of the actual outcome
      wasCorrect: boolean;
      explanation: string;            // why it happened
      surpriseLevel: 1 | 2 | 3 | 4 | 5; // how unexpected — drives the celebration
    }
  // A "did you know?" / "want to know what's wild?" teaser that ends a thought.
  // Always followed by a suggestions block so the kid can pull the thread.
  | {
      type: 'why-teaser';
      hook: string;                   // "Want to know something wild though?"
      seed: string;                   // the next-question seed
    }
  // The reframed curriculum unit — same NGSS standard, but presented as
  // a question that makes a kid lean in.
  | {
      type: 'mystery-card';
      mystery: MysteryQuestion;
    };

export interface PredictionOption {
  id: string;       // stable id, e.g. "explode" / "fizz" / "nothing"
  label: string;    // short kid-friendly text
  emoji: string;    // visual anchor — 🔥 💧 🤔 ⚡
}

/**
 * Hints for the schematic image generator about what kind of visual we want.
 * Used both to pick the right style preset on the image-gen API and to
 * guide the fallback SVG generator.
 */
export type DiagramStyle =
  | 'schematic'          // labeled setup, instructional, like a textbook
  | 'cross-section'      // cutaway view (e.g., volcano interior, plant cell)
  | 'exploded'           // parts pulled apart and labeled — "here's what's inside"
  | 'process'            // sequence of stages with arrows
  | 'comparison'         // side-by-side, before/after, A vs B
  | 'illustration';      // friendly scene illustration (less technical)

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: ContentBlock[];
  timestamp: number;
}

// ---------- Experiments (AI-generated) ----------

export type SafetyTier = 'green' | 'yellow' | 'red';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Supply {
  item: string;
  quantity: string;
  estimatedPrice: number;
  store: string;
  budgetAlternative?: string;
  icon?: string;
}

export interface ExperimentStep {
  instruction: string;
  tip?: string;
  scienceNote?: string;
  safetyWarning?: string;
  durationMinutes?: number;
  diagramDescription?: string;
}

export interface GeneratedExperiment {
  title: string;
  description: string;
  category: string;
  ageAppropriate: boolean;
  safetyTier: SafetyTier;
  difficulty: Difficulty;
  durationMinutes: number;
  scienceConcepts: string[];
  supplies: Supply[];
  steps: ExperimentStep[];
  reflectionPrompts: string[];
}

// ---------- API ----------

export interface ChatRequest {
  messages: { role: MessageRole; text: string }[];
  childAge: number;
  sessionId: string;
  childId?: string;  // optional — child profile ID for signed-in users; falls back to sessionId
}

export interface ChatResponse {
  message: ChatMessage;
  sessionId: string;
}

// ---------- Syllabus ----------

export interface SyllabusUnit {
  unitNumber: number;
  title: string;
  topics: string[];
  standards?: string[];        // e.g., NGSS, Common Core codes
  timeframe?: string;          // e.g., "Weeks 3-4", "October"
  keyVocabulary?: string[];
  // The mystery reframe — same standard, different framing.
  // "Unit 3: Waves and Light" → "Why can my eyes see but not hear?"
  mysteryQuestion?: string;    // headline question that makes a kid curious
  mysteryHook?: string;        // one-sentence teaser that builds intrigue
}

// ---------- Mystery questions (curriculum + weekly) ----------

export interface MysteryQuestion {
  id: string;
  question: string;            // "Why is the sky blue?"
  hook: string;                // "Spoiler: it's not because of the ocean."
  category: string;            // "physics", "biology", etc.
  ageRange: { min: number; max: number };
  starterPrompt: string;       // what to send to chat to start exploring
  // Optional curriculum tie-in — shows kids how this connects to school
  curriculumStandard?: string; // e.g., "MS-PS4-2"
}

export interface WeeklyMystery extends MysteryQuestion {
  weekStartsOn: string;        // ISO date "2026-05-04" — Monday of the week
  participantCount?: number;   // social proof — anonymized count
}

export interface ParsedSyllabus {
  id: string;
  subject: string;             // e.g., "Biology", "Algebra 1", "8th Grade Science"
  gradeLevel: string;          // e.g., "8th Grade", "AP", "K-2"
  teacher?: string;
  school?: string;
  units: SyllabusUnit[];
  rawSummary: string;          // AI-generated plain-text summary
  uploadedAt: number;
}

export interface SyllabusUploadResponse {
  syllabus: ParsedSyllabus;
  suggestedActivities: string[];  // starter prompts based on curriculum
}

// ---------- Session ----------

// ---------- DIY Guide ----------

export interface DIYGuide {
  id: string;
  experiment: GeneratedExperiment;
  stepIllustrations: string[]; // SVG strings, one per step
  generatedAt: number;
  sessionId: string;
}

// ---------- Session ----------

export interface LabSession {
  id: string;
  childAge: number;
  currentExperiment?: GeneratedExperiment;
  currentStep: number;
  phase: 'exploring' | 'designing' | 'preparing' | 'experimenting' | 'reflecting';
  syllabi?: ParsedSyllabus[];    // uploaded curricula
  activeSyllabusId?: string;     // which syllabus is currently active
}

// ---------- Gamification ----------

export type XPEventType =
  | 'message_sent'           // +2 — the kid engaged
  | 'experiment_designed'    // +10 — got an experiment card
  | 'experiment_started'     // +15 — opened DIY guide
  | 'step_completed'         // +5  — checked off a step
  | 'experiment_completed'   // +50 — finished all steps
  | 'notebook_entry_created' // +25 — wrote observations
  | 'reflection_answered'    // +10 — answered a reflection prompt
  | 'syllabus_topic_explored'// +20 — clicked a topic in the map
  | 'streak_day'             // +5  — daily login
  | 'badge_earned'           // variable — based on badge
  // Curiosity-specific events. Wrong predictions earn MORE than right ones —
  // we are explicitly rewarding the act of guessing, not being correct.
  | 'prediction_made'        // +8  — committed to a guess (huge for curiosity loop)
  | 'prediction_correct'     // +12 — guess matched outcome
  | 'prediction_surprised'   // +20 — wrong guess. The most valuable moment.
  | 'mystery_explored'       // +15 — engaged with a curated mystery
  | 'tangent_followed';      // +10 — pulled a "wait, what?" thread

export interface XPEvent {
  id: string;
  childId: string;
  type: XPEventType;
  amount: number;
  metadata?: Record<string, string | number>; // e.g., { experimentTitle: "Volcano" }
  createdAt: number;
}

export interface XPStats {
  totalXP: number;
  level: number;            // level = floor(sqrt(totalXP / 50)) + 1
  xpToNextLevel: number;    // how much more XP needed
  progressToNextLevel: number; // 0-1 float
}

export interface Streak {
  currentStreak: number;    // consecutive days
  longestStreak: number;
  lastActiveDate: string;   // YYYY-MM-DD
  streakFrozen?: boolean;   // premium feature
}

export type BadgeCategory =
  | 'explorer'        // first-time achievements (first experiment, first notebook entry)
  | 'dedication'     // streak-based (3-day, 7-day, 30-day streaks)
  | 'mastery'        // subject mastery (5 chemistry, 10 math)
  | 'curiosity'      // asked questions, explored diverse topics
  | 'creator';       // lab notebook entries, reflections written

export interface Badge {
  id: string;
  name: string;
  description: string;
  category: BadgeCategory;
  icon: string;              // emoji
  xpReward: number;
  criteria: {
    type: string;             // e.g., "experiments_completed", "streak_days"
    threshold: number;
  };
}

export interface EarnedBadge {
  badgeId: string;
  childId: string;
  earnedAt: number;
  xpAwarded: number;
}

// ---------- Lab Notebook ----------

export interface NotebookEntry {
  id: string;
  childId: string;
  experimentTitle: string;
  experimentCategory: string;
  observation: string;       // kid's written observation
  hypothesis?: string;
  conclusion?: string;
  photoUrls: string[];       // uploaded photos (local paths for MVP)
  reflectionAnswers?: Record<string, string>; // question -> answer
  rating?: 1 | 2 | 3 | 4 | 5;  // fun rating
  createdAt: number;
  updatedAt: number;
}

// ---------- Child Profile ----------

export interface ChildProfile {
  id: string;
  parentId: string;
  name: string;
  age: number;
  gradeLevel?: number;
  avatar?: string;           // emoji
  interests?: string[];
  createdAt: number;
}

// ---------- Parent ----------

export interface ParentAccount {
  id: string;
  email: string;
  name: string;
  passwordHash: string;       // bcrypt
  subscriptionTier: 'free' | 'family' | 'classroom';
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  trialEndsAt?: number;
  createdAt: number;
}

export interface ParentalControls {
  id: string;
  childId: string;
  dailyScreenTimeMinutes?: number;    // e.g., 60
  blockedCategories: string[];        // e.g., ["chemistry"] — blocked subject categories
  blockedKeywords: string[];          // e.g., ["fire", "explosion"]
  requireApprovalForYellow: boolean;  // approve yellow safety tier experiments
  notificationsEnabled: boolean;
  updatedAt: number;
}

export interface ActivityLogEntry {
  id: string;
  childId: string;
  type: 'chat_message' | 'experiment_designed' | 'step_completed' | 'experiment_completed' | 'notebook_entry' | 'topic_explored' | 'login';
  summary: string;            // human-readable one-liner
  metadata?: Record<string, string | number>;
  createdAt: number;
}

export interface ScreenTimeUsage {
  childId: string;
  date: string;               // YYYY-MM-DD
  minutesUsed: number;
  sessionsCount: number;
}

export interface Notification {
  id: string;
  recipientId: string;        // childId OR parentId
  recipientType: 'child' | 'parent';
  type: 'reminder' | 'achievement' | 'parent_alert' | 'curriculum_nudge';
  title: string;
  message: string;
  actionUrl?: string;
  read: boolean;
  createdAt: number;
}

// ---------- Subscription / Billing ----------

export type SubscriptionTier = 'free' | 'family' | 'classroom';

export interface TierLimits {
  tier: SubscriptionTier;
  maxExperimentsPerDay: number;  // free: 3, family: unlimited
  maxChildProfiles: number;       // free: 1, family: 3, classroom: 35
  syllabusUploads: boolean;       // free: false, family: true
  diyGuides: boolean;             // free: false, family: true
  labNotebook: boolean;           // free: false, family: true
  parentDashboard: boolean;       // free: basic, family: full
  prioritySupport: boolean;
}

export interface CheckoutSession {
  url: string;
  sessionId: string;
}
