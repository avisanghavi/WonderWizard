// LabBuddy — Output safety classifier
// Uses fast keyword/pattern matching (no AI) to flag unsafe content.
// Also checks experiment designs for age-inappropriate dangers.

import type { GeneratedExperiment } from "../../shared/types.js";

export interface ClassificationResult {
  safe: boolean;
  flags: string[];
  category: string;
}

export interface ExperimentSafetyResult {
  safe: boolean;
  flags: string[];
  reason?: string;
}

const FALLBACK_MESSAGE =
  "Hmm, let's get back to our experiment! Is there something about the experiment steps or science that I can help you with?";

// ---- pattern lists ----

const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(celebrity|tiktok|instagram|snapchat|facebook|twitter)\b/i,
  /\b(politics|religion|war(?!ning)|drugs|alcohol|gambling)\b/i,
  /\b(boyfriend|girlfriend|dating|crush)\b/i,
  /\b(stock market|crypto|bitcoin|invest)\b/i,
];

const DANGEROUS_PATTERNS: RegExp[] = [
  /\b(lighter|matches|gasoline|kerosene|acetone|bleach|ammonia)\b/i,
  /\b(knife|sharp blade|scissors)\b/i,
  /\b(electr(?:ocute|ical\s*shock)|high\s*voltage|outlet|power\s*line)\b/i,
  /\b(gun|weapon|explosive|detonate|bomb)\b/i,
  /\b(mix\s*bleach\s*and\s*ammonia|chlorine\s*gas)\b/i,
  /\b(hydrochloric|sulfuric|nitric)\s*acid\b/i,
];

const PERSONAL_INFO_PATTERNS: RegExp[] = [
  /\b(what(?:'s| is) your (?:name|address|phone|email|school|age))\b/i,
  /\b(where do you (?:live|go to school))\b/i,
  /\b(tell me about your (?:family|parents|friends))\b/i,
  /\b(social security|credit card|password)\b/i,
  /\b(phone number|home address|email address)\b/i,
];

const INAPPROPRIATE_PATTERNS: RegExp[] = [
  /\b(damn|hell|shit|fuck|ass|bitch|bastard|crap)\b/i,
  /\b(sex|porn|nude|naked|erotic|xxx)\b/i,
  /\b(kill|murder|suicide|self[- ]?harm)\b/i,
];

const LINK_PATTERN = /https?:\/\/[^\s]+|www\.[^\s]+/i;

// ---- experiment-specific danger patterns ----

/** Items that are dangerous in ANY experiment for ANY age */
const BANNED_SUPPLIES: RegExp[] = [
  /\bgasoline\b/i,
  /\bkerosene\b/i,
  /\bacetone\b/i,
  /\b(hydrochloric|sulfuric|nitric)\s*acid\b/i,
  /\bchlorine\b/i,
  /\bammonia\b/i,
  /\bbleach\b/i,
  /\blye\b/i,
  /\bgunpowder\b/i,
  /\bpotassium\s*permanganate\b/i,
  /\bhydrogen\s*peroxide\s*(30|35|50)\s*%/i, // high-concentration H2O2
];

/** Items dangerous for very young kids (under 7) — safety scissors are fine */
const YOUNG_KID_BANNED_SUPPLIES: RegExp[] = [
  /\bknife\b/i,
  /\bneedle\b/i,
  /\bsoldering\b/i,
  /\bhot\s*glue\s*gun\b/i,
  /\bmatches\b/i,
  /\blighter\b/i,
  /\bstove\b/i,
  /\boven\b/i,
  /\bhot\s*plate\b/i,
  /\bwire\s*strippers?\b/i,
  /\bbatteries?\s*(9v|12v)/i,
  /\b(?<!safety\s)scissors\b/i, // regular scissors banned for under-7, but "safety scissors" are fine
];

/** Step instructions that indicate dangerous procedures */
const DANGEROUS_STEP_PATTERNS: RegExp[] = [
  /\blight\s*(a|the)\s*(fire|flame|candle|match)\b/i,
  /\bset\s*(fire|on\s*fire|alight)\b/i,
  /\bburn\b/i,
  /\bopen\s*flame\b/i,
  /\bplug\s*(it\s*)?(in|into)\s*(the\s*)?(wall|outlet|socket)\b/i,
  /\b(connect|attach)\s*(to|with)\s*(mains|wall\s*power|outlet)\b/i,
  /\b(climb|stand\s*on)\s*(a\s*)?(ladder|roof|chair|table)\b/i,
  /\bmicrowave\s*(metal|foil|aluminum)\b/i,
  /\bmix\s*(bleach|ammonia)\b/i,
];

// ---- text classifier ----

export function classifyOutput(text: string): ClassificationResult {
  const flags: string[] = [];

  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(text)) {
      flags.push("off-topic");
      break;
    }
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) {
      flags.push("dangerous-content");
      break;
    }
  }

  for (const pattern of PERSONAL_INFO_PATTERNS) {
    if (pattern.test(text)) {
      flags.push("personal-information");
      break;
    }
  }

  for (const pattern of INAPPROPRIATE_PATTERNS) {
    if (pattern.test(text)) {
      flags.push("inappropriate-language");
      break;
    }
  }

  if (LINK_PATTERN.test(text)) {
    flags.push("contains-link");
  }

  const safe = flags.length === 0;
  const category = safe ? "safe" : flags[0];

  return { safe, flags, category };
}

// ---- experiment safety classifier ----

/**
 * Checks an entire GeneratedExperiment for age-inappropriate dangers.
 * Returns safe: false if ANY supply or step triggers a flag.
 */
export function classifyExperimentSafety(
  experiment: GeneratedExperiment,
  childAge: number,
): ExperimentSafetyResult {
  const flags: string[] = [];

  // Red safety tier is never allowed
  if (experiment.safetyTier === "red") {
    flags.push("red-safety-tier");
  }

  // Check all supplies against banned lists
  for (const supply of experiment.supplies) {
    const supplyText = `${supply.item} ${supply.quantity}`;

    for (const pattern of BANNED_SUPPLIES) {
      if (pattern.test(supplyText)) {
        flags.push(`banned-supply: ${supply.item}`);
      }
    }

    // Very young kid checks
    if (childAge < 7) {
      for (const pattern of YOUNG_KID_BANNED_SUPPLIES) {
        if (pattern.test(supplyText)) {
          flags.push(`age-inappropriate-supply: ${supply.item}`);
        }
      }
    }
  }

  // Check all step instructions
  for (const step of experiment.steps) {
    const stepText = step.instruction + (step.tip ?? "") + (step.scienceNote ?? "");

    for (const pattern of DANGEROUS_STEP_PATTERNS) {
      if (pattern.test(stepText)) {
        flags.push(`dangerous-step: ${step.instruction.slice(0, 50)}`);
      }
    }

    // Also run general dangerous content check on steps
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(stepText)) {
        flags.push(`dangerous-content-in-step: ${step.instruction.slice(0, 50)}`);
      }
    }
  }

  // Young kids: hard difficulty is not appropriate
  if (childAge < 8 && experiment.difficulty === "hard") {
    flags.push("difficulty-too-high");
  }

  // Very young kids: experiments should be short
  if (childAge < 7 && experiment.durationMinutes > 45) {
    flags.push("duration-too-long");
  }

  if (flags.length === 0) {
    return { safe: true, flags };
  }

  // Build a human-friendly reason
  let reason: string;
  if (flags.some((f) => f.startsWith("banned-supply"))) {
    reason = "This experiment uses materials that aren't safe. Let me suggest something better!";
  } else if (flags.some((f) => f.startsWith("age-inappropriate"))) {
    reason = "Some of these supplies need an older kid or adult. Let me find a version that's perfect for you!";
  } else if (flags.some((f) => f.startsWith("dangerous-step"))) {
    reason = "Some steps in this experiment need extra care. Let me redesign it to be safer!";
  } else if (flags.includes("difficulty-too-high")) {
    reason = "This one might be a bit tricky. Let me find something that'll be more fun for you!";
  } else if (flags.includes("duration-too-long")) {
    reason = "This experiment takes a long time. Let me find a quicker, equally cool one!";
  } else {
    reason = "Let me find a safer experiment for you!";
  }

  return { safe: false, flags, reason };
}

export { FALLBACK_MESSAGE };
