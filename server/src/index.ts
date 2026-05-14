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
  getLatestSessionByParent,
  listSessionsByParent,
} from "./repositories/session-repo.js";
import { requireParentAuth, type AuthRequest } from "./auth-middleware.js";
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

// ---------- crash safety ----------
//
// Node 22 kills the process on any unhandled promise rejection. Catch them
// at the top level so a fire-and-forget API call (rate-limit, image cache,
// supabase background) doesn't take down the entire service.
process.on("unhandledRejection", (reason, _promise) => {
  console.error(
    "[server] UnhandledRejection:",
    reason instanceof Error
      ? `${reason.message}\n${reason.stack}`
      : JSON.stringify(reason, Object.getOwnPropertyNames(reason as object), 2),
  );
});
process.on("uncaughtException", (err) => {
  console.error("[server] UncaughtException:", err.message, err.stack);
});

// ---------- init ----------

const app = express();
// PORT first — Railway sets this and routes public traffic to it. SERVER_PORT
// is only a local-dev convenience (to coexist with another app on :3001).
const PORT = parseInt(process.env.PORT ?? process.env.SERVER_PORT ?? "3001", 10);

// ---------- middleware ----------

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000",
  }),
);
app.use(express.json());

// trust proxy (for accurate req.ip behind load balancers / Vite proxy)
app.set("trust proxy", 1);

// ---------- health check (before DB init so Railway can verify the process started) ----------

let dbReady = false;

app.get("/api/health", (_req, res) => {
  res.json({
    status: dbReady ? "ok" : "starting",
    db: dbReady,
    timestamp: new Date().toISOString(),
  });
});

// ---------- startup ----------
//
// Start listening IMMEDIATELY so health checks pass, then initialize DB.
// Routes that need the DB will fail gracefully until dbReady = true.

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);

  // Initialize database after server is listening
  try {
    initDb();
    dbReady = true;
    console.log(`[server] database initialized, fully ready`);
  } catch (err) {
    console.error("[server] FATAL: database initialization failed:", err);
    process.exit(1);
  }
});

// ---------- static client (production) ----------
//
// When building the docker image we copy the Vite client bundle to
// /app/client-dist. Serve it from the same Express server so we deploy
// a single container.
//
// IMPORTANT: Static middleware must be registered BEFORE API routes so that
// static assets (JS, CSS, images) are served directly without hitting the API limiter.

// Always look for a built client bundle — don't gate on NODE_ENV, since
// Railway containers don't always pass it through cleanly. If the bundle is
// there, serve it; otherwise fall through to a helpful 503.
console.log(`[server] NODE_ENV = ${JSON.stringify(process.env.NODE_ENV)}`);
console.log(`[server] __dirname = ${__dirname}`);

const candidates = [
  "/app/client-dist", // Docker container path
  path.resolve(__dirname, "../../../../client-dist"), // relative from dist/server/src/
  path.resolve(__dirname, "../../../client/dist"),
];
console.log(`[server] looking for client bundle in:`, candidates);

const clientDist: string | undefined = candidates.find((p) => {
  const exists = fs.existsSync(p);
  console.log(`[server]   ${p} -> ${exists ? "FOUND" : "not found"}`);
  return exists;
});

if (clientDist) {
  const files = fs.readdirSync(clientDist);
  console.log(`[server] serving client bundle from ${clientDist}, files:`, files.slice(0, 20));
  app.use(express.static(clientDist));
} else {
  console.warn("[server] no client bundle found; running API-only");
}

// ---------- routes ----------

// General app-wide limiter (very generous; protects against accidental abuse)
app.use("/api", generalLimiter);

// Auth lives in Supabase now — no signup/login routes here. The authLimiter
// stays available for future auth-sensitive endpoints if we add any.
void authLimiter;

// Auth-gate every expensive / kid-facing route. requireParentAuth verifies
// the Supabase JWT bearer token and 401s otherwise. The mock-lab and image
// /render endpoints stay open (no AI cost, cached files only).
//
// Chat — apply burst + hourly + daily limits in series
app.use("/api/chat", requireParentAuth, chatBurstLimiter, chatHourlyLimiter, chatDailyLimiter, chatRouter);

// Heavy AI endpoints (syllabus parsing, DIY guide generation)
app.use(
  "/api/syllabus",
  requireParentAuth,
  heavyAiLimiter,
  heavyAiDailyLimiter,
  upload.single("syllabus"),
  syllabusRouter
);
app.use("/api/diy", requireParentAuth, heavyAiLimiter, heavyAiDailyLimiter, diyRouter);

// Mock lab — no AI, no DB, returns the same curated curriculum every time.
// Deliberately UNGATED so the marketing landing page can preview it.
app.use("/api/mock-lab", mockLabRouter);

app.use("/api/gamification", requireParentAuth, gamificationRouter);
app.use("/api/notebook", requireParentAuth, notebookRouter);
app.use("/api/parent", parentRouter); // routes inside set their own auth
app.use("/api/billing", billingRouter); // routes inside set their own auth
app.use("/api/mysteries", requireParentAuth, mysteryRouter);
// Image generation is expensive (LLM call) → gate the resolve endpoints.
// /render/:filename serves bytes from disk → no gate, cheap.
app.use("/api/images/resolve", requireParentAuth, heavyAiLimiter, heavyAiDailyLimiter);
app.use("/api/images", imageRouter);

// Latest session for the authenticated parent. Returns { session: null }
// when the user has no prior sessions yet (first login).
app.get("/api/sessions/mine", requireParentAuth, (req: AuthRequest, res) => {
  try {
    const session = getLatestSessionByParent(req.parentId!);
    res.json({ session: session ?? null });
  } catch (err) {
    console.error("Error fetching latest session:", err);
    res.status(500).json({ error: "Failed to fetch session." });
  }
});

// Full session list for the parent — for a future history sidebar.
app.get("/api/sessions", requireParentAuth, (req: AuthRequest, res) => {
  try {
    const sessions = listSessionsByParent(req.parentId!);
    res.json({ sessions });
  } catch (err) {
    console.error("Error listing sessions:", err);
    res.status(500).json({ error: "Failed to list sessions." });
  }
});

// Chat history endpoint
app.get("/api/sessions/:sessionId/messages", requireParentAuth, (req, res) => {
  try {
    const messages = getMessagesBySession(req.params.sessionId);
    res.json({ messages });
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Failed to fetch messages." });
  }
});

// SPA fallback — anything non-/api routes to index.html (must be AFTER API routes)
if (clientDist) {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist!, "index.html"));
  });
} else {
  // No client bundle found — surface a clear error instead of Express's 404.
  app.get("*", (_req, res) => {
    res.status(503).send(`
      <html>
        <body style="font-family: system-ui; padding: 2rem;">
          <h1>LabBuddy API Server</h1>
          <p>The client bundle was not found. The API is running at <code>/api/*</code>.</p>
          <p>Check the build logs to ensure the client built successfully.</p>
        </body>
      </html>
    `);
  });
}

export default app;
