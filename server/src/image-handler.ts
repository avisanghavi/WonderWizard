// LabBuddy — Image rendering endpoints
//
// Two roles:
//   1. POST /api/images/resolve  — given { description, style, aspect },
//      returns a stable URL the client can <img src> against. Lazy: only
//      generates if not in cache.
//
//   2. GET /api/images/render/:filename — serves a cached image file.
//      Filename must match the strict <hash>.{png,svg} pattern.
//
// The serve path is the URL that ends up in <img src=...> across the app
// and gets aggressively cached by the browser.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  resolveSchematic,
  readCachedFile,
  hashKey,
  getCached,
  cacheStats,
} from "./image-cache.js";

export const imageRouter = Router();

// ---------- POST /resolve ----------

const resolveSchema = z.object({
  description: z.string().min(3).max(800),
  style: z
    .enum([
      "schematic",
      "cross-section",
      "exploded",
      "process",
      "comparison",
      "illustration",
    ])
    .optional(),
  aspect: z.enum(["landscape", "portrait", "square"]).optional(),
  /**
   * Run the two-stage pipeline: generate SVG blueprint, rasterize, polish
   * with Recraft image-to-image. SVG keeps correctness, image adds warmth.
   * Cached independently from the un-polished version.
   */
  polish: z.boolean().optional(),
});

imageRouter.post("/resolve", async (req: Request, res: Response) => {
  try {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation",
        message: "description (3-800 chars) required; style/aspect optional",
      });
      return;
    }
    const entry = await resolveSchematic(parsed.data);
    res.json({
      url: entry.url,
      hash: entry.hash,
      provider: entry.provider,
      costEstimate: entry.costEstimate,
    });
  } catch (err) {
    console.error("[image-handler] /resolve failed:", err);
    res.status(500).json({ error: "internal" });
  }
});

// ---------- GET /resolve  ----------
//
// Convenience GET variant so that <img src> can call this directly without
// a POST + indirection. Browser caching kicks in naturally because the URL
// is deterministic in the query params.

imageRouter.get("/resolve", async (req: Request, res: Response) => {
  try {
    const polishRaw = req.query.polish ?? req.query.p;
    const polishFlag =
      typeof polishRaw === "string" &&
      (polishRaw === "1" || polishRaw.toLowerCase() === "true");
    const parsed = resolveSchema.safeParse({
      description: req.query.d ?? req.query.description,
      style: req.query.s ?? req.query.style,
      aspect: req.query.a ?? req.query.aspect,
      polish: polishFlag,
    });
    if (!parsed.success) {
      res.status(400).json({ error: "validation" });
      return;
    }
    // Try cache first (avoid generating if hot)
    const hash = hashKey(parsed.data);
    let entry = getCached(hash);
    if (!entry) {
      entry = await resolveSchematic(parsed.data);
    }
    // 302 to the canonical static URL. Browser caches the redirect target.
    res.redirect(302, entry.url);
  } catch (err) {
    console.error("[image-handler] GET /resolve failed:", err);
    res.status(500).json({ error: "internal" });
  }
});

// ---------- GET /stock/:filename ----------
// Serves a hand-curated stock supply image (e.g. rubber-band.png).

imageRouter.get("/stock/:filename", async (req: Request, res: Response) => {
  const { readStockFile } = await import("./stock-images.js");
  const file = readStockFile(req.params.filename);
  if (!file) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.setHeader("Content-Type", file.mime);
  // Stock files can be updated by the operator, so allow validation reuse but
  // not aggressive caching.
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(file.buffer);
});

// ---------- GET /render/:filename ----------

imageRouter.get("/render/:filename", (req: Request, res: Response) => {
  const filename = req.params.filename;
  const file = readCachedFile(filename);
  if (!file) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.setHeader("Content-Type", file.mime);
  // Immutable + long-lived: the URL contains a content hash
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(file.buffer);
});

// ---------- GET /stats (diagnostics) ----------

imageRouter.get("/stats", (_req: Request, res: Response) => {
  res.json(cacheStats());
});
