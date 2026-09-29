import { DatabaseSync } from 'node:sqlite';

export interface IdGeneratorOptions {
  prefix: string;
  year?: number;
  digits?: number;
  format?: 'STANDARD' | 'STARTUP' | 'COMMITTEE' | 'AUDIT';
}

export class IdGeneratorService {
  constructor(private db: DatabaseSync) {}

  public generateId(options: IdGeneratorOptions): string {
    const year = options.year || new Date().getFullYear();
    const prefix = options.prefix.toUpperCase();
    const digits = options.digits || 6;

    // Atomically increment and get sequence for (prefix, year)
    this.db.prepare(`
      INSERT INTO entity_sequences (entity_prefix, sequence_year, current_value)
      VALUES (?, ?, 1)
      ON CONFLICT(entity_prefix, sequence_year) DO UPDATE SET
        current_value = current_value + 1;
    `).run(prefix, year);

    const row = this.db.prepare(`
      SELECT current_value FROM entity_sequences 
      WHERE entity_prefix = ? AND sequence_year = ?
    `).get(prefix, year) as { current_value: number };

    const seqNum = row.current_value;
    const paddedNum = String(seqNum).padStart(digits, '0');

    if (options.format === 'STARTUP') {
      // e.g. AIIF-INC-2026-0001
      return `AIIF-INC-${year}-${String(seqNum).padStart(4, '0')}`;
    } else if (options.format === 'COMMITTEE') {
      // e.g. COM-2026-0001
      return `COM-${year}-${String(seqNum).padStart(4, '0')}`;
    } else if (options.format === 'AUDIT') {
      // e.g. AUD-20260929-00000001
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      return `AUD-${dateStr}-${String(seqNum).padStart(8, '0')}`;
    }

    // Default Standard: e.g. FND-2026-000001, STU-2026-000001, APP-2026-000001
    return `${prefix}-${year}-${paddedNum}`;
  }
}
