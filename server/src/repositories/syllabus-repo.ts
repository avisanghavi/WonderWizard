// LabBuddy — Syllabus repository (SQLite-backed)

import { getDb } from "../db.js";
import type { ParsedSyllabus, SyllabusUnit } from "../../../shared/types.js";

export function saveSyllabus(sessionId: string, syllabus: ParsedSyllabus): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO syllabi (id, session_id, subject, grade_level, teacher, school, raw_summary, units, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    syllabus.id,
    sessionId,
    syllabus.subject,
    syllabus.gradeLevel,
    syllabus.teacher ?? null,
    syllabus.school ?? null,
    syllabus.rawSummary,
    JSON.stringify(syllabus.units),
    syllabus.uploadedAt,
  );
}

export function getSyllabiBySession(sessionId: string): ParsedSyllabus[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM syllabi WHERE session_id = ? ORDER BY uploaded_at ASC")
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    subject: string;
    grade_level: string;
    teacher: string | null;
    school: string | null;
    raw_summary: string;
    units: string;
    uploaded_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    gradeLevel: row.grade_level,
    teacher: row.teacher ?? undefined,
    school: row.school ?? undefined,
    rawSummary: row.raw_summary,
    units: JSON.parse(row.units) as SyllabusUnit[],
    uploadedAt: row.uploaded_at,
  }));
}

export function deleteSyllabus(sessionId: string, syllabusId: string): boolean {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM syllabi WHERE id = ? AND session_id = ?")
    .run(syllabusId, sessionId);
  return result.changes > 0;
}
