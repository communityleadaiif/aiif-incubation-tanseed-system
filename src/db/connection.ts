import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

dotenv.config();

let activeDb: DatabaseSync | null = null;

export function getDatabase(dbPath?: string): DatabaseSync {
  if (activeDb && !dbPath) {
    return activeDb;
  }

  const resolvedPath = dbPath || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'aiif_database.sqlite');

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(resolvedPath);

  // Critical SQLite Data Integrity Pragma Settings
  db.exec('PRAGMA foreign_keys = ON;');
  if (resolvedPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }

  if (!dbPath) {
    activeDb = db;
  }

  return db;
}

export function closeDatabase(): void {
  if (activeDb) {
    activeDb.close();
    activeDb = null;
  }
}

export function createInMemoryDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}
