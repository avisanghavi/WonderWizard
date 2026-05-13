// LabBuddy — Lab Notebook handler
// CRUD endpoints for notebook entries and photo upload/serving.

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { z } from "zod";

import {
  createEntry,
  getEntry,
  getEntriesByChild,
  updateEntry,
  deleteEntry,
} from "./repositories/notebook-repo.js";
import type { NotebookEntry } from "../../shared/types.js";

// ---------- paths ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/data/notebook-photos — resolve relative to this file
// (server/src/notebook-handler.ts -> server/data/notebook-photos)
const PHOTOS_DIR = path.resolve(__dirname, "../data/notebook-photos");
const TMP_UPLOAD_DIR = "/tmp/labbuddy-notebook-photos";

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(TMP_UPLOAD_DIR);
ensureDir(PHOTOS_DIR);

// ---------- multer config ----------

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const photoUpload = multer({
  dest: TMP_UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPG, PNG, WebP`));
    }
  },
});

// ---------- Zod schemas ----------

const ratingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const createEntrySchema = z.object({
  childId: z.string().min(1),
  experimentTitle: z.string().min(1),
  experimentCategory: z.string().min(1),
  observation: z.string().min(1),
  hypothesis: z.string().optional(),
  conclusion: z.string().optional(),
  reflectionAnswers: z.record(z.string(), z.string()).optional(),
  rating: ratingSchema.optional(),
});

const updateEntrySchema = z.object({
  experimentTitle: z.string().min(1).optional(),
  experimentCategory: z.string().min(1).optional(),
  observation: z.string().min(1).optional(),
  hypothesis: z.string().optional(),
  conclusion: z.string().optional(),
  reflectionAnswers: z.record(z.string(), z.string()).optional(),
  rating: ratingSchema.optional(),
  photoUrls: z.array(z.string()).optional(),
});

// ---------- helpers ----------

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore cleanup errors
  }
}

function sanitizeSegment(segment: string): string {
  // Prevent path traversal — only allow safe filename characters
  return segment.replace(/[^a-zA-Z0-9._-]/g, "");
}

// ---------- router ----------

export const notebookRouter = Router();

// POST /api/notebook — create a new entry
notebookRouter.post("/", (req: Request, res: Response) => {
  const parsed = createEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  try {
    const entry = createEntry({
      childId: parsed.data.childId,
      experimentTitle: parsed.data.experimentTitle,
      experimentCategory: parsed.data.experimentCategory,
      observation: parsed.data.observation,
      hypothesis: parsed.data.hypothesis,
      conclusion: parsed.data.conclusion,
      photoUrls: [],
      reflectionAnswers: parsed.data.reflectionAnswers,
      rating: parsed.data.rating,
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error("Create notebook entry error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to create entry.",
    });
  }
});

// GET /api/notebook/photos/:childId/:filename — serve a photo
// Declared BEFORE /:childId so Express matches it first.
notebookRouter.get("/photos/:childId/:filename", (req: Request, res: Response) => {
  const childId = sanitizeSegment(req.params.childId);
  const filename = sanitizeSegment(req.params.filename);
  if (!childId || !filename) {
    res.status(400).json({ error: "Invalid path." });
    return;
  }

  const filePath = path.join(PHOTOS_DIR, childId, filename);
  // Ensure resolved path is still inside PHOTOS_DIR
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PHOTOS_DIR) + path.sep)) {
    res.status(400).json({ error: "Invalid path." });
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: "Photo not found." });
    return;
  }

  res.sendFile(resolved);
});

// GET /api/notebook/entry/:id — single entry detail
notebookRouter.get("/entry/:id", (req: Request, res: Response) => {
  const entry = getEntry(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Entry not found." });
    return;
  }
  res.json(entry);
});

// PATCH /api/notebook/entry/:id — update an entry
notebookRouter.patch("/entry/:id", (req: Request, res: Response) => {
  const parsed = updateEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const updates: Partial<NotebookEntry> = { ...parsed.data };
  const updated = updateEntry(req.params.id, updates);
  if (!updated) {
    res.status(404).json({ error: "Entry not found." });
    return;
  }
  res.json(updated);
});

// DELETE /api/notebook/entry/:id — remove an entry
notebookRouter.delete("/entry/:id", (req: Request, res: Response) => {
  const existing = getEntry(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Entry not found." });
    return;
  }
  const ok = deleteEntry(req.params.id);
  if (!ok) {
    res.status(500).json({ error: "Failed to delete entry." });
    return;
  }
  res.json({ success: true });
});

// POST /api/notebook/entry/:id/photo — upload a photo for an entry
notebookRouter.post(
  "/entry/:id/photo",
  photoUpload.single("photo"),
  (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded. Use field name 'photo'." });
      return;
    }

    const entry = getEntry(req.params.id);
    if (!entry) {
      safeUnlink(file.path);
      res.status(404).json({ error: "Entry not found." });
      return;
    }

    const ext = ALLOWED_EXTENSIONS[file.mimetype];
    if (!ext) {
      safeUnlink(file.path);
      res.status(400).json({ error: "Unsupported file type." });
      return;
    }

    try {
      const childId = sanitizeSegment(entry.childId);
      if (!childId) {
        safeUnlink(file.path);
        res.status(400).json({ error: "Invalid childId on entry." });
        return;
      }

      const childDir = path.join(PHOTOS_DIR, childId);
      ensureDir(childDir);

      const filename = `${randomUUID()}${ext}`;
      const destPath = path.join(childDir, filename);

      // Move the temp upload into place
      fs.renameSync(file.path, destPath);

      const publicUrl = `/api/notebook/photos/${childId}/${filename}`;
      const newPhotoUrls = [...entry.photoUrls, publicUrl];

      const updated = updateEntry(entry.id, { photoUrls: newPhotoUrls });
      if (!updated) {
        // Clean up the saved file if DB update failed
        safeUnlink(destPath);
        res.status(500).json({ error: "Failed to attach photo to entry." });
        return;
      }

      res.status(201).json({ url: publicUrl, entry: updated });
    } catch (err) {
      console.error("Photo upload error:", err);
      safeUnlink(file.path);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to upload photo.",
      });
    }
  },
);

// GET /api/notebook/:childId — list entries for a child
notebookRouter.get("/:childId", (req: Request, res: Response) => {
  const childId = req.params.childId;
  const limitRaw = req.query.limit;
  const offsetRaw = req.query.offset;

  const limit =
    typeof limitRaw === "string" && /^\d+$/.test(limitRaw)
      ? Math.min(500, Math.max(1, parseInt(limitRaw, 10)))
      : 50;
  const offset =
    typeof offsetRaw === "string" && /^\d+$/.test(offsetRaw)
      ? Math.max(0, parseInt(offsetRaw, 10))
      : 0;

  const entries = getEntriesByChild(childId, limit, offset);
  res.json({ entries, limit, offset });
});
