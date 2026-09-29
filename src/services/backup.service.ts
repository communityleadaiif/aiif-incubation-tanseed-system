import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export interface BackupResult {
  backupPath: string;
  timestamp: string;
  fileSizeBytes: number;
  sha256: string;
  totalTables: number;
  totalRecords: Record<string, number>;
}

export interface RestoreVerificationResult {
  success: boolean;
  restoredPath: string;
  foreignKeyCheckPassed: boolean;
  totalRestoredRecords: Record<string, number>;
  sourceRecordCounts: Record<string, number>;
  mismatches: string[];
  reportTimestamp: string;
}

export class BackupService {
  constructor(private db: DatabaseSync, private dbFilePath?: string) {}

  public createSnapshotBackup(): BackupResult {
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `aiif-backup-${timestampStr}.sqlite`;
    const backupPath = path.join(backupDir, backupFilename);

    // If source is a disk file, copy safely with VACUUM INTO
    this.db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}';`);

    const fileBuffer = fs.readFileSync(backupPath);
    const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

    // Collect record counts
    const tables = this.getTableNames(this.db);
    const recordCounts: Record<string, number> = {};
    for (const tbl of tables) {
      const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM "${tbl}"`).get() as { cnt: number };
      recordCounts[tbl] = row.cnt;
    }

    return {
      backupPath,
      timestamp: new Date().toISOString(),
      fileSizeBytes: fileBuffer.length,
      sha256,
      totalTables: tables.length,
      totalRecords: recordCounts
    };
  }

  public testRestoreVerification(backupFilePath: string): RestoreVerificationResult {
    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file not found: ${backupFilePath}`);
    }

    // Spin up restored database connection from the snapshot
    const restoredDb = new DatabaseSync(backupFilePath);
    restoredDb.exec('PRAGMA foreign_keys = ON;');

    // 1. Run Foreign Key integrity check
    const fkCheck = restoredDb.prepare('PRAGMA foreign_key_check;').all();
    const foreignKeyCheckPassed = fkCheck.length === 0;

    // 2. Count restored records
    const tables = this.getTableNames(restoredDb);
    const restoredCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const mismatches: string[] = [];

    for (const tbl of tables) {
      const rRow = restoredDb.prepare(`SELECT COUNT(*) as cnt FROM "${tbl}"`).get() as { cnt: number };
      restoredCounts[tbl] = rRow.cnt;

      const sRow = this.db.prepare(`SELECT COUNT(*) as cnt FROM "${tbl}"`).get() as { cnt: number };
      sourceCounts[tbl] = sRow.cnt;

      if (rRow.cnt !== sRow.cnt) {
        mismatches.push(`Table ${tbl}: Source has ${sRow.cnt} rows, Restored has ${rRow.cnt} rows`);
      }
    }

    restoredDb.close();

    return {
      success: foreignKeyCheckPassed && mismatches.length === 0,
      restoredPath: backupFilePath,
      foreignKeyCheckPassed,
      totalRestoredRecords: restoredCounts,
      sourceRecordCounts: sourceCounts,
      mismatches,
      reportTimestamp: new Date().toISOString()
    };
  }

  private getTableNames(db: DatabaseSync): string[] {
    const rows = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__%'
    `).all() as Array<{ name: string }>;
    return rows.map(r => r.name);
  }
}
