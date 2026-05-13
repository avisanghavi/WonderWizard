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

export function createSession(session: LabSession): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, child_age, phase, current_step, current_experiment, active_syllabus_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.childAge,
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

export function getOrCreateSession(sessionId: string, childAge: number): LabSession {
  let session = getSession(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      childAge,
      currentStep: 0,
      phase: "exploring",
      syllabi: [],
    };
    createSession(session);
  }
  // Ensure syllabi array is initialized
  if (!session.syllabi) {
    session.syllabi = [];
  }
  return session;
}
