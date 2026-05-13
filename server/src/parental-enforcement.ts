// LabBuddy — Parental controls enforcement
//
// Bridges the gap between stored parental_controls and the chat pipeline.
// Called from chat-handler before sending to the LLM (input check) and after
// the response is generated (experiment category check).
//
// Failure modes are conservative: if anything goes wrong reading controls, we
// allow the request — controls are a feature, not a security boundary. The
// safety-classifier still runs regardless.

import type {
  ContentBlock,
  GeneratedExperiment,
  ParentalControls,
} from "../../shared/types.js";
import {
  getControls,
  getScreenTime,
  logActivity,
  createNotification,
} from "./repositories/parent-repo.js";

// ---------- types ----------

export type EnforcementOutcome =
  | { allowed: true }
  | {
      allowed: false;
      reason: "blocked_keyword" | "blocked_category" | "screen_time_exceeded" | "yellow_needs_approval";
      friendlyMessage: string;
      detail?: string;
    };

interface ParentLookup {
  /** Map childId → parentId for notifications. May return undefined for anonymous sessions. */
  resolveParentId(childId: string): string | undefined;
}

// ---------- helpers ----------

async function loadControls(childId: string): Promise<ParentalControls | undefined> {
  try {
    return await getControls(childId);
  } catch (err) {
    console.error("[parental-enforcement] getControls failed:", err);
    return undefined;
  }
}

/** Today's date in YYYY-MM-DD using local time. */
function todayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function notifyParent(
  childId: string,
  parentId: string | undefined,
  type: "blocked_keyword" | "blocked_category" | "screen_time_exceeded",
  detail: string
): void {
  if (!parentId) return;
  // Fire-and-forget — UI alerts are best-effort.
  void createNotification({
    recipientId: parentId,
    recipientType: "parent",
    type: "parent_alert",
    title:
      type === "screen_time_exceeded"
        ? "Daily screen-time limit reached"
        : "A blocked topic was attempted",
    message: detail,
    read: false,
  }).catch((err) =>
    console.error("[parental-enforcement] notifyParent failed:", err),
  );
}

// ---------- input enforcement ----------
//
// Called BEFORE the message reaches Claude. Blocks if:
//   - the kid's text contains a parent-blocked keyword
//   - daily screen-time limit has been hit

export async function enforceOnInput(
  childId: string,
  userText: string,
  lookup?: ParentLookup
): Promise<EnforcementOutcome> {
  const controls = await loadControls(childId);
  if (!controls) return { allowed: true };

  // 1. Screen-time check
  if (
    typeof controls.dailyScreenTimeMinutes === "number" &&
    controls.dailyScreenTimeMinutes > 0
  ) {
    try {
      const usage = await getScreenTime(childId, todayDateString());
      const used = usage?.minutesUsed ?? 0;
      if (used >= controls.dailyScreenTimeMinutes) {
        const parentId = lookup?.resolveParentId(childId);
        const detail = `Daily limit (${controls.dailyScreenTimeMinutes}m) reached at ${used}m used`;
        void logActivity({
          childId,
          type: "chat_message",
          summary: "Blocked: daily screen-time limit reached",
          metadata: { reason: "screen_time", used: String(used) },
        }).catch((e) => console.error("[parental-enforcement] logActivity failed:", e));
        notifyParent(childId, parentId, "screen_time_exceeded", detail);
        return {
          allowed: false,
          reason: "screen_time_exceeded",
          friendlyMessage:
            `🌙 You've hit today's screen-time goal (${controls.dailyScreenTimeMinutes} minutes). ` +
            `Great work today — let's pick this back up tomorrow!`,
          detail,
        };
      }
    } catch (err) {
      console.error("[parental-enforcement] screen-time check failed:", err);
      // fall through — don't block on infrastructure failures
    }
  }

  // 2. Blocked keyword check
  if (controls.blockedKeywords.length > 0) {
    const lower = userText.toLowerCase();
    const hit = controls.blockedKeywords.find((kw) => {
      const k = kw.trim().toLowerCase();
      if (!k) return false;
      // Word-boundary match for short keywords; substring match for phrases
      if (/\s/.test(k) || k.length > 20) {
        return lower.includes(k);
      }
      const re = new RegExp(`\\b${escapeRegex(k)}\\b`, "i");
      return re.test(userText);
    });
    if (hit) {
      const parentId = lookup?.resolveParentId(childId);
      const detail = `Blocked keyword "${hit}" in: "${userText.slice(0, 80)}"`;
      void logActivity({
        childId,
        type: "chat_message",
        summary: `Blocked: keyword "${hit}"`,
        metadata: { reason: "blocked_keyword", keyword: hit },
      }).catch((e) => console.error("[parental-enforcement] logActivity failed:", e));
      notifyParent(childId, parentId, "blocked_keyword", detail);
      return {
        allowed: false,
        reason: "blocked_keyword",
        friendlyMessage:
          `That topic isn't available right now. Want to try something else? ` +
          `I've got tons of cool experiments we could explore!`,
        detail,
      };
    }
  }

  return { allowed: true };
}

// ---------- output enforcement ----------
//
// Called AFTER Claude responds. If the AI designed an experiment in a blocked
// category, swap the response for a redirect.

export async function enforceOnOutput(
  childId: string,
  blocks: ContentBlock[],
  lookup?: ParentLookup
): Promise<{ blocks: ContentBlock[]; modified: boolean; reason?: string }> {
  const controls = await loadControls(childId);
  if (!controls) return { blocks, modified: false };

  // Find any experiment-card blocks whose category is blocked
  for (const block of blocks) {
    if (block.type !== "experiment-card") continue;
    const exp: GeneratedExperiment = block.experiment;
    const category = (exp.category ?? "").toLowerCase();

    if (
      controls.blockedCategories.length > 0 &&
      controls.blockedCategories.some((c) => c.toLowerCase() === category)
    ) {
      const parentId = lookup?.resolveParentId(childId);
      const detail = `Experiment "${exp.title}" (category: ${exp.category}) blocked`;
      void logActivity({
        childId,
        type: "experiment_designed",
        summary: `Blocked: category "${exp.category}"`,
        metadata: { reason: "blocked_category", category: exp.category, title: exp.title },
      }).catch((e) => console.error("[parental-enforcement] logActivity failed:", e));
      notifyParent(childId, parentId, "blocked_category", detail);

      return {
        blocks: [
          {
            type: "text",
            text:
              `Hmm, that experiment is in a category your parent has paused for now. ` +
              `Let's try something different! What other topics are you curious about?`,
          },
          {
            type: "suggestions",
            options: [
              "Try a writing challenge",
              "Build something with paper",
              "A math puzzle",
              "Something with water and color",
            ],
          },
        ],
        modified: true,
        reason: "blocked_category",
      };
    }
  }

  // Yellow-tier safety approval gate
  if (controls.requireApprovalForYellow) {
    for (const block of blocks) {
      if (block.type !== "experiment-card") continue;
      if (block.experiment.safetyTier === "yellow") {
        const parentId = lookup?.resolveParentId(childId);
        notifyParent(
          childId,
          parentId,
          "blocked_category",
          `Pending approval: ${block.experiment.title} (yellow tier)`
        );
        // Replace the experiment-card with a friendly note so the kid sees something
        const replacement: ContentBlock[] = blocks.map((b) =>
          b.type === "experiment-card" && b.experiment.safetyTier === "yellow"
            ? ({
                type: "text",
                text:
                  `That experiment looks really cool! It needs a grown-up to take a quick look first. ` +
                  `Once they approve it, you'll be able to start. 🧑‍🔬`,
              } as ContentBlock)
            : b
        );
        return { blocks: replacement, modified: true, reason: "yellow_needs_approval" };
      }
    }
  }

  return { blocks, modified: false };
}

// ---------- utilities ----------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
