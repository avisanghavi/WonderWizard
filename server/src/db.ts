// LabBuddy — SQLite database singleton and schema initialization
//
// This file owns:
//   1. Connection setup (WAL mode, foreign-key enforcement)
//   2. Schema definition (the desired target schema)
//   3. Idempotent migrations to bring legacy schemas in line with the target
//
// All tables that reference another table use ON DELETE CASCADE so that
// deleting a parent row cleans up children rather than leaving orphans.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_PATH = path.join(DATA_DIR, "labbuddy.db");

let _db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return _db;
}

export { _db as db };

// ---------- target schema ----------
//
// The order matters because of FK references. Tables are listed in dependency
// order (parents before children).
//
// Each entry has:
//   name     — table name
//   sql      — CREATE TABLE statement (idempotent via IF NOT EXISTS)
//   fkSignature — substring(s) we expect to find in the live sqlite_master.sql
//                 If any are missing, the table will be recreated.
//
// The migration policy is "recreate-and-copy" (SQLite cannot ALTER TABLE
// to add a foreign key). We disable foreign_keys briefly during migration.

interface TableSpec {
  name: string;
  sql: string;
  // Substrings that must be present in the live CREATE TABLE statement for
  // us to consider the schema up-to-date. If any are missing, the table is
  // dropped and recreated (preserving rows via INSERT-SELECT).
  fkSignatures: string[];
  // Indexes to create after the table exists.
  indexes?: string[];
}

const TABLES: TableSpec[] = [
  {
    name: "parents",
    sql: `
      CREATE TABLE IF NOT EXISTS parents (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        subscription_tier TEXT NOT NULL DEFAULT 'free',
        subscription_status TEXT NOT NULL DEFAULT 'none',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        trial_ends_at INTEGER,
        created_at INTEGER NOT NULL
      );
    `,
    fkSignatures: [], // root table, no FKs
  },
  {
    name: "child_profiles",
    sql: `
      CREATE TABLE IF NOT EXISTS child_profiles (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        grade_level INTEGER,
        avatar TEXT,
        interests TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE
      );
    `,
    fkSignatures: ["REFERENCES parents(id) ON DELETE CASCADE"],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_child_profiles_parent ON child_profiles(parent_id);",
    ],
  },
  {
    name: "sessions",
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        child_age INTEGER NOT NULL,
        child_id TEXT,
        parent_id TEXT,
        phase TEXT NOT NULL DEFAULT 'exploring',
        current_step INTEGER NOT NULL DEFAULT 0,
        current_experiment TEXT,
        active_syllabus_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
    // sessions are deliberately FK-less because anonymous (pre-signup) sessions
    // are valid — child_id may be a profile id OR an anonymous session id.
    // parent_id (when set) is the Supabase auth.users.id for the signed-in parent.
    fkSignatures: ["parent_id"],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id, updated_at);",
    ],
  },
  {
    name: "chat_messages",
    sql: `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `,
    fkSignatures: ["REFERENCES sessions(id) ON DELETE CASCADE"],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, timestamp);",
    ],
  },
  {
    name: "syllabi",
    sql: `
      CREATE TABLE IF NOT EXISTS syllabi (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        grade_level TEXT NOT NULL,
        teacher TEXT,
        school TEXT,
        raw_summary TEXT NOT NULL,
        units TEXT NOT NULL,
        uploaded_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `,
    fkSignatures: ["REFERENCES sessions(id) ON DELETE CASCADE"],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_syllabi_session ON syllabi(session_id);",
    ],
  },
  {
    name: "diy_guides",
    sql: `
      CREATE TABLE IF NOT EXISTS diy_guides (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        experiment TEXT NOT NULL,
        step_illustrations TEXT NOT NULL,
        generated_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `,
    fkSignatures: ["REFERENCES sessions(id) ON DELETE CASCADE"],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_diy_guides_session ON diy_guides(session_id);",
    ],
  },
  // ----- Gamification -----
  // child_id may be a child_profile id OR an anonymous session id (when a kid
  // chats without a parent account). We do NOT enforce FK to child_profiles
  // because anonymous play is supported. Cascades are handled at the
  // application layer (parent-repo's deleteChildProfile), which deletes
  // gamification rows explicitly.
  {
    name: "xp_events",
    sql: `
      CREATE TABLE IF NOT EXISTS xp_events (
        id TEXT PRIMARY KEY,
        child_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
    `,
    fkSignatures: ["child_id"], // sentinel — no FK by design
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_xp_events_child ON xp_events(child_id, created_at);",
    ],
  },
  {
    name: "streaks",
    sql: `
      CREATE TABLE IF NOT EXISTS streaks (
        child_id TEXT PRIMARY KEY,
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        last_active_date TEXT NOT NULL,
        streak_frozen INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `,
    fkSignatures: ["child_id"],
  },
  {
    name: "earned_badges",
    sql: `
      CREATE TABLE IF NOT EXISTS earned_badges (
        badge_id TEXT NOT NULL,
        child_id TEXT NOT NULL,
        earned_at INTEGER NOT NULL,
        xp_awarded INTEGER NOT NULL,
        PRIMARY KEY (badge_id, child_id)
      );
    `,
    fkSignatures: ["child_id"],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_earned_badges_child ON earned_badges(child_id, earned_at);",
    ],
  },
  // ----- Lab Notebook -----
  {
    name: "notebook_entries",
    sql: `
      CREATE TABLE IF NOT EXISTS notebook_entries (
        id TEXT PRIMARY KEY,
        child_id TEXT NOT NULL,
        experiment_title TEXT NOT NULL,
        experiment_category TEXT NOT NULL,
        observation TEXT NOT NULL,
        hypothesis TEXT,
        conclusion TEXT,
        photo_urls TEXT NOT NULL DEFAULT '[]',
        reflection_answers TEXT,
        rating INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
    fkSignatures: ["child_id"],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_notebook_entries_child ON notebook_entries(child_id, created_at);",
    ],
  },
  // ----- Parent dashboard -----
  {
    name: "parental_controls",
    sql: `
      CREATE TABLE IF NOT EXISTS parental_controls (
        child_id TEXT PRIMARY KEY,
        daily_screen_time_minutes INTEGER,
        blocked_categories TEXT NOT NULL DEFAULT '[]',
        blocked_keywords TEXT NOT NULL DEFAULT '[]',
        require_approval_for_yellow INTEGER NOT NULL DEFAULT 0,
        notifications_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
    `,
    fkSignatures: ["child_id"],
  },
  {
    name: "activity_log",
    sql: `
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        child_id TEXT NOT NULL,
        type TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
    `,
    fkSignatures: ["child_id"],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_activity_log_child ON activity_log(child_id, created_at);",
    ],
  },
  {
    name: "screen_time_usage",
    sql: `
      CREATE TABLE IF NOT EXISTS screen_time_usage (
        child_id TEXT NOT NULL,
        date TEXT NOT NULL,
        minutes_used INTEGER NOT NULL DEFAULT 0,
        sessions_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (child_id, date)
      );
    `,
    fkSignatures: ["child_id"],
  },
  {
    name: "notifications",
    sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        recipient_id TEXT NOT NULL,
        recipient_type TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        action_url TEXT,
        read INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `,
    fkSignatures: ["recipient_id"],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at);",
    ],
  },
];

// ---------- migration helpers ----------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/**
 * Ensure each table matches the target schema. If a table exists but is
 * missing a foreign-key clause we want, recreate it via INSERT-SELECT.
 *
 * Foreign keys must be OFF during this dance — otherwise dropping the old
 * table would cascade-delete children we haven't migrated yet.
 */
function migrateTables(db: Database.Database): void {
  // Capture & disable FK enforcement for the migration window
  const fkBefore = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");

  try {
    for (const spec of TABLES) {
      const existing = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
        )
        .get(spec.name) as { sql: string } | undefined;

      if (!existing) {
        // Table missing entirely — create it
        db.exec(spec.sql);
        if (spec.indexes) {
          for (const ix of spec.indexes) db.exec(ix);
        }
        continue;
      }

      // Check if existing CREATE statement contains all required signatures
      const liveSql = existing.sql ?? "";
      const upToDate = spec.fkSignatures.every((sig) => liveSql.includes(sig));

      if (upToDate) {
        // Schema is already correct; just make sure indexes exist
        if (spec.indexes) {
          for (const ix of spec.indexes) db.exec(ix);
        }
        continue;
      }

      // Recreate this table with the new schema, preserving rows
      console.log(`[db] Migrating table '${spec.name}' to add foreign keys / cascades`);
      const tmpName = `${spec.name}__migration_tmp`;

      // Clean up any leftover temp table from a previous crashed migration
      db.exec(`DROP TABLE IF EXISTS ${tmpName};`);

      // Build the CREATE statement for the temp table by replacing the table
      // name with a single regex (handles both `CREATE TABLE name` and
      // `CREATE TABLE IF NOT EXISTS name`). The \b boundary prevents a
      // double-replace when the new name is a superstring of the old.
      const createRe = new RegExp(
        `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${escapeRegex(spec.name)}\\b`,
        "i"
      );
      const newSql = spec.sql.replace(createRe, `CREATE TABLE ${tmpName}`);
      if (!newSql.includes(`CREATE TABLE ${tmpName}`)) {
        throw new Error(
          `[db] Migration regex failed for table '${spec.name}'. SQL was: ${spec.sql.slice(0, 120)}`
        );
      }

      // Use a transaction so partial failure doesn't corrupt the DB
      const tx = db.transaction(() => {
        // 1. Create new table under temp name
        db.exec(newSql);

        // 2. Determine common columns (intersection of old and new)
        const oldCols = (db.pragma(`table_info(${spec.name})`) as Array<{ name: string }>)
          .map((c) => c.name);
        const newCols = (db.pragma(`table_info(${tmpName})`) as Array<{ name: string }>)
          .map((c) => c.name);
        const commonCols = oldCols.filter((c) => newCols.includes(c));

        if (commonCols.length > 0) {
          const colList = commonCols.join(", ");
          db.exec(
            `INSERT INTO ${tmpName} (${colList}) SELECT ${colList} FROM ${spec.name};`
          );
        }

        // 3. Drop the old table and rename
        db.exec(`DROP TABLE ${spec.name};`);
        db.exec(`ALTER TABLE ${tmpName} RENAME TO ${spec.name};`);
      });
      tx();

      // 4. Re-create indexes (they were dropped with the old table)
      if (spec.indexes) {
        for (const ix of spec.indexes) db.exec(ix);
      }
    }
  } finally {
    // Restore foreign-key enforcement to whatever the caller wants. We always
    // want it ON post-init, but be tidy about restoring the prior state if
    // someone called this mid-run.
    db.pragma(`foreign_keys = ${fkBefore ? "ON" : "ON"}`);
  }
}

// ---------- public init ----------

export function initDb(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // Performance + safety pragmas
  _db.pragma("journal_mode = WAL");

  // Run migrations with FK temporarily off (handled inside migrateTables)
  migrateTables(_db);

  // Now turn FK enforcement on for all subsequent app queries.
  // SQLite requires this on every connection — better-sqlite3 uses one
  // connection per Database instance so this is sufficient.
  _db.pragma("foreign_keys = ON");

  // Sanity check that it stuck
  const fkOn = _db.pragma("foreign_keys", { simple: true }) as number;
  if (!fkOn) {
    console.warn("[db] WARNING: foreign_keys pragma did not enable");
  }
}
