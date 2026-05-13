// LabBuddy — Chat message repository (SQLite-backed)

import { getDb } from "../db.js";
import type { ChatMessage, ContentBlock } from "../../../shared/types.js";

export function saveMessage(sessionId: string, message: ChatMessage): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO chat_messages (id, session_id, role, content, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    message.id,
    sessionId,
    message.role,
    JSON.stringify(message.content),
    message.timestamp,
  );
}

export function getMessagesBySession(sessionId: string): ChatMessage[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC")
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    role: string;
    content: string;
    timestamp: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    role: row.role as ChatMessage["role"],
    content: JSON.parse(row.content) as ContentBlock[],
    timestamp: row.timestamp,
  }));
}
