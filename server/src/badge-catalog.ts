// LabBuddy — Static badge catalog
// All badges a child can earn, organized by category.

import type { Badge } from "../../shared/types.js";

export const BADGE_CATALOG: Badge[] = [
  // ---------- Explorer ----------
  {
    id: "first-steps",
    name: "First Steps",
    description: "Sent your very first message to LabBuddy.",
    category: "explorer",
    icon: "👣",
    xpReward: 10,
    criteria: { type: "messages_sent", threshold: 1 },
  },
  {
    id: "first-experiment",
    name: "First Experiment",
    description: "Designed your very first experiment.",
    category: "explorer",
    icon: "🧪",
    xpReward: 25,
    criteria: { type: "experiments_designed", threshold: 1 },
  },
  {
    id: "first-notebook",
    name: "First Notebook",
    description: "Wrote your first lab notebook entry.",
    category: "explorer",
    icon: "📓",
    xpReward: 25,
    criteria: { type: "notebook_entries_created", threshold: 1 },
  },
  {
    id: "curriculum-pioneer",
    name: "Curriculum Pioneer",
    description: "Explored your first syllabus topic.",
    category: "explorer",
    icon: "🗺️",
    xpReward: 20,
    criteria: { type: "syllabus_topics_explored", threshold: 1 },
  },

  // ---------- Dedication ----------
  {
    id: "three-day-streak",
    name: "3-Day Streak 🔥",
    description: "Kept a 3-day learning streak.",
    category: "dedication",
    icon: "🔥",
    xpReward: 30,
    criteria: { type: "streak_days", threshold: 3 },
  },
  {
    id: "week-warrior",
    name: "Week Warrior",
    description: "Kept a 7-day learning streak.",
    category: "dedication",
    icon: "⚡",
    xpReward: 75,
    criteria: { type: "streak_days", threshold: 7 },
  },
  {
    id: "monthly-master",
    name: "Monthly Master",
    description: "Kept a 30-day learning streak.",
    category: "dedication",
    icon: "🏆",
    xpReward: 250,
    criteria: { type: "streak_days", threshold: 30 },
  },

  // ---------- Mastery ----------
  {
    id: "chemistry-whiz",
    name: "Chemistry Whiz",
    description: "Completed 5 chemistry experiments.",
    category: "mastery",
    icon: "⚗️",
    xpReward: 100,
    criteria: { type: "experiments_completed_chemistry", threshold: 5 },
  },
  {
    id: "math-mind",
    name: "Math Mind",
    description: "Completed 5 math activities.",
    category: "mastery",
    icon: "🧮",
    xpReward: 100,
    criteria: { type: "experiments_completed_math", threshold: 5 },
  },
  {
    id: "polymath",
    name: "Polymath",
    description: "Completed experiments across 5 or more categories.",
    category: "mastery",
    icon: "🎓",
    xpReward: 150,
    criteria: { type: "categories_explored", threshold: 5 },
  },

  // ---------- Curiosity ----------
  {
    id: "question-asker",
    name: "Question Asker",
    description: "Sent 20 messages to LabBuddy.",
    category: "curiosity",
    icon: "❓",
    xpReward: 40,
    criteria: { type: "messages_sent", threshold: 20 },
  },
  {
    id: "deep-diver",
    name: "Deep Diver",
    description: "Completed 10 experiments.",
    category: "curiosity",
    icon: "🤿",
    xpReward: 120,
    criteria: { type: "experiments_completed", threshold: 10 },
  },

  // ---------- Creator ----------
  {
    id: "notebook-novelist",
    name: "Notebook Novelist",
    description: "Wrote 5 lab notebook entries.",
    category: "creator",
    icon: "✍️",
    xpReward: 80,
    criteria: { type: "notebook_entries_created", threshold: 5 },
  },
  {
    id: "reflector",
    name: "Reflector",
    description: "Answered 10 reflection prompts.",
    category: "creator",
    icon: "💭",
    xpReward: 80,
    criteria: { type: "reflections_answered", threshold: 10 },
  },
];
