import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrations } from "./schema";

export type Db = Database.Database;

/** Opens the runtime database with WAL and foreign keys, then applies pending migrations. */
export function openDatabase(databasePath: string): Db {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let version = current; version < migrations.length; version += 1) {
    db.transaction(() => {
      db.exec(migrations[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

/** Interrupted work never resumes silently: running sessions and started runs become failed. */
export function recoverInterruptedWork(db: Db, now: string): { sessions: number; runs: number } {
  const errorCode = "RUNTIME_RESTARTED";
  return db.transaction(() => {
    const sessions = db.prepare(`
      UPDATE sessions SET status = 'FAILED',
        data = json_set(data, '$.status', 'FAILED', '$.errorCode', ?, '$.finishedAt', ?)
      WHERE status = 'RUNNING'
    `).run(errorCode, now).changes;
    const runs = db.prepare(`
      UPDATE agent_runs SET status = 'FAILED',
        data = json_set(data, '$.status', 'FAILED', '$.errorCode', ?, '$.finishedAt', ?)
      WHERE status = 'STARTED'
    `).run(errorCode, now).changes;
    return { sessions, runs };
  })();
}
