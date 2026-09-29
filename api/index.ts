import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDemoData } from '../src/db/seed.js';

let appInstance: any = null;

export default function handler(req: any, res: any) {
  if (!appInstance) {
    if (process.env.VERCEL && !process.env.DATABASE_PATH) {
      process.env.DATABASE_PATH = '/tmp/aiif_database.sqlite';
    }
    const db = getDatabase();
    runMigrations(db);
    try {
      seedDemoData();
    } catch {
      // already seeded
    }
    appInstance = createApp(db);
  }
  return appInstance(req, res);
}
