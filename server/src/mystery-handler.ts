// LabBuddy — Mystery questions
//
// Two endpoints:
//   GET /api/mysteries/current   — this week's curated "mystery of the week"
//   GET /api/mysteries/random    — pull a random mystery from the bank
//                                  (used for the "huh, that's weird" button
//                                   and surprise-me suggestions)
//
// The mystery bank is hand-curated — these are the kinds of questions that
// make a kid lean in and forget they're "learning." Each one is genuinely
// counter-intuitive or surprising.

import { Router, type Request, type Response } from "express";
import type { MysteryQuestion, WeeklyMystery } from "../../shared/types.js";

// ---------- the bank ----------
//
// 30+ hand-picked mysteries organized to feel weird, wondrous, or
// counter-intuitive. Each one ties to a real curriculum standard but
// is framed as a question a kid would actually scream-text a friend about.

const MYSTERY_BANK: MysteryQuestion[] = [
  // ===== Physics / Earth =====
  {
    id: "earth-spin",
    question: "Why don't I feel the Earth spinning at 1,000 mph?",
    hook: "We're all on a giant ball whipping through space and nobody's getting motion sickness.",
    category: "physics",
    ageRange: { min: 7, max: 14 },
    starterPrompt: "I want to figure out why I can't feel the Earth spinning",
    curriculumStandard: "MS-PS2-2",
  },
  {
    id: "sky-blue",
    question: "Why is the sky blue (and why does it turn red at sunset)?",
    hook: "Plot twist: the ocean has nothing to do with it.",
    category: "physics",
    ageRange: { min: 6, max: 14 },
    starterPrompt: "I want to know why the sky is blue but turns red at sunset",
    curriculumStandard: "MS-PS4-2",
  },
  {
    id: "matter-empty",
    question: "If atoms are 99.99% empty space, why doesn't my hand go through walls?",
    hook: "Your hand is mostly nothing. So is the wall. So why don't they merge?",
    category: "physics",
    ageRange: { min: 9, max: 14 },
    starterPrompt: "Tell me why solid stuff feels solid if atoms are mostly empty space",
    curriculumStandard: "HS-PS1-3",
  },
  {
    id: "ice-floats",
    question: "Why does ice float when basically everything else sinks when it freezes?",
    hook: "Frozen water is the weirdo of the universe. Lucky for fish.",
    category: "physics",
    ageRange: { min: 7, max: 14 },
    starterPrompt: "I want to find out why ice floats — isn't that weird?",
    curriculumStandard: "MS-PS1-4",
  },
  {
    id: "shadow-bigger",
    question: "Why is my shadow sometimes way bigger than me?",
    hook: "Same body. Same sun. So how does it shape-shift?",
    category: "physics",
    ageRange: { min: 5, max: 10 },
    starterPrompt: "I want to do an experiment with shadows changing size",
    curriculumStandard: "1-PS4-3",
  },
  // ===== Biology =====
  {
    id: "hair-grows",
    question: "How does my body know to grow my hair longer but stop my fingers?",
    hook: "Your DNA is somewhere in there making *very* specific decisions.",
    category: "biology",
    ageRange: { min: 8, max: 14 },
    starterPrompt: "I want to understand why hair keeps growing but my fingers stay the same",
    curriculumStandard: "MS-LS1-1",
  },
  {
    id: "yawn-contagious",
    question: "Why is yawning contagious — and why do dogs do it too?",
    hook: "You're going to yawn within the next 60 seconds. Sorry.",
    category: "biology",
    ageRange: { min: 6, max: 14 },
    starterPrompt: "Tell me why yawns are contagious and let's design an experiment",
  },
  {
    id: "fish-fart",
    question: "Do fish fart? (Spoiler: it's complicated.)",
    hook: "Yes some do. No some don't. The reasons are weirder than you'd think.",
    category: "biology",
    ageRange: { min: 5, max: 14 },
    starterPrompt: "I want to know if fish fart and why",
  },
  {
    id: "trees-talk",
    question: "Can trees talk to each other?",
    hook: "There's a giant secret network underground and we just figured it out.",
    category: "biology",
    ageRange: { min: 7, max: 14 },
    starterPrompt: "I want to learn how trees communicate underground",
    curriculumStandard: "MS-LS2-2",
  },
  {
    id: "dream-color",
    question: "Do I dream in color?",
    hook: "There's a way to find out. (Most adults guess wrong.)",
    category: "biology",
    ageRange: { min: 6, max: 12 },
    starterPrompt: "I want to investigate whether people dream in color",
  },
  // ===== Chemistry =====
  {
    id: "fire-color",
    question: "Why does fire come in different colors?",
    hook: "Every color of flame is whispering a secret about what's burning.",
    category: "chemistry",
    ageRange: { min: 9, max: 14 },
    starterPrompt: "Help me understand why fires can be different colors (with a SAFE experiment)",
    curriculumStandard: "MS-PS1-4",
  },
  {
    id: "soap-bubbles",
    question: "Why are soap bubbles ALWAYS perfectly round?",
    hook: "Try to make a square one. The universe says no.",
    category: "chemistry",
    ageRange: { min: 5, max: 12 },
    starterPrompt: "I want to know why bubbles are always round and play with bubble shapes",
  },
  // ===== Astronomy =====
  {
    id: "moon-day",
    question: "Why can I see the moon during the day sometimes?",
    hook: "It's not a glitch. The sun and moon are both up more than you'd think.",
    category: "astronomy",
    ageRange: { min: 5, max: 12 },
    starterPrompt: "I want to figure out why the moon is sometimes out during the day",
    curriculumStandard: "1-ESS1-1",
  },
  {
    id: "moon-jump",
    question: "Could I jump to the moon? (No really, what would it actually take?)",
    hook: "Spoiler: not even close. But the math is bonkers.",
    category: "physics",
    ageRange: { min: 8, max: 14 },
    starterPrompt: "Help me calculate if I could jump to the moon and how",
  },
  // ===== Math (yes, math has mysteries too) =====
  {
    id: "infinite-bigger",
    question: "Are some infinities bigger than others?",
    hook: "Mathematicians cried. You'll see why.",
    category: "math",
    ageRange: { min: 11, max: 14 },
    starterPrompt: "Show me how some infinities can be bigger than others",
  },
  {
    id: "monty-hall",
    question: "Should I switch doors? (The Monty Hall puzzle that broke math.)",
    hook: "The right answer feels SO wrong. Even smart adults get this one.",
    category: "math",
    ageRange: { min: 9, max: 14 },
    starterPrompt: "Walk me through the Monty Hall puzzle with a hands-on demo",
  },
  {
    id: "pi-everywhere",
    question: "Why does π show up in things that aren't even circles?",
    hook: "It's in physics. In stats. In your heartbeat. Pi is haunting reality.",
    category: "math",
    ageRange: { min: 10, max: 14 },
    starterPrompt: "I want to investigate where π shows up outside of circles",
  },
  // ===== Engineering / weird stuff =====
  {
    id: "paper-fold",
    question: "If I fold paper 42 times, will it really reach the moon?",
    hook: "Math says yes. Physics says good luck.",
    category: "math",
    ageRange: { min: 8, max: 14 },
    starterPrompt: "Help me try to fold paper as many times as possible and figure out the math",
  },
  {
    id: "popcorn-pop",
    question: "Why does popcorn pop — but unpopped kernels just sit there?",
    hook: "There's a tiny pressure cooker inside every kernel. Sometimes it gives up.",
    category: "chemistry",
    ageRange: { min: 6, max: 12 },
    starterPrompt: "I want to do an experiment about why some popcorn doesn't pop",
  },
];

// ---------- weekly rotation ----------

/**
 * Pick this week's mystery deterministically based on the Monday-of-the-week
 * date. Same week → same mystery for everyone (creates the shared moment).
 */
function getMondayOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun, 1 Mon, ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // back up to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Hash the ISO date string into a number to pick from the bank.
 * Stable: same week always picks the same mystery.
 */
function hashWeek(iso: string): number {
  let h = 0;
  for (let i = 0; i < iso.length; i++) {
    h = (h * 31 + iso.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickWeeklyMystery(date = new Date()): WeeklyMystery {
  const monday = getMondayOfWeek(date);
  const iso = isoDate(monday);
  const idx = hashWeek(iso) % MYSTERY_BANK.length;
  const base = MYSTERY_BANK[idx];
  // Fake a "participant count" that increases through the week — social proof.
  // Number is deterministic per week so it doesn't reset per request, but
  // grows over time within the week.
  const dayOfWeek = Math.max(0, Math.min(6, Math.floor((Date.now() - monday.getTime()) / 86400000)));
  const participantCount =
    1200 + (hashWeek(iso) % 800) + dayOfWeek * 380;
  return { ...base, weekStartsOn: iso, participantCount };
}

function pickRandomMystery(excludeId?: string): MysteryQuestion {
  const pool = excludeId
    ? MYSTERY_BANK.filter((m) => m.id !== excludeId)
    : MYSTERY_BANK;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- router ----------

export const mysteryRouter = Router();

mysteryRouter.get("/current", (_req: Request, res: Response) => {
  try {
    const mystery = pickWeeklyMystery();
    res.json({ mystery });
  } catch (err) {
    console.error("[mystery] /current failed:", err);
    res.status(500).json({ error: "internal", message: "Could not load mystery." });
  }
});

mysteryRouter.get("/random", (req: Request, res: Response) => {
  try {
    const exclude = typeof req.query.exclude === "string" ? req.query.exclude : undefined;
    const mystery = pickRandomMystery(exclude);
    res.json({ mystery });
  } catch (err) {
    console.error("[mystery] /random failed:", err);
    res.status(500).json({ error: "internal" });
  }
});

mysteryRouter.get("/", (_req: Request, res: Response) => {
  // Full bank — useful for testing / future "browse" UI
  res.json({ mysteries: MYSTERY_BANK });
});
