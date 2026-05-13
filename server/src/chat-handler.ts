// LabBuddy — Chat endpoint handler
// Orchestrates the AI copilot pipeline with database-backed sessions.

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import type {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ContentBlock,
  LabSession,
} from "../../shared/types.js";
import { generateCopilotResponse } from "./ai-copilot.js";
import { classifyOutput, classifyExperimentSafety, FALLBACK_MESSAGE } from "./safety-classifier.js";
import { getOrCreateSession, updateSession } from "./repositories/session-repo.js";
import { saveMessage } from "./repositories/message-repo.js";
import { awardAndCheck } from "./gamification-handler.js";
import { logActivity, recordScreenTime, getChildProfile } from "./repositories/parent-repo.js";
import { enforceOnInput, enforceOnOutput } from "./parental-enforcement.js";
import { resolveSchematic } from "./image-cache.js";

// ---------- diagram resolution ----------

/**
 * Walk the content blocks and for any `diagram` block without an
 * `imageUrl`, resolve one through the cached image-gen pipeline.
 * Other block types pass through untouched.
 *
 * Diagram lookups happen in parallel. A failure on any single diagram
 * downgrades it to its description-only form (renderer shows a soft
 * placeholder) rather than blocking the entire response.
 */
async function resolveDiagramBlocks(
  blocks: ContentBlock[]
): Promise<ContentBlock[]> {
  // Collect diagram indices that need resolution
  const tasks: Array<Promise<{ index: number; url: string } | null>> = [];
  blocks.forEach((b, index) => {
    if (b.type !== "diagram") return;
    if (b.imageUrl) return; // already resolved
    const description = b.description?.trim();
    if (!description || description.length < 3) return;
    tasks.push(
      resolveSchematic({
        description,
        style: b.style,
        aspect: b.aspect ?? "landscape",
      })
        .then((entry) => ({ index, url: entry.url }))
        .catch((err) => {
          console.error("[chat] diagram resolve failed:", err);
          return null;
        })
    );
  });
  if (tasks.length === 0) return blocks;

  const resolved = await Promise.all(tasks);
  const next = blocks.slice();
  for (const r of resolved) {
    if (!r) continue;
    const block = next[r.index];
    if (block.type !== "diagram") continue;
    next[r.index] = { ...block, imageUrl: r.url };
  }
  return next;
}

// ---------- safety gate ----------

/**
 * Run every text-bearing content block through the safety classifier.
 * If anything is flagged, replace the entire response with a redirect.
 */
function applySafetyGate(blocks: ContentBlock[], childAge: number): ContentBlock[] {
  for (const block of blocks) {
    // Check text blocks
    if (block.type === "text") {
      const result = classifyOutput(block.text);
      if (!result.safe) {
        return [{ type: "text", text: FALLBACK_MESSAGE }];
      }
    }

    // Check experiment cards for dangerous experiments
    if (block.type === "experiment-card") {
      const expResult = classifyExperimentSafety(block.experiment, childAge);
      if (!expResult.safe) {
        return [
          {
            type: "safety-alert",
            level: "warning",
            message: expResult.reason ?? "This experiment isn't safe for your age group. Let's pick something else!",
          },
          {
            type: "suggestions",
            options: [
              "Design something with paper and tape",
              "A math puzzle I can build with my hands",
              "Something with water and food coloring",
              "A creative writing challenge",
            ],
          },
        ];
      }
    }

    // Check step instructions
    if (block.type === "step") {
      const stepResult = classifyOutput(block.step.instruction);
      if (!stepResult.safe) {
        return [{ type: "text", text: FALLBACK_MESSAGE }];
      }
    }
  }

  return blocks;
}

// ---------- router ----------

export const chatRouter = Router();

chatRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as ChatRequest;

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: "messages array is required and must not be empty" });
      return;
    }

    const childAge = typeof body.childAge === "number" ? body.childAge : 10;
    const sessionId = body.sessionId || randomUUID();
    // childId for gamification: use profile ID if provided, else fall back to sessionId
    const childId = body.childId || sessionId;

    const session = getOrCreateSession(sessionId, childAge);

    // Resolve parent for notifications. childId may be a child_profile id
    // (signed-in) or an anonymous session id; only the former has a parent.
    // Resolve parent id for notifications. We pre-fetch synchronously by
    // making the lookup cache the result of an async call up-front — but to
    // keep enforceOn* signatures simple we pass a sync resolver that uses
    // a pre-populated cache.
    let cachedParentId: string | undefined;
    try {
      const profile = await getChildProfile(childId);
      cachedParentId = profile?.parentId;
    } catch {
      cachedParentId = undefined;
    }
    const parentLookup = {
      resolveParentId: (_cid: string): string | undefined => cachedParentId,
    };

    // Save the user's message
    const lastUserMsg = body.messages[body.messages.length - 1];
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: "user",
      content: [{ type: "text", text: lastUserMsg.text }],
      timestamp: Date.now(),
    };
    saveMessage(sessionId, userMessage);

    // -------- Parental controls: input gate --------
    // Runs BEFORE Claude. Catches blocked keywords, screen-time limits.
    const inputGate = await enforceOnInput(childId, lastUserMsg.text, parentLookup);
    if (!inputGate.allowed) {
      const blockedMessage: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: [
          { type: "text", text: inputGate.friendlyMessage },
          {
            type: "suggestions",
            options: [
              "Try a different topic",
              "Show me what I've already explored",
              "Tell me a fun science fact",
            ],
          },
        ],
        timestamp: Date.now(),
      };
      saveMessage(sessionId, blockedMessage);
      const blockedResponse: ChatResponse = { message: blockedMessage, sessionId };
      res.json(blockedResponse);
      return;
    }

    // Build the AI response
    const rawBlocks = await generateCopilotResponse(body.messages, session);

    // Safety filter (built-in, age-based)
    let safeBlocks = applySafetyGate(rawBlocks, childAge);

    // -------- Parental controls: output gate --------
    // Runs AFTER Claude. Catches blocked categories + yellow-tier approval gating.
    const outputGate = await enforceOnOutput(childId, safeBlocks, parentLookup);
    if (outputGate.modified) {
      safeBlocks = outputGate.blocks;
    }

    // -------- Diagram resolution --------
    // Claude now emits diagram blocks with a description + style only — the
    // server resolves them to real image URLs via the shared image-gen
    // pipeline (Recraft → OpenAI → Claude SVG → placeholder). Cached.
    //
    // We do this in parallel so users see all images at once rather than
    // one painted at a time. We never let a diagram failure block the
    // text response.
    safeBlocks = await resolveDiagramBlocks(safeBlocks);

    // Update session phase based on content
    updateSessionPhase(session, safeBlocks);

    // Persist session changes
    updateSession(session);

    const message: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: safeBlocks,
      timestamp: Date.now(),
    };

    // Save the assistant's message
    saveMessage(sessionId, message);

    // -------- Gamification & activity logging --------
    try {
      // Award XP for sending a message
      awardAndCheck(childId, "message_sent", { text: lastUserMsg.text.slice(0, 80) });
      void logActivity({
        childId,
        type: "chat_message",
        summary: `Asked: "${lastUserMsg.text.slice(0, 60)}${lastUserMsg.text.length > 60 ? "..." : ""}"`,
      }).catch((e) => console.error("[chat] logActivity failed:", e));

      // Check for experiment-card blocks → award experiment_designed XP + log
      for (const block of safeBlocks) {
        if (block.type === "experiment-card") {
          awardAndCheck(childId, "experiment_designed", {
            experimentTitle: block.experiment.title,
            category: block.experiment.category,
          });
          void logActivity({
            childId,
            type: "experiment_designed",
            summary: `Designed experiment: ${block.experiment.title}`,
            metadata: { category: block.experiment.category },
          }).catch((e) => console.error("[chat] logActivity failed:", e));
        }
        if (block.type === "reflection") {
          awardAndCheck(childId, "reflection_answered", { question: block.question.slice(0, 60) });
        }
      }

      // Record screen time (estimate 1 minute per message exchange)
      const today = new Date().toISOString().slice(0, 10);
      void recordScreenTime(childId, today, 1).catch((e) =>
        console.error("[chat] recordScreenTime failed:", e),
      );
    } catch (gamErr) {
      // Gamification should never break the chat — log but swallow
      console.error("Gamification hook error:", gamErr);
    }

    const response: ChatResponse = { message, sessionId };
    res.json(response);
  } catch (err) {
    console.error("Chat endpoint error:", err);
    const fallbackMessage: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Oops! Something went wrong on my end. Can you try asking me again?",
        },
      ],
      timestamp: Date.now(),
    };
    res.status(500).json({ message: fallbackMessage, sessionId: req.body?.sessionId ?? randomUUID() });
  }
});

// ---------- phase transitions ----------

function updateSessionPhase(session: LabSession, blocks: ContentBlock[]): void {
  for (const block of blocks) {
    if (block.type === "experiment-card") {
      session.currentExperiment = block.experiment;
      session.phase = "designing";
      session.currentStep = 0;
    }
    if (block.type === "supply-list") {
      session.phase = "preparing";
    }
    if (block.type === "step") {
      session.phase = "experimenting";
      session.currentStep = block.stepNumber;
    }
    if (block.type === "reflection") {
      session.phase = "reflecting";
    }
    if (block.type === "celebration") {
      // After celebration, reset to exploring for the next experiment
      session.phase = "exploring";
      session.currentExperiment = undefined;
      session.currentStep = 0;
    }
  }
}
