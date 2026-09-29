import { createApp } from './app.js';
import { getDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

try {
  const db = getDatabase();
  const migrationsApplied = runMigrations(db);
  if (migrationsApplied.length > 0) {
    console.log(`Applied migrations:`, migrationsApplied);
  }

  const app = createApp(db);

  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` AIIF Incubation & TANSEED Management Backend Server `);
    console.log(` Running on: http://localhost:${PORT}`);
    console.log(` Database: SQLite WAL Mode (ACID Enforced)`);
    console.log(`=======================================================`);
  });
} catch (err) {
  console.error('Fatal server startup error:', err);
  process.exit(1);
}
