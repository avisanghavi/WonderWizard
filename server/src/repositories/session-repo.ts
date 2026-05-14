// LabBuddy — Session repository (SQLite-backed)

import { getDb } from "../db.js";
import { getSyllabiBySession } from "./syllabus-repo.js";
import type { LabSession, GeneratedExperiment } from "../../../shared/types.js";

export function getSession(id: string): LabSession | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | {
        id: string;
        child_age: number;
        phase: string;
        current_step: number;
        current_experiment: string | null;
        active_syllabus_id: string | null;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) return undefined;

  const session: LabSession = {
    id: row.id,
    childAge: row.child_age,
    phase: row.phase as LabSession["phase"],
    currentStep: row.current_step,
    currentExperiment: row.current_experiment
      ? (JSON.parse(row.current_experiment) as GeneratedExperiment)
      : undefined,
    activeSyllabusId: row.active_syllabus_id ?? undefined,
    syllabi: getSyllabiBySession(row.id),
  };

  return session;
}

export function createSession(session: LabSession, parentId?: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, child_age, parent_id, phase, current_step, current_experiment, active_syllabus_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.childAge,
    parentId ?? null,
    session.phase,
    session.currentStep,
    session.currentExperiment ? JSON.stringify(session.currentExperiment) : null,
    session.activeSyllabusId ?? null,
    now,
    now,
  );
}

export function updateSession(session: LabSession): void {
  const db = getDb();
  db.prepare(
    `UPDATE sessions
     SET child_age = ?, phase = ?, current_step = ?, current_experiment = ?, active_syllabus_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    session.childAge,
    session.phase,
    session.currentStep,
    session.currentExperiment ? JSON.stringify(session.currentExperiment) : null,
    session.activeSyllabusId ?? null,
    Date.now(),
    session.id,
  );
}

export function getOrCreateSession(
  sessionId: string,
  childAge: number,
  parentId?: string,
): LabSession {
  let session = getSession(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      childAge,
      currentStep: 0,
      phase: "exploring",
      syllabi: [],
    };
    createSession(session, parentId);
  } else if (parentId) {
    // Backfill parent_id if the row was created anonymously and the user has
    // since signed in. Only sets it if currently NULL — never overwrites.
    const db = getDb();
    db.prepare(
      "UPDATE sessions SET parent_id = COALESCE(parent_id, ?) WHERE id = ?",
    ).run(parentId, sessionId);
  }
  if (!session.syllabi) session.syllabi = [];
  return session;
}

/**
 * Returns the most recently-updated session for a given parent, or undefined
 * if they have no sessions yet. Used by the client on login to auto-restore
 * the kid's last conversation + syllabi.
 */
export function getLatestSessionByParent(parentId: string): LabSession | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id FROM sessions WHERE parent_id = ? ORDER BY updated_at DESC LIMIT 1",
    )
    .get(parentId) as { id: string } | undefined;
  if (!row) return undefined;
  return getSession(row.id);
}

/**
 * List all sessions owned by a parent, most recent first. For a future
 * ChatGPT-style sidebar — not used by the MVP auto-restore.
 */
export function listSessionsByParent(parentId: string): Array<{ id: string; updatedAt: number; createdAt: number }> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, created_at, updated_at FROM sessions WHERE parent_id = ? ORDER BY updated_at DESC",
    )
    .all(parentId) as Array<{ id: string; created_at: number; updated_at: number }>;
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at }));
}
