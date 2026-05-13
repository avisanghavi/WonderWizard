// LabBuddy — Syllabus upload and parsing handler
// Accepts syllabus files, sends them to Claude for structured parsing,
// and stores parsed curricula in the database.

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ParsedSyllabus,
  SyllabusUnit,
  SyllabusUploadResponse,
} from "../../shared/types.js";

// ---------- Claude client (shared pattern from ai-copilot) ----------

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (anthropicClient) return anthropicClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  anthropicClient = new Anthropic({ apiKey: key });
  return anthropicClient;
}

const MODEL = "claude-sonnet-4-20250514";

// ---------- repository imports ----------

import { getSession, getOrCreateSession, updateSession } from "./repositories/session-repo.js";
import { saveSyllabus, getSyllabiBySession, deleteSyllabus } from "./repositories/syllabus-repo.js";

// ---------- syllabus parsing prompt ----------

const SYLLABUS_PARSE_PROMPT = `You are a curriculum parser. Analyze the provided syllabus/curriculum document and extract structured information.

Return ONLY valid JSON matching this exact structure (no markdown, no code fences, just raw JSON):

{
  "subject": "string — e.g. Biology, Algebra 1, 8th Grade Science",
  "gradeLevel": "string — e.g. 8th Grade, AP, K-2",
  "teacher": "string or null — teacher name if visible",
  "school": "string or null — school name if visible",
  "units": [
    {
      "unitNumber": 1,
      "title": "string — unit or chapter title",
      "topics": ["topic1", "topic2"],
      "standards": ["NGSS MS-LS1-1", "etc"] or [],
      "timeframe": "string or null — e.g. Weeks 3-4, October",
      "keyVocabulary": ["word1", "word2"] or [],
      "mysteryQuestion": "string — REFRAME this unit as a single irresistible question a kid would actually want to know the answer to. NOT 'Forces and Motion' but 'Why don't I feel the Earth spinning at 1,000 mph right now?'. NOT 'Cell Biology' but 'How does my body know to grow my hair longer but not my fingers?'. The question must be genuinely curious, slightly weird, and use first-person 'I' or 'my' when natural.",
      "mysteryHook": "string — a 1-sentence teaser that makes the kid lean in. Should hint at something surprising without giving the answer."
    }
  ],
  "rawSummary": "string — a plain-text 2-3 paragraph summary of the entire syllabus, covering scope, progression, and key themes",
  "suggestedActivities": [
    "Build a model of a cell from Unit 3",
    "Hands-on fractions activity for Chapter 5",
    "... 5-6 total activity prompts that connect to specific units in the curriculum"
  ]
}

Guidelines:
- Extract ALL units/chapters you can identify
- If standards codes are mentioned (NGSS, Common Core, etc.), include them
- If timeframes are mentioned, include them
- For suggestedActivities, generate 5-6 hands-on activity ideas that directly reference specific units/topics from the syllabus. Make them creative and age-appropriate.
- If information is not present in the document, use null or empty arrays — do NOT invent data
- The rawSummary should be helpful for a parent to understand what their child is learning
- mysteryQuestion is REQUIRED for every unit. Make each one a question a kid would actually screenshot and send to a friend. Avoid school-y phrasing. Aim for the "wait, WHAT?" reaction.
- mysteryHook is REQUIRED — keep it under 15 words and make it tantalizing.`;

// ---------- file handling helpers ----------

type SupportedMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "text/plain"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MIME_MAP: Record<string, SupportedMimeType> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".txt": "text/plain",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function getSupportedMimeType(filename: string): SupportedMimeType | null {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] ?? null;
}

// ---------- Claude parsing call ----------

async function parseSyllabusWithClaude(
  filePath: string,
  originalName: string,
): Promise<{ parsed: Omit<ParsedSyllabus, "id" | "uploadedAt">; suggestedActivities: string[] }> {
  const client = getClient();
  if (!client) {
    // Demo/fallback when no API key is set
    return getDemoParsedSyllabus();
  }

  const mimeType = getSupportedMimeType(originalName);
  if (!mimeType) {
    throw new Error(`Unsupported file type: ${path.extname(originalName)}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString("base64");

  // Build the message content depending on file type
  const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  if (mimeType === "text/plain") {
    // For text files, send content directly
    const textContent = fileBuffer.toString("utf-8");
    userContent.push({
      type: "text",
      text: `Here is a syllabus document (plain text):\n\n${textContent}\n\nParse this syllabus according to the instructions.`,
    });
  } else if (mimeType === "image/jpeg" || mimeType === "image/png") {
    // For images, use vision
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType,
        data: base64Data,
      },
    });
    userContent.push({
      type: "text",
      text: "This is a photo/scan of a syllabus document. Parse it according to the instructions.",
    });
  } else if (mimeType === "application/pdf") {
    // For PDFs, send as document
    userContent.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64Data,
      },
    });
    userContent.push({
      type: "text",
      text: "This is a syllabus PDF. Parse it according to the instructions.",
    });
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    // For docx, extract readable text (basic approach — read raw XML text from the zip)
    // Since we can't easily parse docx without a library, we send the base64 and let Claude try,
    // or we do a basic text extraction
    const textContent = extractBasicDocxText(fileBuffer);
    userContent.push({
      type: "text",
      text: `Here is a syllabus document (extracted from .docx):\n\n${textContent}\n\nParse this syllabus according to the instructions.`,
    });
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYLLABUS_PARSE_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return parseSyllabusJSON(rawText);
  } catch (err) {
    console.error("Claude syllabus parsing error:", err);
    throw new Error("Failed to parse syllabus with AI. Please try again.");
  }
}

// ---------- basic docx text extraction ----------

function extractBasicDocxText(buffer: Buffer): string {
  // A .docx is a ZIP file. The main content is in word/document.xml.
  // We do a very basic extraction by finding XML text nodes.
  // This won't handle complex formatting but gets readable text.
  try {
    const content = buffer.toString("binary");
    // Look for the word/document.xml content within the zip
    // Extract text between XML tags using a simple regex
    const textParts: string[] = [];
    const xmlMatch = content.match(/word\/document\.xml[\s\S]*?<w:body>([\s\S]*?)<\/w:body>/);
    if (xmlMatch) {
      const body = xmlMatch[1];
      // Extract text runs
      const textRuns = body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
      if (textRuns) {
        for (const run of textRuns) {
          const text = run.replace(/<[^>]+>/g, "");
          textParts.push(text);
        }
      }
    }

    if (textParts.length === 0) {
      // Fallback: just extract anything that looks like readable text
      const allText = content.replace(/<[^>]+>/g, " ").replace(/[^\x20-\x7E\n\r\t]/g, " ");
      return allText.replace(/\s+/g, " ").trim().slice(0, 10000);
    }

    return textParts.join(" ");
  } catch {
    return "[Could not extract text from .docx file]";
  }
}

// ---------- JSON parser ----------

function parseSyllabusJSON(raw: string): {
  parsed: Omit<ParsedSyllabus, "id" | "uploadedAt">;
  suggestedActivities: string[];
} {
  const trimmed = raw.trim();

  // Try to extract JSON from code fences first
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const data = JSON.parse(jsonStr);

  // Validate and extract
  const units: SyllabusUnit[] = (data.units ?? []).map((u: Record<string, unknown>, i: number) => ({
    unitNumber: typeof u.unitNumber === "number" ? u.unitNumber : i + 1,
    title: String(u.title ?? `Unit ${i + 1}`),
    topics: Array.isArray(u.topics) ? u.topics.map(String) : [],
    standards: Array.isArray(u.standards) ? u.standards.map(String) : undefined,
    timeframe: typeof u.timeframe === "string" ? u.timeframe : undefined,
    keyVocabulary: Array.isArray(u.keyVocabulary) ? u.keyVocabulary.map(String) : undefined,
    mysteryQuestion: typeof u.mysteryQuestion === "string" ? u.mysteryQuestion : undefined,
    mysteryHook: typeof u.mysteryHook === "string" ? u.mysteryHook : undefined,
  }));

  const parsed = {
    subject: String(data.subject ?? "Unknown Subject"),
    gradeLevel: String(data.gradeLevel ?? "Unknown"),
    teacher: typeof data.teacher === "string" ? data.teacher : undefined,
    school: typeof data.school === "string" ? data.school : undefined,
    units,
    rawSummary: String(data.rawSummary ?? ""),
  };

  const suggestedActivities: string[] = Array.isArray(data.suggestedActivities)
    ? data.suggestedActivities.map(String)
    : [
        "Explore the first topic with a hands-on activity",
        "Create a visual study guide for the key vocabulary",
        "Design an experiment related to the main theme",
        "Build a model that demonstrates a core concept",
        "Write a creative story connecting multiple units",
      ];

  return { parsed, suggestedActivities };
}

// ---------- demo fallback ----------

function getDemoParsedSyllabus(): {
  parsed: Omit<ParsedSyllabus, "id" | "uploadedAt">;
  suggestedActivities: string[];
} {
  return {
    parsed: {
      subject: "8th Grade Science",
      gradeLevel: "8th Grade",
      teacher: "Ms. Johnson",
      school: "Demo Middle School",
      units: [
        {
          unitNumber: 1,
          title: "Matter and Its Interactions",
          topics: ["Atomic structure", "Chemical reactions", "Conservation of mass"],
          standards: ["MS-PS1-1", "MS-PS1-2"],
          timeframe: "Weeks 1-4",
          keyVocabulary: ["atom", "molecule", "chemical reaction", "conservation"],
          mysteryQuestion: "If matter is mostly empty space, why doesn't my hand go through this table?",
          mysteryHook: "Spoiler: the answer involves invisible bouncers smaller than atoms.",
        },
        {
          unitNumber: 2,
          title: "Forces and Motion",
          topics: ["Newton's Laws", "Gravity", "Friction"],
          standards: ["MS-PS2-1", "MS-PS2-2"],
          timeframe: "Weeks 5-8",
          keyVocabulary: ["force", "acceleration", "inertia", "friction"],
          mysteryQuestion: "Why don't I feel the Earth spinning at 1,000 mph right now?",
          mysteryHook: "We're all on a giant ball flying through space — and somehow nobody's getting motion sickness.",
        },
        {
          unitNumber: 3,
          title: "Energy",
          topics: ["Kinetic and potential energy", "Energy transfer", "Heat"],
          standards: ["MS-PS3-1", "MS-PS3-2"],
          timeframe: "Weeks 9-12",
          keyVocabulary: ["kinetic energy", "potential energy", "thermal energy"],
          mysteryQuestion: "Why does rubbing my hands together make them warm — but rubbing two ice cubes doesn't?",
          mysteryHook: "There's a hidden ingredient your hands have that ice doesn't.",
        },
      ],
      rawSummary:
        "This 8th grade science curriculum covers physical science fundamentals including matter, forces, and energy. Students will explore atomic structure, chemical reactions, Newton's Laws of Motion, and energy transformations through hands-on labs and investigations.",
    },
    suggestedActivities: [
      "Build molecular models with toothpicks and marshmallows (Unit 1: Atomic Structure)",
      "Design a balloon-powered car to explore Newton's Third Law (Unit 2: Forces and Motion)",
      "Create a Rube Goldberg machine to demonstrate energy transfer (Unit 3: Energy)",
      "Mix baking soda and vinegar to observe conservation of mass (Unit 1: Chemical Reactions)",
      "Build a friction ramp to test different surfaces (Unit 2: Friction)",
      "Construct a simple calorimeter to measure heat transfer (Unit 3: Heat)",
    ],
  };
}

// ---------- router ----------

export const syllabusRouter = Router();

// POST /api/syllabus/upload — upload and parse a syllabus
syllabusRouter.post("/upload", async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded. Use field name 'syllabus'." });
      return;
    }

    const sessionId = req.body?.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      // Clean up the uploaded file
      safeUnlink(file.path);
      res.status(400).json({ error: "sessionId is required as a form field." });
      return;
    }

    // Validate file type
    const mimeType = getSupportedMimeType(file.originalname);
    if (!mimeType) {
      safeUnlink(file.path);
      res.status(400).json({
        error: `Unsupported file type. Supported: .pdf, .jpg, .jpeg, .png, .txt, .docx`,
      });
      return;
    }

    // Get or create the session (auto-create if the user uploads before chatting)
    const session = getOrCreateSession(sessionId, 10);

    // Parse with Claude
    let result: { parsed: Omit<ParsedSyllabus, "id" | "uploadedAt">; suggestedActivities: string[] };
    try {
      result = await parseSyllabusWithClaude(file.path, file.originalname);
    } finally {
      // Always clean up the temp file
      safeUnlink(file.path);
    }

    // Build the full ParsedSyllabus
    const syllabusId = randomUUID();
    const syllabus: ParsedSyllabus = {
      id: syllabusId,
      ...result.parsed,
      uploadedAt: Date.now(),
    };

    // Store in database
    saveSyllabus(sessionId, syllabus);

    // Update session's active syllabus
    session.activeSyllabusId = syllabusId;
    updateSession(session);

    const response: SyllabusUploadResponse = {
      syllabus,
      suggestedActivities: result.suggestedActivities,
    };

    res.json(response);
  } catch (err) {
    console.error("Syllabus upload error:", err);
    // Clean up file if it exists
    if (req.file?.path) {
      safeUnlink(req.file.path);
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to process syllabus." });
  }
});

// GET /api/syllabus/:sessionId — get all syllabi for a session
syllabusRouter.get("/:sessionId", (req: Request, res: Response) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  res.json({
    syllabi: session.syllabi ?? [],
    activeSyllabusId: session.activeSyllabusId ?? null,
  });
});

// DELETE /api/syllabus/:sessionId/:syllabusId — remove a syllabus
syllabusRouter.delete("/:sessionId/:syllabusId", (req: Request, res: Response) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }

  const deleted = deleteSyllabus(req.params.sessionId, req.params.syllabusId);
  if (!deleted) {
    res.status(404).json({ error: "Syllabus not found." });
    return;
  }

  // If the deleted syllabus was active, clear or reassign
  if (session.activeSyllabusId === req.params.syllabusId) {
    const remaining = getSyllabiBySession(req.params.sessionId);
    session.activeSyllabusId = remaining.length > 0 ? remaining[0].id : undefined;
    updateSession(session);
  }

  const remaining = getSyllabiBySession(req.params.sessionId);
  res.json({ success: true, remaining: remaining.length });
});

// ---------- helpers ----------

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
