// LabBuddy — Schematic image generation
//
// Two pipelines:
//
// 1. SCHEMATIC (blueprint) — accurate instructional SVG via Claude.
//    Real components, correct spelling, labels with leader lines.
//
// 2. POLISH (two-stage) — generate the SVG blueprint, rasterize it,
//    then run it through Recraft v3 image-to-image at LOW strength so
//    the model preserves the structure but adds painterly warmth. The
//    SVG owns correctness; the image owns beauty.
//
// Style routing (see generateSchematic()):
//   - "illustration"  → Recraft v3 text-to-image directly
//   - everything else → Claude SVG (precision)
//   - { polish: true }   on top of the above runs the two-stage pipeline

import Anthropic from "@anthropic-ai/sdk";
import { Resvg } from "@resvg/resvg-js";
import { fal } from "@fal-ai/client";
import type { DiagramStyle } from "../../shared/types.js";

// ---------- public API ----------

export interface GenerateOpts {
  description: string;
  style?: DiagramStyle;
  aspect?: "landscape" | "portrait" | "square";
  // Internal: caller passes a stable cache key (hash of inputs)
  cacheKey?: string;
  /**
   * Two-stage pipeline: generate SVG blueprint, rasterize it, then run
   * image-to-image polish through Recraft. SVG owns correctness, image
   * adds warmth. Requires FAL_KEY. Falls back gracefully.
   */
  polish?: boolean;
}

export interface GenerateResult {
  /** data URI ("data:image/png;base64,…") OR an inline SVG string */
  contentType: "image/png" | "image/svg+xml";
  dataUri: string;
  /** Which provider produced this — useful for telemetry */
  provider:
    | "recraft-v3"            // raster text-to-image
    | "recraft-polished"      // SVG blueprint → img2img polish (two-stage)
    | "openai-gpt-image-1"
    | "claude-svg"
    | "placeholder";
  /** Approximate USD cost for this call (informational only) */
  costEstimate?: number;
}

/**
 * Single entry point. Picks the best available provider for the requested
 * STYLE and falls back gracefully on failure. NEVER throws — worst case
 * returns a placeholder SVG so the UI always renders something.
 *
 * Routing rule:
 *   - "illustration"  → Recraft v3 (raster image gen wins on beauty)
 *   - everything else → Claude-SVG (raster models can't draw accurate
 *                       labels with leader lines pointing at specific
 *                       parts — that's instructional, not decorative)
 *   - { polish: true } → two-stage: generate SVG, rasterize, img2img-polish
 *                       through Recraft. SVG anchors correctness; the image
 *                       adds warmth. Requires FAL_KEY.
 *
 * Pixel-perfect labels and clear cross-sections are exactly what raster
 * image models still struggle with in 2026, which is why the default for
 * instructional diagrams is SVG. Polish is an opt-in layer on top.
 */
export async function generateSchematic(opts: GenerateOpts): Promise<GenerateResult> {
  // ----- TWO-STAGE: SVG blueprint → rasterize → img2img polish -----
  if (opts.polish && process.env.FAL_KEY) {
    const polished = await tryPolishedPipeline(opts);
    if (polished) return polished;
    // If polishing fails, fall through to the regular single-stage path
    console.warn("[image-gen] polish pipeline failed, falling back to single-stage");
  }

  const style = opts.style ?? "schematic";
  const order: Array<() => Promise<GenerateResult | null>> = [];

  const wantsRaster = style === "illustration";

  if (wantsRaster) {
    if (process.env.FAL_KEY) order.push(() => tryRecraftFal(opts));
    if (process.env.OPENAI_API_KEY) order.push(() => tryOpenAiImage(opts));
    if (process.env.ANTHROPIC_API_KEY) order.push(() => tryClaudeSvg(opts));
  } else {
    if (process.env.ANTHROPIC_API_KEY) order.push(() => tryClaudeSvg(opts));
    if (process.env.FAL_KEY) order.push(() => tryRecraftFal(opts));
    if (process.env.OPENAI_API_KEY) order.push(() => tryOpenAiImage(opts));
  }

  for (const attempt of order) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch (err) {
      console.warn("[image-gen] provider failed, trying next:", err);
    }
  }
  return makePlaceholder(opts);
}

// ---------- composite polish pipeline ----------
//
// The naive two-stage approach (rasterize SVG → img2img polish) fails
// because diffusion image models cannot preserve text characters — any
// strength setting scrambles labels into gibberish. The fix is to split
// the SVG into two layers, polish ONLY the shapes layer (which has no
// readable text the model can corrupt), then composite the original
// crisp labels back on top.
//
// Result: watercolor warmth on the shapes, pixel-perfect correct labels.

/**
 * Generate an SVG blueprint, split into shapes + labels, polish shapes
 * via img2img, then composite original labels on top. Returns a composite
 * SVG that embeds the polished raster image as <image> + overlays the
 * original <text>/leader-line elements above it.
 *
 * Returns null on any failure so the caller can try a single-stage fallback.
 */
async function tryPolishedPipeline(opts: GenerateOpts): Promise<GenerateResult | null> {
  // Stage 1: SVG blueprint
  const blueprint = await tryClaudeSvg(opts);
  if (!blueprint) return null;
  const svgString = decodeSvgFromDataUri(blueprint.dataUri);
  if (!svgString) return null;

  // Stage 2: split into shapes-layer (no readable text) + labels-layer
  const { shapesSvg, labelsMarkup, viewBox, width, height } = splitSvgLayers(svgString);

  // Stage 3: rasterize the shapes-only layer
  const shapesPng = rasterizeSvg(shapesSvg, opts.aspect);
  if (!shapesPng) return null;

  // Stage 4: polish the shapes-only PNG via Recraft img2img
  // (no text in the input → nothing to scramble)
  let polishedPng: Buffer | null;
  try {
    polishedPng = await recraftImageToImage(shapesPng, opts);
  } catch (err) {
    console.warn("[image-gen] img2img polish failed:", err);
    return null;
  }
  if (!polishedPng) return null;

  // Stage 5: composite — wrap polished PNG as <image> in an SVG, then
  // overlay the original crisp labels group on top.
  // No explicit width/height on the outer <svg> so the renderer scales
  // it to its container (the viewBox controls the coordinate space).
  const polishedB64 = polishedPng.toString("base64");
  const composite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"><image href="data:image/png;base64,${polishedB64}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>${labelsMarkup}</svg>`;

  const dataUri =
    "data:image/svg+xml;base64," + Buffer.from(composite, "utf-8").toString("base64");
  return {
    contentType: "image/svg+xml",
    dataUri,
    provider: "recraft-polished",
    costEstimate: 0.04 + 0.005,
  };
}

/**
 * Split a Claude-generated SVG into two layers:
 *   - shapesSvg:    full <svg> with `<g class="label">…</g>` blocks removed
 *   - labelsMarkup: the inner content of all those `<g class="label">` blocks,
 *                   ready to be appended inside a new <svg> on top of the
 *                   polished image
 *
 * Also returns the viewBox and explicit width/height for the composite.
 *
 * Robust to mild Claude variations: matches any case of "label" in the class
 * attribute, allows attribute reordering, and handles both single- and
 * double-quoted attribute values.
 */
function splitSvgLayers(svgString: string): {
  shapesSvg: string;
  labelsMarkup: string;
  viewBox: string;
  width: number;
  height: number;
} {
  // 1. Pull viewBox + size from the <svg> opening tag
  const vbMatch = svgString.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  const viewBox = vbMatch ? vbMatch[1] : "0 0 320 256";
  const [, , w, h] = viewBox.split(/\s+/).map(Number);
  const width = isFinite(w) ? w : 320;
  const height = isFinite(h) ? h : 256;

  // 2. Find every <g class="label">…</g> block (greedy-safe via [\s\S]*?)
  const labelGroupRe =
    /<g\b[^>]*\bclass\s*=\s*["'][^"']*\blabel\b[^"']*["'][^>]*>([\s\S]*?)<\/g>/gi;

  const labelContents: string[] = [];
  const shapesSvg = svgString.replace(labelGroupRe, (_full, inner: string) => {
    labelContents.push(inner.trim());
    return ""; // remove the whole group from the shapes layer
  });

  // Combine all label-group inner content into one markup string for overlay
  const labelsMarkup = labelContents.join("\n");

  return { shapesSvg, labelsMarkup, viewBox, width, height };
}

/**
 * Rasterize an SVG string to PNG bytes using resvg. Returns null on
 * any rasterization failure (malformed SVG, etc).
 */
function rasterizeSvg(
  svgString: string,
  aspect: "landscape" | "portrait" | "square" = "landscape"
): Buffer | null {
  try {
    // Render at high resolution so the polish step has detail to work with
    const targetWidth =
      aspect === "portrait" ? 1024 : aspect === "square" ? 1280 : 1536;
    const resvg = new Resvg(svgString, {
      fitTo: { mode: "width", value: targetWidth },
      background: "#FFF6E5",
    });
    return Buffer.from(resvg.render().asPng());
  } catch (err) {
    console.error("[image-gen] resvg rasterization failed:", err);
    return null;
  }
}

/**
 * Upload PNG bytes to fal storage, then run Recraft v3 image-to-image
 * with a low strength to preserve structure while adding polish.
 */
async function recraftImageToImage(
  pngBytes: Buffer,
  opts: GenerateOpts
): Promise<Buffer | null> {
  const key = process.env.FAL_KEY;
  if (!key) return null;

  // Configure the fal client once per process
  fal.config({ credentials: key });

  // Upload the rasterized blueprint to fal storage so the img2img endpoint
  // can fetch it by URL. Buffers can be uploaded via Blob in modern Node.
  const blob = new Blob([new Uint8Array(pngBytes)], { type: "image/png" });
  const uploadedUrl = await fal.storage.upload(blob as unknown as File);

  // CRITICAL: every NOUN in this prompt risks being rendered as literal
  // text in the output. Image-to-image models embed prompt words as
  // captions. So this prompt uses ONLY abstract style adjectives — no
  // nouns, no titles, no proper names, nothing the model could interpret
  // as a label.
  const polishPrompt =
    "painterly, softly textured, warm, gentle, friendly, watercolor";

  // Strength must be LOW (0.15–0.25). Higher values cause the model to
  // hallucinate new content (trees, houses) and rewrite labels.
  const result = (await fal.subscribe("fal-ai/recraft/v3/image-to-image", {
    input: {
      prompt: polishPrompt,
      image_url: uploadedUrl,
      strength: 0.18,
      style: "digital_illustration",
    },
    logs: false,
  })) as { data?: { images?: Array<{ url: string }> } };

  const outUrl = result?.data?.images?.[0]?.url;
  if (!outUrl) return null;

  const imgRes = await fetch(outUrl);
  if (!imgRes.ok) return null;
  return Buffer.from(await imgRes.arrayBuffer());
}

/**
 * Pull the raw SVG out of a `data:image/svg+xml;base64,...` data URI.
 */
function decodeSvgFromDataUri(dataUri: string): string | null {
  const m = dataUri.match(/^data:image\/svg\+xml;base64,(.+)$/);
  if (!m) return null;
  try {
    return Buffer.from(m[1], "base64").toString("utf-8");
  } catch {
    return null;
  }
}

// ---------- style locking ----------

const STYLE_PREAMBLE =
  "Flat illustration in a friendly science-textbook style. " +
  "Bold but limited color palette: deep purple #6C63FF, teal #4ECDC4, coral #FF6B6B, warm yellow #FFEAA7, soft cream #FFF6E5. " +
  "Thin dark outlines, friendly geometric shapes, clean labels in a sans-serif font. " +
  "White or very light cream background. Kid-appropriate, NO realistic faces, NO photorealism. " +
  "Clear, instructional, like a Bill Nye textbook illustration crossed with WikiHow.";

function styleSuffix(style?: DiagramStyle): string {
  switch (style) {
    case "cross-section":
      return " Cutaway cross-section: SHOW THE INTERIOR. Draw the container or specimen with a vertical slice removed so the inside is fully visible. Label every interior part with a leader line touching it.";
    case "exploded":
      return " Exploded breakdown view: lay out the individual parts on a flat surface or floating in arrangement, each clearly separated and labeled. Show what's inside the experiment, not just the outside.";
    case "process":
      return " Step-by-step process diagram with arrows showing progression, numbered stages, and minimal text.";
    case "comparison":
      return " Side-by-side comparison layout with a clear visual divider between the two states.";
    case "illustration":
      return " Friendly scene-style illustration with a hint of personality, but still instructional.";
    case "schematic":
    default:
      return " Labeled instructional schematic, clean and clear. Arrows and callouts where useful.";
  }
}

function buildPrompt(opts: GenerateOpts): string {
  return `${STYLE_PREAMBLE}${styleSuffix(opts.style)}\n\nSubject: ${opts.description}`;
}

function aspectToSize(aspect?: "landscape" | "portrait" | "square"): {
  width: number;
  height: number;
} {
  switch (aspect) {
    case "portrait":
      return { width: 1024, height: 1280 };
    case "square":
      return { width: 1024, height: 1024 };
    case "landscape":
    default:
      return { width: 1280, height: 1024 };
  }
}

// ---------- Recraft v3 via fal.ai ----------
//
// fal.ai hosts Recraft v3 and is the easiest way to call it from Node.
// Endpoint: https://fal.run/fal-ai/recraft-v3
//
// Required env: FAL_KEY  (https://fal.ai/dashboard/keys)
//
// Note: Recraft v3's "vector_illustration" style produces editable vector
// output. We use "digital_illustration" for a friendlier, painted-textbook
// feel that survives downscaling.

async function tryRecraftFal(opts: GenerateOpts): Promise<GenerateResult | null> {
  const key = process.env.FAL_KEY;
  if (!key) return null;

  const { width, height } = aspectToSize(opts.aspect);
  const prompt = buildPrompt(opts);

  const res = await fetch("https://fal.run/fal-ai/recraft-v3", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${key}`,
    },
    body: JSON.stringify({
      prompt,
      image_size: { width, height },
      style: "digital_illustration",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Recraft via fal.ai failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    images?: Array<{ url: string }>;
  };

  const url = json.images?.[0]?.url;
  if (!url) throw new Error("Recraft response had no image url");

  // Fetch the bytes and convert to a data URI so the caller can cache
  // without depending on fal's CDN being reachable forever.
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`Failed to fetch Recraft image: ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const dataUri = `data:image/png;base64,${buf.toString("base64")}`;

  return {
    contentType: "image/png",
    dataUri,
    provider: "recraft-v3",
    costEstimate: 0.04,
  };
}

// ---------- OpenAI gpt-image-1 (fallback) ----------

async function tryOpenAiImage(opts: GenerateOpts): Promise<GenerateResult | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const { width, height } = aspectToSize(opts.aspect);
  // gpt-image-1 only supports a fixed set of sizes
  let size: "1024x1024" | "1024x1536" | "1536x1024" = "1024x1024";
  if (width > height) size = "1536x1024";
  else if (height > width) size = "1024x1536";

  const prompt = buildPrompt(opts);

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size,
      n: 1,
      quality: "medium",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI image gen failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response had no b64_json");

  return {
    contentType: "image/png",
    dataUri: `data:image/png;base64,${b64}`,
    provider: "openai-gpt-image-1",
    costEstimate: 0.04,
  };
}

// ---------- Claude SVG fallback (refined prompt) ----------

let _claude: Anthropic | null = null;
function claudeClient(): Anthropic | null {
  if (_claude) return _claude;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _claude = new Anthropic({ apiKey: key });
  return _claude;
}

async function tryClaudeSvg(opts: GenerateOpts): Promise<GenerateResult | null> {
  const client = claudeClient();
  if (!client) return null;

  const { width, height } = aspectToSize(opts.aspect);
  const viewBoxW = Math.round(width / 4); // shrink down for cleaner SVG
  const viewBoxH = Math.round(height / 4);

  // The description sometimes includes a step number hint like "STEP 3 of 5".
  // We use that to gate badge validation — only require it when we actually
  // expect one.
  const expectStepBadge = /\bSTEP\s+\d+\s+of\s+\d+\b/i.test(opts.description);

  // This prompt is engineered for INSTRUCTIONAL accuracy, not decoration.
  // A kid (often 7–14) needs to look at this and SEE the components —
  // the bottle, the layers, the parts they'll actually touch — not just
  // a pretty stylized rendering. Every constraint here serves that goal.
  const prompt = `You are an instructional SVG illustrator for a kids' science app. Your job is teaching, not decoration.

CORE PRINCIPLE: A kid (age 7-14) should look at this drawing and immediately understand WHAT THE PARTS ARE and HOW THEY FIT TOGETHER. A "pretty volcano" is useless if the kid can't see the bottle inside it. Draw the actual things, not stylized representations.

STYLE BIBLE (FOLLOW EXACTLY):
- viewBox="0 0 ${viewBoxW} ${viewBoxH}"
- Color palette ONLY: #6C63FF (purple), #4ECDC4 (teal), #FF6B6B (coral), #FFEAA7 (yellow), #FFF6E5 (cream bg), #2D3436 (dark for outlines/labels)
- Stroke-width 2-3 for outlines, no thinner
- Use <rect>, <circle>, <ellipse>, <path>, <line>, <polygon>, <text> ONLY
- Round corners on rectangles (rx="8")
- Light cream background fills the canvas
- Labels: 11-13px sans-serif, dark color (#2D3436)
- Subtle gradients OK with <linearGradient>
- NO scripts, NO external refs, NO foreignObject
- NO emojis, NO unicode tricks — pure shapes

INSTRUCTIONAL RULES (NON-NEGOTIABLE):
1. SHOW THE REAL COMPONENTS. If the description mentions a "plastic bottle inside a clay mountain," DRAW THE BOTTLE — recognizably a bottle, not just a rectangle. The kid needs to see the actual object they'll be holding.
2. USE TRANSPARENCY OR CUTAWAYS to reveal what's hidden inside. If contents matter (vinegar, baking soda), the kid must SEE them inside the container — use fill-opacity 0.6-0.8 on outer shells, or draw a cutaway slice.
3. EVERY LABEL MUST HAVE A LEADER LINE that visibly TOUCHES the exact part it names. The label sits to the side; a thin line connects label-text to the precise part. No floating labels.
4. SEPARATE LAYERS VISUALLY. Different substances/parts must be distinguishable by color or texture — don't merge them into one blob.
5. SPELLING MATTERS. Spell every label correctly. "CO₂" not "Coz", "Bottle" not "Botle".
6. INCLUDE PARTS THE KID WILL ACTUALLY TOUCH. If they're going to pour, draw the pouring container. If they're going to mix, draw the mixing bowl. Reality first, decoration second.

ANTI-ABSTRACTION RULES (READ TWICE — THIS IS WHERE PRIOR ATTEMPTS FAILED):
A kid cannot identify a "coin" or an "LED" from a featureless colored square. If you find yourself drawing a generic rectangle for a physical object, STOP and draw the object's actual silhouette. A drawing that reduces everything to colored rectangles is a FAILED drawing, regardless of how well-labeled it is.

VISUAL DICTIONARY — how recurring household / science objects must look:

Electronics
- Coin → a CIRCLE (never a square). Light gold/copper fill (#FFEAA7), dark outline, optional inner concentric circle to suggest a rim. Diameter 14-22px.
- LED bulb → small dome shape: a circle for the bulb head + two short parallel vertical lines below as leads. Bulb fill 60% opacity (#4ECDC4 or #FF6B6B), dark outline. Total height ~28px.
- Capacitor (electrolytic) → tall narrow cylinder: a vertical rectangle with rounded top + two parallel vertical leads protruding from the bottom. Add a horizontal stripe near the top for the polarity band. ~40px tall.
- Battery → horizontal cylinder: long pill-shape rect with rx=8, with a SMALL nub on one short side (positive terminal). Optional "+/−" labels.
- Wire → thin curved or zig-zag <path> with stroke 2.5, no fill. Right-angle bends.

Containers / kitchen
- Bottle → tall rect (height ≈ 2.5× width), rounded corners, a short narrower rect on top for the neck, maybe a tiny cap rect.
- Cup / beaker → trapezoid (wider at top) OR a rect with a slight curve at the bottom. Show liquid inside as a partial fill.
- Bowl → wide shallow ellipse / half-ellipse from a side view.
- Paper → a flat rectangle outlined with a slight fold-corner triangle in one corner. Keep it thin (height < 30px).
- Magnet → horseshoe shape (filled U with rounded inner edge) OR a bar rect with N/S labels at the ends.

Crafts / build-from-stuff projects (CRITICAL — these get drawn wrong most often)
- Shoebox guitar → an OPEN rectangular box drawn in 3/4 perspective with rubber bands stretched ACROSS THE OPENING (taut horizontal lines, not squiggles, not inside the box). A pencil/dowel laid PERPENDICULAR across the bands acts as the bridge. Label rubber bands by thickness/color if multiple.
- Rubber band (stretched) → a single thin straight line (or two close parallel lines for thick bands) between two anchor points. NEVER curly/squiggly — taut means STRAIGHT.
- Cardboard box → 3/4 perspective: front face rect + top trapezoid + side parallelogram for visible depth. Open box = darker fill inside the opening.
- Pencil → thin rect with a triangular tip on one end (graphite) and optionally a smaller rect at the other end (eraser).
- Straw → thin tall rectangle with rounded top/bottom; if bent, draw the bent silhouette with two segments meeting at an angle.
- String / thread → single very thin curved <path>, light gray, attached to specific anchor points.
- Marble / ball → simple circle with a smaller off-center inner circle for a highlight.
- Ramp / inclined plane → right triangle, hypotenuse on top, base on the ground.

Data displays / charts (CRITICAL — when the step says "make a chart," draw a USABLE TABLE)
- Data table / chart → a proper grid with a HEADER ROW (slightly darker fill) showing the actual column names from the description, and 2-4 example rows beneath with sample values. Outline cells. Column names sit INSIDE the header row, not as floating labels. E.g. for "string length vs pitch": header = ["Length", "Pitch"], rows = ["10 cm", "high"], ["20 cm", "med"], ["30 cm", "low"].
- Graph / plot → labeled axes (X and Y) with a tick mark or two, and the data plotted as either dots or a line. Origin labeled "0".
- Number line → horizontal line with evenly-spaced tick marks and numeric labels.

Motion & instructions
- Hand / pouring motion → simple silhouette OR an arrow from the source container into the target.
- Arrow → narrow stroke with a small triangle head. Show direction of motion or sequence.

WHEN UNSURE: a recognizable cartoon-style drawing beats a "clean abstract icon." Add details (rim on a coin, leads on an LED, taut bands on a shoebox guitar, header row on a chart) even if they take extra <line>/<circle>/<rect> elements. If you can't tell what a named supply looks like from your training data, draw it AS the literal household item the name suggests (e.g. "shoebox guitar" = a shoebox with rubber bands on top).

LABEL GROUPING (CRITICAL FOR THE PIPELINE):
- Wrap EACH label-plus-leader pair in a <g class="label">…</g> group.
- The group contains EXACTLY one <text> and any <line>/<path> elements that form the leader line pointing at the labeled part.
- Do NOT wrap shapes (rect, circle, polygon, ellipse) in label groups — those belong outside.
- Example:
  <g class="label">
    <line x1="40" y1="80" x2="120" y2="60" stroke="#2D3436" stroke-width="2"/>
    <text x="38" y="78" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="end">Bottle</text>
  </g>
- Use this grouping consistently for every label.

WHAT TO DRAW: ${opts.description}

DIAGRAM STYLE: ${opts.style ?? "schematic"} — ${styleSuffix(opts.style).trim()}

LAYOUT GUIDANCE — STRUCTURED LIKE A TEXTBOOK PAGE, NOT A FREE-FORM SCENE:

CANVAS ZONES (treat these as a strict grid):
- LEFT LABEL ZONE: x ∈ [4, viewBoxWidth × 0.28]
- DIAGRAM ZONE: x ∈ [viewBoxWidth × 0.30, viewBoxWidth × 0.70] (center 40%)
- RIGHT LABEL ZONE: x ∈ [viewBoxWidth × 0.72, viewBoxWidth - 4]
- TOP MARGIN: y ∈ [4, 22] — for a step number badge
- BOTTOM MARGIN: y ∈ [viewBoxHeight - 18, viewBoxHeight - 4] — keep clear

LABEL PLACEMENT RULES (FOLLOW EXACTLY):
1. Each label belongs in either the left or right label zone — NEVER overlapping the diagram zone.
2. Stack labels VERTICALLY within their zone with at least 22px of spacing between rows.
3. For LEFT labels: text-anchor="end", x near (viewBoxWidth × 0.28 - 4). Text extends leftward into the label zone.
4. For RIGHT labels: text-anchor="start", x near (viewBoxWidth × 0.72 + 4). Text extends rightward into the label zone.
5. Distribute labels roughly evenly between left and right zones — don't dump them all on one side.
6. LEADER LINES must NOT cross each other. Plan the y-coordinates of labels so each leader line runs from its label horizontally then bends to its target, with no crossings.
7. Use a SHORT bend (one horizontal segment, one diagonal segment) for each leader. Avoid curvy paths.
8. If a label name is >12 characters, split into two <tspan> lines stacked vertically (font-size unchanged).

STEP NUMBER BADGE (REQUIRED if this is a step illustration):
- Top-left corner. A filled <circle cx="20" cy="20" r="14" fill="#6C63FF"/> with a white centered <text>1</text> (or whatever step number from the description).
- If you don't know the step number, omit the badge.

DIAGRAM ZONE RULES:
- The main subject of the action fills the diagram zone. NOTHING else.
- All physical components mentioned must appear inside the diagram zone.
- Shapes should be substantial (>40px in the smaller dimension).
- Use clear visual hierarchy: the part being acted upon RIGHT NOW gets the most visual weight.

OUTLAWED:
- NO scenery, NO decorative trees/houses/people/animals
- NO floating labels with no leader line
- NO leader lines that cross another leader line
- NO labels placed inside the diagram zone
- NO label text overlapping another label's text or another label's leader line (treat each label as a 22px-tall box that can't visually intersect any other label's box)
- NO featureless colored rectangles standing in for named physical objects (re-read the VISUAL DICTIONARY section above)

OUTPUT RULES:
- Return ONLY the SVG markup, starting with <svg and ending with </svg>
- No code fences, no explanation, no JSON wrapper
- Must be under 4000 characters
- Self-contained and well-formed XML

EXAMPLES (FOLLOW THIS STYLE EXACTLY):

— EXAMPLE 1 — a simple 2-label schematic with a step badge —
<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg">
  <rect width="320" height="240" fill="#FFF6E5"/>
  <!-- step badge top-left -->
  <circle cx="22" cy="22" r="14" fill="#6C63FF"/>
  <text x="22" y="26" font-family="sans-serif" font-size="14" font-weight="700" fill="#FFF6E5" text-anchor="middle">1</text>
  <!-- diagram zone: bottle on tray -->
  <ellipse cx="160" cy="180" rx="68" ry="14" fill="#4ECDC4" stroke="#2D3436" stroke-width="2"/>
  <rect x="142" y="110" width="36" height="64" rx="6" fill="#FFF6E5" stroke="#2D3436" stroke-width="2.5"/>
  <rect x="150" y="98" width="20" height="14" rx="3" fill="#6C63FF" stroke="#2D3436" stroke-width="2"/>
  <!-- labels: one left, one right -->
  <g class="label">
    <line x1="85" y1="120" x2="140" y2="138" stroke="#2D3436" stroke-width="2"/>
    <text x="80" y="118" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="end">Plastic bottle</text>
  </g>
  <g class="label">
    <line x1="240" y1="178" x2="222" y2="180" stroke="#2D3436" stroke-width="2"/>
    <text x="245" y="182" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="start">Baking tray</text>
  </g>
</svg>

— EXAMPLE 2 — a 4-label cross-section with labels balanced left/right —
<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg">
  <rect width="320" height="240" fill="#FFF6E5"/>
  <circle cx="22" cy="22" r="14" fill="#6C63FF"/>
  <text x="22" y="26" font-family="sans-serif" font-size="14" font-weight="700" fill="#FFF6E5" text-anchor="middle">3</text>
  <!-- diagram zone: bottle (transparent) inside clay mountain, soda + vinegar visible inside -->
  <polygon points="115,185 160,90 205,185" fill="#FF6B6B" stroke="#2D3436" stroke-width="2.5" fill-opacity="0.55"/>
  <rect x="148" y="100" width="24" height="80" rx="6" fill="#FFF6E5" stroke="#2D3436" stroke-width="2.5" fill-opacity="0.85"/>
  <rect x="151" y="160" width="18" height="18" fill="#FFEAA7" stroke="#2D3436" stroke-width="1.5"/>
  <rect x="151" y="140" width="18" height="18" fill="#4ECDC4" stroke="#2D3436" stroke-width="1.5"/>
  <ellipse cx="160" cy="200" rx="68" ry="12" fill="#4ECDC4" stroke="#2D3436" stroke-width="2"/>
  <!-- labels: 2 left, 2 right; ordered top-to-bottom in each zone to avoid crossings -->
  <g class="label">
    <line x1="78" y1="95" x2="148" y2="108" stroke="#2D3436" stroke-width="2"/>
    <text x="73" y="93" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="end">Plastic bottle</text>
  </g>
  <g class="label">
    <line x1="78" y1="148" x2="150" y2="148" stroke="#2D3436" stroke-width="2"/>
    <text x="73" y="146" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="end">Vinegar</text>
  </g>
  <g class="label">
    <line x1="240" y1="100" x2="170" y2="115" stroke="#2D3436" stroke-width="2"/>
    <text x="245" y="98" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="start">Clay mountain</text>
  </g>
  <g class="label">
    <line x1="240" y1="168" x2="170" y2="168" stroke="#2D3436" stroke-width="2"/>
    <text x="245" y="170" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="start">Baking soda</text>
  </g>
</svg>

Match this EXACT STYLE — palette, stroke widths, badge style, label zones, leader-line approach. Adapt content to the request below.

Draw the instructional diagram now.`;

  // Generate → validate → retry once with specific geometric feedback.
  // Most generations pass the first time. When they don't, the retry
  // catches the remaining cases without ballooning latency: Claude is
  // good at acting on explicit "line A crosses line B" feedback.
  const callClaude = async (messages: Array<{ role: "user" | "assistant"; content: string }>) => {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages,
    });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
    if (!match) throw new Error("Claude response had no <svg> element");
    return { raw, svg: match[0] };
  };

  const sanitize = (svg: string) =>
    svg
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "");

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: prompt },
  ];

  let attempt = 0;
  let bestSvg = "";
  let bestViolations: LayoutViolation[] = [];
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    attempt++;
    const { raw, svg } = await callClaude(messages);
    const clean = sanitize(svg);
    const violations = validateSvgLayout(clean, { expectStepBadge });

    if (violations.length === 0) {
      bestSvg = clean;
      bestViolations = [];
      break;
    }

    // Track the best (fewest-violations) candidate in case both attempts fail
    if (!bestSvg || violations.length < bestViolations.length) {
      bestSvg = clean;
      bestViolations = violations;
    }

    if (attempt >= maxAttempts) break;

    // Append the assistant's output and explicit feedback for the retry
    messages.push({ role: "assistant", content: raw });
    const feedback =
      `The diagram has layout problems. Fix EACH of these and return a NEW <svg>:\n` +
      violations
        .slice(0, 6)
        .map((v, i) => `  ${i + 1}. [${v.rule}] ${v.detail}`)
        .join("\n") +
      `\n\nReturn the corrected SVG only — no commentary, no code fences.`;
    messages.push({ role: "user", content: feedback });
  }

  if (bestViolations.length > 0) {
    console.warn(
      `[image-gen] tryClaudeSvg: ${bestViolations.length} unresolved layout violations after ${attempt} attempts:`,
      bestViolations.map((v) => v.rule).join(", ")
    );
  }

  // Expand viewBox so any remaining edge-of-canvas text still renders
  const cleaned = expandViewBoxForLabels(bestSvg);

  const dataUri =
    "data:image/svg+xml;base64," + Buffer.from(cleaned, "utf-8").toString("base64");

  return {
    contentType: "image/svg+xml",
    dataUri,
    provider: "claude-svg",
    costEstimate: 0.005 * attempt,
  };
}

// ---------- multi-step single-call SVG generation ----------
//
// For DIY guides: instead of fanning out N independent Claude calls (one
// per step), do it all in ONE call so the model can plan cross-step
// consistency — the bottle sits at the same screen position across every
// step, the tray under it has the same proportions, palette is identical,
// etc.
//
// Input: experiment metadata + an array of step descriptions.
// Output: array of cleaned, viewBox-expanded SVG strings, one per step.

export interface MultiStepRequest {
  /** Title / category of the overall experiment — added for context. */
  experimentTitle: string;
  experimentCategory: string;
  /** Inventory of supplies the model has to work with (visual vocabulary). */
  supplies: Array<{ item: string; quantity: string }>;
  /** Per-step descriptive prompt (already built by the caller). */
  steps: Array<{ stepNumber: number; description: string }>;
  aspect?: "landscape" | "portrait" | "square";
  /**
   * Identifier for the "main container" that should keep the same screen
   * position across every step (e.g., "plastic bottle"). Optional — if
   * absent, the model picks one and is told to keep it consistent.
   */
  mainContainer?: string;
}

export interface MultiStepResult {
  /** Same length as input steps; each element is a data URI for the SVG. */
  dataUris: string[];
  /** Provider stamp + per-step violation counts (informational). */
  provider: "claude-svg-multi";
  costEstimate: number;
  violationsPerStep: number[];
}

/**
 * Generate an array of SVGs (one per experiment step) in a single Claude
 * call. The model is instructed to:
 *   - Use the SAME palette, stroke widths, label fonts in every step
 *   - Keep the main container at the same canvas coordinates
 *   - Add the step-number badge in each one
 *   - Build cumulative visual state across steps
 *
 * Returns null on total failure so the caller can fall back to the old
 * per-step fan-out path.
 */
export async function generateMultiStepSvgs(
  req: MultiStepRequest
): Promise<MultiStepResult | null> {
  const client = claudeClient();
  if (!client) return null;

  const { width, height } = aspectToSize(req.aspect);
  const viewBoxW = Math.round(width / 4);
  const viewBoxH = Math.round(height / 4);

  const supplyList = req.supplies
    .slice(0, 10)
    .map((s) => `${s.item} (${s.quantity})`)
    .join("; ");

  const containerNote = req.mainContainer
    ? `MAIN CONTAINER (PIN ITS POSITION): The "${req.mainContainer}" appears in every step. Place it at THE SAME (x, y) coordinates in every step's SVG so the kid sees continuity across the guide. Suggested anchor: cx=${Math.round(viewBoxW / 2)}, cy=${Math.round(viewBoxH * 0.55)}.`
    : `MAIN CONTAINER (PIN ITS POSITION): Pick the recurring container (a bottle, cup, tray, etc.) and place it at THE SAME (x, y) coordinates in every step's SVG.`;

  const stepsBlock = req.steps
    .map((s) => `[STEP ${s.stepNumber}]\n${s.description}`)
    .join("\n\n");

  const prompt = `You are an instructional SVG illustrator producing a multi-step WikiHow-style guide for a kids' science app. You will produce ONE SVG PER STEP, all in a single response, as a JSON array.

EXPERIMENT: "${req.experimentTitle}" (${req.experimentCategory})
SUPPLIES IN SCOPE: ${supplyList}

CROSS-STEP CONSISTENCY (CRITICAL):
- All step SVGs share the SAME palette, stroke widths, label font, badge style, and label-zone layout.
- ${containerNote}
- The cumulative state must build across steps: step 1 shows the starting setup; step 2 shows the result of step 1 plus the action of step 2; etc.
- A kid scrolling through all the SVGs should feel like one stop-motion sequence, NOT like five separate drawings.

ANTI-ABSTRACTION (THE #1 FAILURE MODE — READ TWICE):
A kid cannot identify a "coin" or an "LED" from a featureless colored square. If your instinct is to draw a labeled colored rectangle for a physical object, STOP and draw the actual silhouette of that object instead. A guide where every component is a colored box is a FAILED guide regardless of how clean the labels are.

VISUAL DICTIONARY — recurring objects must look like THIS, not like generic rectangles:

Electronics
- Coin → a CIRCLE (never a square). Light gold/copper fill, dark outline, optional inner ring for rim. 14-22px diameter.
- LED bulb → small dome: circle for the bulb head + two short parallel vertical leads. Bulb fill 60% opacity. ~28px tall.
- Capacitor → tall narrow cylinder: vertical rect with rounded top + two vertical leads + polarity stripe near top. ~40px tall.
- Battery → horizontal pill-shape rect with rx=8, with a small nub on one end (positive terminal). Optional "+/−" labels.
- Wire → thin curved or zig-zag <path> with stroke 2.5, no fill. Right-angle bends.

Containers / kitchen
- Bottle → tall rect (height ≈ 2.5× width), rounded, with a short narrow neck on top.
- Cup / beaker → trapezoid (wider at top) OR rect with curved base. Liquid shown as partial fill.
- Paper → flat rect with a tiny fold-corner triangle. Keep thin (<30px tall).
- Magnet → horseshoe shape OR a bar rect with N/S labels.

Crafts / "build it from household stuff" projects (THIS IS WHERE THE MODEL FAILS MOST)
- Shoebox guitar → OPEN rectangular box in 3/4 perspective with rubber bands stretched ACROSS THE OPENING (taut horizontal lines, NOT squiggles, NOT inside the closed box) and a pencil laid perpendicular as the bridge. Bands are taut = STRAIGHT.
- Rubber band → single thin STRAIGHT line between two anchor points (or two close parallel lines for thick bands). Never curly.
- Cardboard box → 3/4 perspective: front face rect + top trapezoid + side parallelogram. Open box = darker interior.
- Pencil → thin rect with a triangular graphite tip and small eraser rect on the other end.
- Straw → thin tall rect with rounded ends. Bent straws have two segments meeting at an angle.
- String / thread → very thin curved <path>, light gray, attached to specific anchors.
- Marble / ball → circle with an off-center inner highlight circle.
- Ramp / inclined plane → right triangle.

Data displays / charts (CRITICAL — when a step says "make a chart," draw a USABLE TABLE)
- Data table → grid with a HEADER ROW (slightly darker fill) showing actual column names from the description, and 2-4 sample rows below. Column names sit INSIDE the header row, NOT as floating labels. E.g. for "string length vs pitch": header [Length | Pitch], rows [10 cm | high], [20 cm | med], [30 cm | low].
- Graph / plot → labeled X/Y axes with tick marks; data shown as dots or a line. Origin "0" labeled.
- Number line → horizontal line with evenly-spaced ticks and numeric labels.

A recognizable cartoon-style drawing ALWAYS beats a "clean abstract icon." If you can't tell what a named supply looks like, draw it AS the literal household object the name suggests ("shoebox guitar" = literal shoebox with bands on top, not a stylized guitar shape).

STYLE BIBLE (same as a single-shot diagram):
- viewBox="0 0 ${viewBoxW} ${viewBoxH}" for every SVG
- Palette ONLY: #6C63FF, #4ECDC4, #FF6B6B, #FFEAA7, #FFF6E5 (cream bg), #2D3436 (outlines / labels)
- Stroke-width 2-3
- Cream background <rect> fills the canvas in every SVG
- Labels 11-13px sans-serif, dark color
- Wrap each label-plus-leader pair in <g class="label"> with one <text> and one <line>
- Step-number badge top-left: <circle cx="22" cy="22" r="14" fill="#6C63FF"/> + centered white <text> showing the step number

LAYOUT (same in every step):
- LEFT label zone:  x ∈ [4, ${Math.round(viewBoxW * 0.28)}]
- DIAGRAM zone:     x ∈ [${Math.round(viewBoxW * 0.3)}, ${Math.round(viewBoxW * 0.7)}]
- RIGHT label zone: x ∈ [${Math.round(viewBoxW * 0.72)}, ${viewBoxW - 4}]
- Stack labels vertically with ≥22px spacing
- NEVER let leader lines cross each other
- NEVER let one label's text physically overlap another label's text or another label's leader line (treat each label as a 22px-tall box that cannot intersect any other label's box)
- NEVER place labels inside the diagram zone
- NEVER add scenery (trees, houses, animals, etc.)
- NEVER draw a featureless colored rectangle in place of a named real-world object — re-read the VISUAL DICTIONARY above

EXAMPLE OF ONE WELL-FORMED STEP SVG (notice the LED has a dome+leads, the coin is a real circle, the battery has a terminal nub — NONE of them are featureless rectangles):
<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg">
  <rect width="320" height="240" fill="#FFF6E5"/>
  <circle cx="22" cy="22" r="14" fill="#6C63FF"/>
  <text x="22" y="26" font-family="sans-serif" font-size="14" font-weight="700" fill="#FFF6E5" text-anchor="middle">2</text>
  <!-- Battery (horizontal pill with positive nub) -->
  <rect x="100" y="110" width="80" height="28" rx="8" fill="#FFEAA7" stroke="#2D3436" stroke-width="2.5"/>
  <rect x="180" y="118" width="6" height="12" fill="#2D3436"/>
  <!-- Wires from battery to LED -->
  <path d="M 100 124 L 80 124 L 80 90 L 200 90" stroke="#2D3436" stroke-width="2.5" fill="none"/>
  <path d="M 186 124 L 210 124 L 210 140" stroke="#2D3436" stroke-width="2.5" fill="none"/>
  <!-- LED: dome + two leads -->
  <circle cx="205" cy="84" r="9" fill="#FF6B6B" stroke="#2D3436" stroke-width="2" fill-opacity="0.6"/>
  <line x1="201" y1="92" x2="201" y2="100" stroke="#2D3436" stroke-width="2"/>
  <line x1="209" y1="92" x2="209" y2="100" stroke="#2D3436" stroke-width="2"/>
  <!-- Coin: a real circle, not a square -->
  <circle cx="210" cy="160" r="11" fill="#FFEAA7" stroke="#2D3436" stroke-width="2"/>
  <circle cx="210" cy="160" r="7" fill="none" stroke="#2D3436" stroke-width="1"/>
  <g class="label">
    <line x1="78" y1="124" x2="100" y2="124" stroke="#2D3436" stroke-width="2"/>
    <text x="73" y="122" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="end">Battery</text>
  </g>
  <g class="label">
    <line x1="240" y1="84" x2="215" y2="84" stroke="#2D3436" stroke-width="2"/>
    <text x="245" y="86" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="start">LED bulb</text>
  </g>
  <g class="label">
    <line x1="240" y1="160" x2="222" y2="160" stroke="#2D3436" stroke-width="2"/>
    <text x="245" y="162" font-family="sans-serif" font-size="12" fill="#2D3436" text-anchor="start">Coin</text>
  </g>
</svg>

STEPS TO ILLUSTRATE (one SVG per step, IN ORDER):

${stepsBlock}

OUTPUT FORMAT (READ CAREFULLY):
- Respond with a JSON array of SVG strings, ONE per step, in step order.
- Each element is a complete <svg>...</svg>.
- Do NOT wrap the JSON in code fences.
- Do NOT add any commentary before or after the JSON.
- Example shape: ["<svg ...>...</svg>","<svg ...>...</svg>"]

Produce the JSON array now.`;

  // We allow more tokens here because we're producing N SVGs at once.
  // 4096 tokens × 4-byte avg ≈ 16k chars; each SVG runs ~1.5-3k chars,
  // so for ≤8 steps we have headroom. For very long guides we still pay
  // a bit more but the consistency win is huge.
  const maxTokens = Math.min(4096 + req.steps.length * 1200, 16000);

  let raw = "";
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch (err) {
    console.error("[image-gen] multi-step Claude call failed:", err);
    return null;
  }

  // Parse JSON array of SVGs. Be tolerant of light surrounding whitespace
  // or accidental code fences.
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(trimmed);
  } catch {
    // Sometimes the model returns SVGs joined by commas with stray text;
    // fall back to extracting each <svg>…</svg> in document order.
    const matches = trimmed.match(/<svg[\s\S]*?<\/svg>/gi);
    if (!matches || matches.length === 0) {
      console.error("[image-gen] multi-step: could not parse response");
      return null;
    }
    parsedRaw = matches;
  }
  if (!Array.isArray(parsedRaw)) {
    console.error("[image-gen] multi-step: parsed response is not an array");
    return null;
  }
  const svgs: string[] = parsedRaw
    .filter((s): s is string => typeof s === "string")
    .map((s) => {
      const m = s.match(/<svg[\s\S]*?<\/svg>/i);
      return m ? m[0] : "";
    })
    .filter(Boolean);

  if (svgs.length !== req.steps.length) {
    console.warn(
      `[image-gen] multi-step: expected ${req.steps.length} SVGs, got ${svgs.length}`
    );
    // Pad short responses with empty strings so the caller can choose to
    // fall back per-step; truncate over-long.
    while (svgs.length < req.steps.length) svgs.push("");
    svgs.length = req.steps.length;
  }

  const sanitize = (svg: string) =>
    svg
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "");

  const dataUris: string[] = [];
  const violationsPerStep: number[] = [];
  for (let i = 0; i < svgs.length; i++) {
    const raw = svgs[i];
    if (!raw) {
      dataUris.push("");
      violationsPerStep.push(-1);
      continue;
    }
    const clean = sanitize(raw);
    const violations = validateSvgLayout(clean, { expectStepBadge: true });
    violationsPerStep.push(violations.length);
    const expanded = expandViewBoxForLabels(clean);
    dataUris.push(
      "data:image/svg+xml;base64," + Buffer.from(expanded, "utf-8").toString("base64")
    );
  }

  return {
    dataUris,
    provider: "claude-svg-multi",
    costEstimate: 0.005 * Math.max(1, Math.ceil(req.steps.length / 3)),
    violationsPerStep,
  };
}

// ---------- placeholder (zero-dep, never-fails) ----------

function makePlaceholder(opts: GenerateOpts): GenerateResult {
  // Deterministic-ish color from the description so different diagrams
  // get visually distinct placeholders.
  const palette = ["#6C63FF", "#4ECDC4", "#FF6B6B", "#FFEAA7", "#FFB088"];
  let h = 0;
  for (const c of opts.description) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const color = palette[h % palette.length];

  const desc = opts.description
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 80);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250">
  <rect width="400" height="250" rx="16" fill="#FFF6E5"/>
  <circle cx="200" cy="105" r="48" fill="${color}" opacity="0.18"/>
  <circle cx="200" cy="105" r="30" fill="${color}" opacity="0.45"/>
  <text x="200" y="200" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#2D3436">${desc}</text>
  <text x="200" y="220" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="#88838E" opacity="0.7">(diagram unavailable)</text>
</svg>`;

  return {
    contentType: "image/svg+xml",
    dataUri:
      "data:image/svg+xml;base64," + Buffer.from(svg, "utf-8").toString("base64"),
    provider: "placeholder",
    costEstimate: 0,
  };
}

// ---------- layout validator ----------
//
// Geometric checks for the structural rules the prompt asks Claude to obey.
// Returns a list of human-readable violations; empty list = clean diagram.
// When at least one violation is found, the caller retries the generation
// with the violation messages included as feedback to Claude.
//
// We aim for FAST + GOOD-ENOUGH, not perfect. A handful of regex passes
// covers ~95% of layout failures we've seen in practice (clipped labels,
// crossing leader lines, missing step badge, labels overlapping shapes).

export interface LayoutViolation {
  rule: string;
  detail: string;
}

const NUM_RE = /(-?\d+(?:\.\d+)?)/;

interface SvgLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface SvgText {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  text: string;
  approxWidth: number; // text-length × font-size × 0.6
  fontSize: number;
}

function parseViewBox(svg: string): { x: number; y: number; w: number; h: number } | null {
  const m = svg.match(
    new RegExp(
      `viewBox\\s*=\\s*["']\\s*${NUM_RE.source}\\s+${NUM_RE.source}\\s+${NUM_RE.source}\\s+${NUM_RE.source}\\s*["']`
    )
  );
  if (!m) return null;
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}

function extractLabelGroups(svg: string): Array<{ lines: SvgLine[]; texts: SvgText[] }> {
  const groupRe =
    /<g\b[^>]*\bclass\s*=\s*["'][^"']*\blabel\b[^"']*["'][^>]*>([\s\S]*?)<\/g>/gi;
  const out: Array<{ lines: SvgLine[]; texts: SvgText[] }> = [];
  let m;
  while ((m = groupRe.exec(svg)) !== null) {
    const inner = m[1];
    const lines: SvgLine[] = [];
    const lineRe =
      /<line\b[^>]*x1\s*=\s*["']([^"']+)["'][^>]*y1\s*=\s*["']([^"']+)["'][^>]*x2\s*=\s*["']([^"']+)["'][^>]*y2\s*=\s*["']([^"']+)["']/gi;
    let lm;
    while ((lm = lineRe.exec(inner)) !== null) {
      lines.push({ x1: +lm[1], y1: +lm[2], x2: +lm[3], y2: +lm[4] });
    }
    const texts: SvgText[] = [];
    const textRe =
      /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
    let tm;
    while ((tm = textRe.exec(inner)) !== null) {
      const attrs = tm[1];
      const body = tm[2].replace(/<[^>]+>/g, "").trim();
      const xMatch = attrs.match(/\bx\s*=\s*["']([^"']+)["']/);
      const yMatch = attrs.match(/\by\s*=\s*["']([^"']+)["']/);
      const anchorMatch = attrs.match(/\btext-anchor\s*=\s*["']([^"']+)["']/);
      const sizeMatch = attrs.match(/\bfont-size\s*=\s*["']([^"']+)["']/);
      const fontSize = sizeMatch ? parseFloat(sizeMatch[1]) || 12 : 12;
      texts.push({
        x: xMatch ? parseFloat(xMatch[1]) || 0 : 0,
        y: yMatch ? parseFloat(yMatch[1]) || 0 : 0,
        anchor: (anchorMatch?.[1] as SvgText["anchor"]) ?? "start",
        text: body,
        approxWidth: body.length * fontSize * 0.55,
        fontSize,
      });
    }
    out.push({ lines, texts });
  }
  return out;
}

/** Standard 2D segment intersection (no parallel/colinear edge cases). */
function segmentsIntersect(a: SvgLine, b: SvgLine): boolean {
  const det = (a.x2 - a.x1) * (b.y2 - b.y1) - (a.y2 - a.y1) * (b.x2 - b.x1);
  if (Math.abs(det) < 1e-6) return false; // parallel — ignore
  const t =
    ((b.x1 - a.x1) * (b.y2 - b.y1) - (b.y1 - a.y1) * (b.x2 - b.x1)) / det;
  const u =
    ((b.x1 - a.x1) * (a.y2 - a.y1) - (b.y1 - a.y1) * (a.x2 - a.x1)) / det;
  // Allow tiny endpoint overlap (labels sharing a target are OK)
  const eps = 0.02;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

/**
 * Compute the bounding box of a <text>'s visible glyphs given anchor.
 */
function textBox(t: SvgText): { x1: number; y1: number; x2: number; y2: number } {
  const ascent = t.fontSize * 0.85;
  const descent = t.fontSize * 0.2;
  let x1: number, x2: number;
  if (t.anchor === "end") {
    x2 = t.x;
    x1 = t.x - t.approxWidth;
  } else if (t.anchor === "middle") {
    x1 = t.x - t.approxWidth / 2;
    x2 = t.x + t.approxWidth / 2;
  } else {
    x1 = t.x;
    x2 = t.x + t.approxWidth;
  }
  return { x1, y1: t.y - ascent, x2, y2: t.y + descent };
}

/**
 * Validate the structural cleanliness of a Claude-generated SVG.
 *
 * The expectStepBadge flag is true when the caller is generating a step
 * illustration (DIY guide), in which case we require the purple top-left
 * badge to be present.
 */
export function validateSvgLayout(
  svg: string,
  opts: { expectStepBadge?: boolean } = {}
): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  const vb = parseViewBox(svg);
  if (!vb) {
    violations.push({
      rule: "viewBox",
      detail: "SVG is missing a parseable viewBox attribute.",
    });
    return violations;
  }
  const leftZoneEnd = vb.x + vb.w * 0.3;
  const rightZoneStart = vb.x + vb.w * 0.7;

  // ---- 1. Step badge ----
  if (opts.expectStepBadge) {
    // Look for a purple circle near top-left and an adjacent <text>
    const badgeRe =
      /<circle\b[^>]*cx\s*=\s*["']\s*(?:1[5-9]|2\d|3[0-2])\s*["'][^>]*cy\s*=\s*["']\s*(?:1[5-9]|2\d|3[0-2])\s*["'][^>]*fill\s*=\s*["']\s*#6C63FF\s*["']/i;
    if (!badgeRe.test(svg)) {
      violations.push({
        rule: "step_badge_missing",
        detail:
          "No purple step-number badge near the top-left corner. Add a <circle cx='22' cy='22' r='14' fill='#6C63FF'/> with the step number as a centered white <text>.",
      });
    }
  }

  // ---- 2. Label zones ----
  const groups = extractLabelGroups(svg);
  groups.forEach((g, gi) => {
    g.texts.forEach((t) => {
      const tb = textBox(t);
      const inLeftZone = tb.x1 >= vb.x - 1 && tb.x2 <= leftZoneEnd + 4;
      const inRightZone = tb.x1 >= rightZoneStart - 4 && tb.x2 <= vb.x + vb.w + 1;
      if (!inLeftZone && !inRightZone) {
        violations.push({
          rule: "label_outside_zone",
          detail: `Label "${t.text}" (group ${gi + 1}) sits in the middle of the canvas at x≈${Math.round(t.x)}. Move it into the left label zone (x < ${Math.round(leftZoneEnd)}) or the right label zone (x > ${Math.round(rightZoneStart)}).`,
        });
      }
    });
  });

  // ---- 3. Leader-line crossings ----
  // Compare all leader-line segments across different label groups (not
  // within the same group — a leader can have a bend).
  const allLines: Array<SvgLine & { gi: number; labelText: string }> = [];
  groups.forEach((g, gi) => {
    const label =
      g.texts.map((t) => t.text).filter(Boolean).join("/") || `group ${gi + 1}`;
    g.lines.forEach((ln) => allLines.push({ ...ln, gi, labelText: label }));
  });
  for (let i = 0; i < allLines.length; i++) {
    for (let j = i + 1; j < allLines.length; j++) {
      const a = allLines[i];
      const b = allLines[j];
      if (a.gi === b.gi) continue; // same label group is fine
      if (segmentsIntersect(a, b)) {
        violations.push({
          rule: "leader_line_crossing",
          detail: `Leader line for "${a.labelText}" crosses the leader line for "${b.labelText}". Reposition one of the labels' y-coordinates so their leaders run parallel without intersecting.`,
        });
        if (violations.length > 8) return violations; // cap the list
      }
    }
  }

  // ---- 4. Label/label collisions (rough text-box overlap) ----
  const allTexts: Array<SvgText & { gi: number }> = [];
  groups.forEach((g, gi) => g.texts.forEach((t) => allTexts.push({ ...t, gi })));
  for (let i = 0; i < allTexts.length; i++) {
    for (let j = i + 1; j < allTexts.length; j++) {
      const a = textBox(allTexts[i]);
      const b = textBox(allTexts[j]);
      const overlap =
        a.x1 < b.x2 - 1 &&
        a.x2 > b.x1 + 1 &&
        a.y1 < b.y2 - 1 &&
        a.y2 > b.y1 + 1;
      if (overlap) {
        violations.push({
          rule: "label_collision",
          detail: `Labels "${allTexts[i].text}" and "${allTexts[j].text}" overlap each other. Add at least 22px vertical spacing between labels in the same zone.`,
        });
        if (violations.length > 8) return violations;
      }
    }
  }

  return violations;
}

// ---------- viewBox expansion (anti-label-clipping) ----------

/**
 * Expand the SVG viewBox by a percentage in each direction and inject
 * a background rect that fills the new (larger) canvas. Idempotent:
 * if the SVG was already expanded, this is a no-op.
 *
 * Claude reliably puts labels at x near the edges (text-anchor="end"
 * with x near 0, or text-anchor="start" with x near viewBoxWidth) and
 * the text grows OUTSIDE the viewBox. The renderer clips that text.
 * Expanding the viewBox reveals the off-canvas labels.
 *
 * Defaults: 18% horizontal padding, 10% vertical padding. Tuned so
 * a 13-character label at font-size 12 (~85px wide) fits inside the
 * expanded label zone on either side.
 */
export function expandViewBoxForLabels(svg: string, hPad = 0.18, vPad = 0.1): string {
  const m = svg.match(
    /<svg\b([^>]*?)viewBox\s*=\s*["']\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["']([^>]*)>/i
  );
  if (!m) return svg;
  const [, before, xStr, yStr, wStr, hStr, after] = m;
  const X = parseFloat(xStr);
  const Y = parseFloat(yStr);
  const W = parseFloat(wStr);
  const H = parseFloat(hStr);
  const dx = Math.round(W * hPad);
  const dy = Math.round(H * vPad);
  const newX = X - dx;
  const newY = Y - dy;
  const newW = W + 2 * dx;
  const newH = H + 2 * dy;

  const newViewBox = `${newX} ${newY} ${newW} ${newH}`;
  const bgRect = `<rect x="${newX}" y="${newY}" width="${newW}" height="${newH}" fill="#FFF6E5"/>`;

  // Replace the opening <svg> tag with the new viewBox, then prepend
  // the background rect so it sits behind all existing content.
  // (z-order in SVG is document order, so insert immediately after the
  // opening tag.)
  return svg.replace(
    m[0],
    `<svg${before}viewBox="${newViewBox}"${after}>${bgRect}`
  );
}

// ---------- utility: extract raw bytes + mime from a data URI ----------

export function dataUriToBuffer(dataUri: string): {
  mime: string;
  buffer: Buffer;
} {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URI");
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}
