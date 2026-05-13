// LabBuddy — Main Express server entry point

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findEnvFile(): string {
  const candidates = [
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../../../.env"),
  ];
  try {
    candidates.push(path.resolve(process.cwd(), ".env"));
  } catch {
    // cwd may not be accessible
  }
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      continue;
    }
  }
  return candidates[0];
}

try {
  const envContent = fs.readFileSync(findEnvFile(), "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env file is optional
}

import multer from "multer";
import { chatRouter } from "./chat-handler.js";
import { syllabusRouter } from "./syllabus-handler.js";
import { diyRouter } from "./diy-handler.js";
import { gamificationRouter } from "./gamification-handler.js";
import { notebookRouter } from "./notebook-handler.js";
import { parentRouter } from "./parent-handler.js";
import { billingRouter } from "./billing-handler.js";
import { mysteryRouter } from "./mystery-handler.js";
import { imageRouter } from "./image-handler.js";
import { mockLabRouter } from "./mock-lab-handler.js";
import { initDb } from "./db.js";
import { getMessagesBySession } from "./repositories/message-repo.js";
import {
  chatBurstLimiter,
  chatHourlyLimiter,
  chatDailyLimiter,
  heavyAiLimiter,
  heavyAiDailyLimiter,
  authLimiter,
  generalLimiter,
} from "./rate-limit.js";

// ---------- multer config ----------

const UPLOAD_DIR = "/tmp/labbuddy-uploads";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".txt", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(", ")}`));
    }
  },
});

// ---------- init ----------

const app = express();
const PORT = parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? "3001", 10);

// ---------- middleware ----------

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000",
  }),
);
app.use(express.json());

// trust proxy (for accurate req.ip behind load balancers / Vite proxy)
app.set("trust proxy", 1);

// ---------- routes ----------

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// General app-wide limiter (very generous; protects against accidental abuse)
app.use("/api", generalLimiter);

// Auth lives in Supabase now — no signup/login routes here. The authLimiter
// stays available for future auth-sensitive endpoints if we add any.
void authLimiter;

// Chat — apply burst + hourly + daily limits in series
app.use("/api/chat", chatBurstLimiter, chatHourlyLimiter, chatDailyLimiter, chatRouter);

// Heavy AI endpoints (syllabus parsing, DIY guide generation)
app.use(
  "/api/syllabus",
  heavyAiLimiter,
  heavyAiDailyLimiter,
  upload.single("syllabus"),
  syllabusRouter
);
app.use("/api/diy", heavyAiLimiter, heavyAiDailyLimiter, diyRouter);

// Mock lab — no AI, no DB, returns the same curated curriculum every time.
app.use("/api/mock-lab", mockLabRouter);

app.use("/api/gamification", gamificationRouter);
app.use("/api/notebook", notebookRouter);
app.use("/api/parent", parentRouter);
app.use("/api/billing", billingRouter);
app.use("/api/mysteries", mysteryRouter);
// Image generation is expensive (LLM call) → gate the resolve endpoints.
// /render/:filename serves bytes from disk → no gate, cheap.
app.use("/api/images/resolve", heavyAiLimiter, heavyAiDailyLimiter);
app.use("/api/images", imageRouter);

// Chat history endpoint
app.get("/api/sessions/:sessionId/messages", (req, res) => {
  try {
    const messages = getMessagesBySession(req.params.sessionId);
    res.json({ messages });
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Failed to fetch messages." });
  }
});

// ---------- static client (production) ----------
//
// When building the docker image we copy the Vite client bundle to
// /app/client-dist. Serve it from the same Express server so we deploy
// a single container.
if (process.env.NODE_ENV === "production") {
  const candidates = [
    path.resolve(__dirname, "../../client-dist"),
    path.resolve(__dirname, "../../../client/dist"),
  ];
  const clientDist = candidates.find((p) => fs.existsSync(p));
  if (clientDist) {
    console.log(`[server] serving client bundle from ${clientDist}`);
    app.use(express.static(clientDist));
    // SPA fallback — anything non-/api routes to index.html
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    console.warn("[server] no client bundle found; running API-only");
  }
}

// ---------- startup ----------

// Initialize database before starting the server
initDb();

app.listen(PORT, () => {
  console.log(`LabBuddy server listening on http://localhost:${PORT}`);
});

export default app;
