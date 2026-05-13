// LabBuddy — Disk cache for generated schematics.
//
// Image gen is expensive (~$0.04/call with Recraft, ~$0.005 with Claude-SVG)
// and slow (3-15s). We cache aggressively keyed by SHA256 of the inputs.
// Same prompt + style + aspect → same cache hit forever.
//
// Layout:
//   data/image-cache/
//     <hash>.png    OR    <hash>.svg
//     <hash>.json         metadata (provider, mime, costEstimate, created)
//
// The hash is taken over the full input set so any change (description,
// style, aspect) yields a different file. We pre-hash before calling the
// generator so the same key can be reused as a stable URL.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { DiagramStyle } from "../../shared/types.js";
import {
  generateSchematic,
  dataUriToBuffer,
  type GenerateResult,
} from "./image-gen.js";

// ---------- paths ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.resolve(__dirname, "../../data/image-cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ---------- public API ----------

export interface CacheKey {
  description: string;
  style?: DiagramStyle;
  aspect?: "landscape" | "portrait" | "square";
  /** Two-stage polish pipeline (SVG → rasterize → img2img). */
  polish?: boolean;
}

export interface CacheEntry {
  hash: string;
  mime: string;
  ext: "png" | "svg";
  provider: GenerateResult["provider"];
  costEstimate: number;
  filePath: string;
  /** Public URL the client can hit */
  url: string;
  createdAt: number;
}

/**
 * Compute the cache key. Stable across server restarts.
 * Same inputs ⇒ same hash ⇒ same file. Polish flag is part of the key
 * so a blueprint and a polished version are cached independently.
 */
export function hashKey(key: CacheKey): string {
  const normalized = JSON.stringify({
    description: key.description.trim().toLowerCase(),
    style: key.style ?? "schematic",
    aspect: key.aspect ?? "landscape",
    polish: key.polish ? 1 : 0,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

/**
 * Read an entry from cache if present. Returns null if not cached.
 */
export function getCached(hash: string): CacheEntry | null {
  // Try png first, then svg
  for (const ext of ["png", "svg"] as const) {
    const filePath = path.join(CACHE_DIR, `${hash}.${ext}`);
    const metaPath = path.join(CACHE_DIR, `${hash}.json`);
    if (!fs.existsSync(filePath) || !fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
        mime: string;
        provider: GenerateResult["provider"];
        costEstimate: number;
        createdAt: number;
      };
      return {
        hash,
        mime: meta.mime,
        ext,
        provider: meta.provider,
        costEstimate: meta.costEstimate,
        filePath,
        url: `/api/images/render/${hash}.${ext}`,
        createdAt: meta.createdAt,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Resolve a schematic — return cached if present, otherwise generate and
 * cache. Always returns a CacheEntry with a public URL.
 *
 * This is the function callers should use 99% of the time. Aggressively
 * cached, idempotent, never throws (the underlying generator falls back
 * to a placeholder on total failure).
 */
export async function resolveSchematic(key: CacheKey): Promise<CacheEntry> {
  const hash = hashKey(key);
  const existing = getCached(hash);
  if (existing) return existing;

  const result = await generateSchematic({
    description: key.description,
    style: key.style,
    aspect: key.aspect,
    polish: key.polish,
  });

  return writeToCache(hash, result);
}

function writeToCache(hash: string, result: GenerateResult): CacheEntry {
  const { mime, buffer } = dataUriToBuffer(result.dataUri);
  const ext: "png" | "svg" = mime === "image/svg+xml" ? "svg" : "png";
  const filePath = path.join(CACHE_DIR, `${hash}.${ext}`);
  const metaPath = path.join(CACHE_DIR, `${hash}.json`);

  fs.writeFileSync(filePath, buffer);
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        mime,
        provider: result.provider,
        costEstimate: result.costEstimate ?? 0,
        createdAt: Date.now(),
      },
      null,
      2
    )
  );

  return {
    hash,
    mime,
    ext,
    provider: result.provider,
    costEstimate: result.costEstimate ?? 0,
    filePath,
    url: `/api/images/render/${hash}.${ext}`,
    createdAt: Date.now(),
  };
}

/**
 * Look up the cached file by its public hash + ext. Used by the
 * /api/images/render/:filename route.
 */
export function readCachedFile(filename: string): {
  buffer: Buffer;
  mime: string;
} | null {
  // Strict whitelist: 24-char hex hash, .png or .svg
  if (!/^[a-f0-9]{24}\.(png|svg)$/i.test(filename)) return null;
  const filePath = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  const mime = filename.endsWith(".png") ? "image/png" : "image/svg+xml";
  return { buffer, mime };
}

/** Diagnostics — count + total size of cached images. */
export function cacheStats(): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (f.endsWith(".png") || f.endsWith(".svg")) {
      count++;
      bytes += fs.statSync(path.join(CACHE_DIR, f)).size;
    }
  }
  return { count, bytes };
}
