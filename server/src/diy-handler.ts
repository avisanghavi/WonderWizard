// LabBuddy — DIY Guide handler: generates WikiHow-style illustrated guides
//
// As of the schematic-quality overhaul, step illustrations come from the
// shared image-gen pipeline (Recraft v3 → OpenAI → Claude SVG → placeholder)
// via the disk cache. Identical step descriptions across guides reuse the
// same cached image — huge cost savings on common topics.

import { Router } from "express";
import type { AuthRequest } from "./auth-middleware.js";
import { getDb } from "./db.js";
import type {
  GeneratedExperiment,
  DIYGuide,
  ExperimentStep,
} from "../../shared/types.js";
import { resolveSchematic } from "./image-cache.js";
import { generateMultiStepSvgs } from "./image-gen.js";
import { findStockImage } from "./stock-images.js";
import { getOrCreateSession } from "./repositories/session-repo.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGE_CACHE_DIR = path.resolve(__dirname, "../../data/image-cache");

export const diyRouter = Router();

// ---------- helpers ----------

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

/**
 * Build a STRONG, context-aware prompt for a single experiment step.
 *
 * The whole point of the DIY guide is for a kid (often 7–14) to look at
 * the illustration and SEE EXACTLY what they should be doing right now —
 * which container to use, which substance to pour, what hand position,
 * what the contents look like at this stage. Generic shapes don't help.
 *
 * The previous version was a one-liner that fed the SVG generator
 * something like "Step 3: pour vinegar into the bottle". With no context
 * about WHICH bottle, what shape, what's already inside, the model
 * drew an abstract bottle-glyph that didn't match the actual experiment.
 *
 * This builder fixes that by injecting:
 *   1. The full supplies inventory (so the model knows the visual vocabulary)
 *   2. The cumulative state up to this step (so contents/levels are correct)
 *   3. The specific action for this step with strong "show real components"
 *      anchoring instructions
 *   4. Labels for everything visible
 *
 * Output length is capped because the downstream Claude-SVG generator has
 * its own prompt and we're appending to a "description" field that gets
 * embedded inside that prompt.
 */
function stepImagePrompt(
  experiment: GeneratedExperiment,
  step: ExperimentStep,
  stepIndex: number
): string {
  const total = experiment.steps.length;
  const stepNum = stepIndex + 1;

  // 1. Identify the recurring "main container" — what the kid keeps coming
  //    back to (a bottle, a cup, a tray, a piece of paper, etc).
  //    Heuristic: the first supply that sounds like a vessel/surface.
  const containerHints =
    /bottle|cup|jar|tray|bowl|plate|glass|beaker|flask|tube|can|pan|paper|board|board|sheet|dish/i;
  const mainContainer = experiment.supplies.find((s) => containerHints.test(s.item));

  // 2. Build a brief supplies inventory the model can draw from.
  //    Cap at 8 items so the prompt doesn't balloon — the most important
  //    ones come first because the AI sorted them by relevance.
  const supplyList = experiment.supplies
    .slice(0, 8)
    .map((s) => `${s.item} (${s.quantity})`)
    .join("; ");

  // 3. Cumulative state. "By step 3 we have already done X and Y." This
  //    lets the model show the right contents/levels at the right time.
  const priorActions = experiment.steps
    .slice(0, stepIndex)
    .map((s, i) => `(${i + 1}) ${s.instruction}`)
    .join("  ");
  const cumulativeState =
    priorActions.length > 0
      ? `By this point the kid has already: ${priorActions}.`
      : `This is the very first step — nothing has been done yet.`;

  // 4. Per-step focus. Strong anti-abstraction instruction up front.
  const tip = step.tip ? ` Tip context: ${step.tip}.` : "";
  const safetyNote = step.safetyWarning ? ` Safety: ${step.safetyWarning}.` : "";

  // 5. Compose. Keep readable; the downstream SVG generator parses this
  //    as part of its own larger prompt, so we want it long enough to
  //    anchor but not so long we blow the model's attention budget.
  const lines: string[] = [
    // Overall framing — STEP NUMBER MUST APPEAR AS A BADGE
    `EXPERIMENT: "${experiment.title}" (${experiment.category}). This is STEP ${stepNum} of ${total} in a WikiHow-style DIY guide. Draw a step-number badge in the top-left corner showing the number ${stepNum}.`,

    // Visual vocabulary
    `SUPPLIES IN THIS EXPERIMENT: ${supplyList}.`,

    // Main object anchor (helps cross-step consistency)
    mainContainer
      ? `The main container throughout this experiment is the ${mainContainer.item}. Draw IT — its actual recognizable shape — not a generic vessel symbol. Same container appears across every step's illustration.`
      : "",

    // Where we are in the sequence
    cumulativeState,

    // The action for this step
    `THIS STEP'S ACTION: ${step.instruction}${tip}${safetyNote}`,

    // Anti-abstraction directive
    `DRAW: the EXACT physical setup as it would look at this moment — show the actual containers (not abstract boxes), show what's inside them with the right fill levels, show any hand/pouring/mixing motion as a clear arrow or stylized hand. Show only the supplies actually present at this step. Do NOT add scenery, decorative trees, or unrelated items.`,

    // Labeling guidance
    `LABEL each visible component with a leader line touching the exact part. Use the kid-friendly supply names verbatim (e.g., "${experiment.supplies[0]?.item ?? "main supply"}").`,
  ];

  return lines.filter(Boolean).join(" ");
}

// ---------- POST /generate ----------

diyRouter.post("/generate", async (req: AuthRequest, res) => {
  try {
    const { experiment, sessionId, polish } = req.body as {
      experiment: GeneratedExperiment;
      sessionId: string;
      /**
       * Run the composite polish pipeline (SVG blueprint → rasterize shapes →
       * Recraft img2img → overlay original labels) on every step.
       * Costs ~$0.045/step instead of ~$0.005, but adds watercolor warmth
       * while keeping crisp correct labels. Cached separately from the
       * blueprint version, so flipping back and forth is free after the
       * first run.
       */
      polish?: boolean;
    };

    if (!experiment || !sessionId) {
      res.status(400).json({ error: "experiment and sessionId are required" });
      return;
    }

    // Ensure the parent session row exists so the FK on diy_guides resolves.
    // Defaults to age 10 if we don't know — chat-handler updates it later.
    getOrCreateSession(sessionId, 10, req.parentId);

    const id = generateId();
    const generatedAt = Date.now();

    // Generate all step illustrations. Two paths:
    //
    //   FAST PATH (default): one Claude call that produces all step SVGs
    //   together. This is the single biggest cross-step consistency win —
    //   the model can keep the bottle / tray / palette identical across
    //   every step.
    //
    //   FALLBACK PATH: parallel fan-out via resolveSchematic. Used when
    //   the multi-step call fails parsing, OR when polish=true is set
    //   (polish requires per-step img2img and isn't compatible with the
    //   single-call path).
    const containerHints =
      /bottle|cup|jar|tray|bowl|plate|glass|beaker|flask|tube|can|pan|paper|board|sheet|dish/i;
    const mainContainer = experiment.supplies.find((s) =>
      containerHints.test(s.item)
    )?.item;

    // Per-step illustrations:
    //   1. If the step references EXACTLY ONE supply that matches a stock
    //      image (server/data/stock-images/), use that — zero cost, perfect.
    //   2. Otherwise, generate via Recraft v3 → GPT Image 1 → Claude SVG.
    //
    // The multi-step Claude-SVG fast path was removed — it produced abstract
    // icon-soup. Real image models know what a shoebox guitar looks like;
    // Claude only knows how to draw rectangles.
    void mainContainer;

    function findStockMatchForStep(step: ExperimentStep, allSupplies: typeof experiment.supplies): string | null {
      // Try the supplies mentioned in this step's instruction text. If exactly
      // one matches the stock library, prefer it.
      const text = step.instruction.toLowerCase();
      const mentioned = allSupplies.filter((s) => text.includes(s.item.toLowerCase()));
      const candidates = mentioned.length > 0 ? mentioned : allSupplies;
      const stockHits = candidates
        .map((s) => findStockImage(s.item))
        .filter((x): x is NonNullable<typeof x> => !!x);
      // Only use a stock image if we got a single unambiguous match — multiple
      // matches would need a composite we don't try to render here.
      return stockHits.length === 1 ? stockHits[0].url : null;
    }

    const stepResults = await Promise.all(
      experiment.steps.map(async (step, i) => {
        const stockUrl = findStockMatchForStep(step, experiment.supplies);
        if (stockUrl) {
          console.log(`[diy] step ${i} using stock image: ${stockUrl}`);
          return { url: stockUrl };
        }
        try {
          return await resolveSchematic({
            description: stepImagePrompt(experiment, step, i),
            style: "illustration",
            aspect: "landscape",
            polish: polish === true,
          });
        } catch (err) {
          console.error(`[diy] step ${i} schematic failed:`, err);
          return null;
        }
      })
    );
    const stepIllustrations: string[] = stepResults.map((entry, i) =>
      entry ? entry.url : `/api/images/placeholder?i=${i}`
    );

    // Persist
    const db = getDb();
    db.prepare(
      `INSERT INTO diy_guides (id, session_id, experiment, step_illustrations, generated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      id,
      sessionId,
      JSON.stringify(experiment),
      JSON.stringify(stepIllustrations),
      generatedAt
    );

    const guide: DIYGuide = {
      id,
      experiment,
      stepIllustrations,
      generatedAt,
      sessionId,
    };

    res.json(guide);
  } catch (err) {
    console.error("Error generating DIY guide:", err);
    res.status(500).json({ error: "Failed to generate DIY guide." });
  }
});

// ---------- GET /:id ----------

diyRouter.get("/:id", (req, res) => {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM diy_guides WHERE id = ?")
      .get(req.params.id) as
      | {
          id: string;
          session_id: string;
          experiment: string;
          step_illustrations: string;
          generated_at: number;
        }
      | undefined;

    if (!row) {
      res.status(404).json({ error: "DIY guide not found" });
      return;
    }

    const guide: DIYGuide = {
      id: row.id,
      experiment: JSON.parse(row.experiment),
      stepIllustrations: JSON.parse(row.step_illustrations),
      generatedAt: row.generated_at,
      sessionId: row.session_id,
    };

    res.json(guide);
  } catch (err) {
    console.error("Error fetching DIY guide:", err);
    res.status(500).json({ error: "Failed to fetch DIY guide." });
  }
});

// ---------- helpers ----------

/**
 * Persist a data URI from the multi-step generator as a file in the
 * shared image cache and return its public /api/images/render URL.
 *
 * Hash is deterministic from the cacheKey so the same experiment + step
 * pair always lands at the same URL — subsequent regenerations reuse
 * the file. Mirrors the addressing convention of image-cache.ts but
 * bypasses its single-call generator (since we already have the bytes).
 */
function persistDataUriToCache(dataUri: string, cacheKey: string): string {
  const m = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return "";
  const mime = m[1];
  const buf = Buffer.from(m[2], "base64");
  const ext = mime === "image/svg+xml" ? "svg" : mime === "image/png" ? "png" : "bin";

  const hash = crypto
    .createHash("sha256")
    .update(cacheKey)
    .digest("hex")
    .slice(0, 24);

  if (!fs.existsSync(IMAGE_CACHE_DIR)) {
    fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
  }
  const filePath = path.join(IMAGE_CACHE_DIR, `${hash}.${ext}`);
  const metaPath = path.join(IMAGE_CACHE_DIR, `${hash}.json`);
  fs.writeFileSync(filePath, buf);
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        mime,
        provider: "claude-svg-multi",
        costEstimate: 0.001,
        createdAt: Date.now(),
      },
      null,
      2
    )
  );
  return `/api/images/render/${hash}.${ext}`;
}
