import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDatabase } from './connection.js';

export function runMigrations(db: DatabaseSync): string[] {
  // Ensure schema migrations tracker exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS __schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const appliedList = db.prepare('SELECT version FROM __schema_migrations').all() as { version: string }[];
  const appliedSet = new Set(appliedList.map(r => r.version));
  const newlyApplied: string[] = [];

  const recordMigrationStmt = db.prepare('INSERT INTO __schema_migrations (version) VALUES (?)');

  for (const file of files) {
    if (!appliedSet.has(file)) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Execute inside transaction
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec(sql);
        recordMigrationStmt.run(file);
        db.exec('COMMIT;');
        newlyApplied.push(file);
      } catch (err) {
        db.exec('ROLLBACK;');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  }

  return newlyApplied;
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  try {
    const db = getDatabase();
    const applied = runMigrations(db);
    console.log(`Successfully applied ${applied.length} migrations:`, applied);
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}
