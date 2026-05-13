// LabBuddy — Lab Notebook repository (SQLite-backed)

import { randomUUID } from "node:crypto";
import { getDb } from "../db.js";
import type { NotebookEntry } from "../../../shared/types.js";

interface NotebookEntryRow {
  id: string;
  child_id: string;
  experiment_title: string;
  experiment_category: string;
  observation: string;
  hypothesis: string | null;
  conclusion: string | null;
  photo_urls: string;
  reflection_answers: string | null;
  rating: number | null;
  created_at: number;
  updated_at: number;
}

function rowToEntry(row: NotebookEntryRow): NotebookEntry {
  let photoUrls: string[] = [];
  try {
    const parsed = JSON.parse(row.photo_urls ?? "[]");
    if (Array.isArray(parsed)) {
      photoUrls = parsed.map(String);
    }
  } catch {
    photoUrls = [];
  }

  let reflectionAnswers: Record<string, string> | undefined;
  if (row.reflection_answers) {
    try {
      const parsed = JSON.parse(row.reflection_answers);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        reflectionAnswers = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        );
      }
    } catch {
      reflectionAnswers = undefined;
    }
  }

  const rating =
    row.rating === null || row.rating === undefined
      ? undefined
      : (Math.min(5, Math.max(1, Math.round(row.rating))) as 1 | 2 | 3 | 4 | 5);

  return {
    id: row.id,
    childId: row.child_id,
    experimentTitle: row.experiment_title,
    experimentCategory: row.experiment_category,
    observation: row.observation,
    hypothesis: row.hypothesis ?? undefined,
    conclusion: row.conclusion ?? undefined,
    photoUrls,
    reflectionAnswers,
    rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createEntry(
  entry: Omit<NotebookEntry, "id" | "createdAt" | "updatedAt">,
): NotebookEntry {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO notebook_entries (
       id, child_id, experiment_title, experiment_category, observation,
       hypothesis, conclusion, photo_urls, reflection_answers, rating,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    entry.childId,
    entry.experimentTitle,
    entry.experimentCategory,
    entry.observation,
    entry.hypothesis ?? null,
    entry.conclusion ?? null,
    JSON.stringify(entry.photoUrls ?? []),
    entry.reflectionAnswers ? JSON.stringify(entry.reflectionAnswers) : null,
    entry.rating ?? null,
    now,
    now,
  );

  const created = getEntry(id);
  if (!created) {
    throw new Error("Failed to create notebook entry");
  }
  return created;
}

export function getEntry(id: string): NotebookEntry | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM notebook_entries WHERE id = ?")
    .get(id) as NotebookEntryRow | undefined;
  if (!row) return undefined;
  return rowToEntry(row);
}

export function getEntriesByChild(
  childId: string,
  limit = 50,
  offset = 0,
): NotebookEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM notebook_entries
       WHERE child_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(childId, limit, offset) as NotebookEntryRow[];
  return rows.map(rowToEntry);
}

export function updateEntry(
  id: string,
  updates: Partial<NotebookEntry>,
): NotebookEntry | undefined {
  const existing = getEntry(id);
  if (!existing) return undefined;

  const db = getDb();
  const merged: NotebookEntry = {
    ...existing,
    ...updates,
    id: existing.id,
    childId: existing.childId,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };

  db.prepare(
    `UPDATE notebook_entries
     SET experiment_title = ?,
         experiment_category = ?,
         observation = ?,
         hypothesis = ?,
         conclusion = ?,
         photo_urls = ?,
         reflection_answers = ?,
         rating = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(
    merged.experimentTitle,
    merged.experimentCategory,
    merged.observation,
    merged.hypothesis ?? null,
    merged.conclusion ?? null,
    JSON.stringify(merged.photoUrls ?? []),
    merged.reflectionAnswers ? JSON.stringify(merged.reflectionAnswers) : null,
    merged.rating ?? null,
    merged.updatedAt,
    merged.id,
  );

  return getEntry(id);
}

export function deleteEntry(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM notebook_entries WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getEntryCount(childId: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM notebook_entries WHERE child_id = ?")
    .get(childId) as { count: number } | undefined;
  return row?.count ?? 0;
}
