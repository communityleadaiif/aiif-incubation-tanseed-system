import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface HistoricalSupportInput {
  startupId: string;
  activityDate: string; // YYYY-MM-DD
  activityCategory: 'FOUNDER_MEETING' | 'MENTOR_SESSION' | 'PITCH_REVIEW' | 'INVESTOR_CONNECTION' | 'WORKSHOP_EVENT' | 'PRODUCT_REVIEW' | 'TANSEED_FACILITATION' | 'INFRASTRUCTURE_ACCESS' | 'OTHER';
  aiifSupportDescription: string;
  participantsText: string;
  evidenceSummary?: string;
  verifiedBy: string;
}

export class HistoricalSupportService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createRecord(input: HistoricalSupportInput, actorId?: string, actorEmail?: string): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) {
      throw new Error(`Startup not found: ${input.startupId}`);
    }

    const id = randomUUID();
    const recordCode = this.idGen.generateId({ prefix: 'HSR' });
    const entryLabel = `Historical Record - entered on ${new Date().toISOString().slice(0, 10)} based on verified documentary evidence.`;

    const stmt = this.db.prepare(`
      INSERT INTO historical_support_records (
        id, record_code, startup_id, activity_date, activity_category,
        aiif_support_description, participants_text, entry_label,
        evidence_summary, verified_by, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      recordCode,
      input.startupId,
      input.activityDate,
      input.activityCategory,
      input.aiifSupportDescription,
      input.participantsText,
      entryLabel,
      input.evidenceSummary || null,
      input.verifiedBy
    );

    // Flag startup as historically supported
    this.db.prepare(`
      UPDATE startup_masters SET 
        is_historically_supported = 1,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.startupId);

    const created = this.getRecordById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_HISTORICAL_SUPPORT_RECORD',
      entityType: 'HISTORICAL_SUPPORT_RECORD',
      entityId: id,
      entityDisplayCode: recordCode,
      newValue: created,
      reason: `Recorded genuine historical interaction on ${input.activityDate} (${input.activityCategory})`
    });

    return created;
  }

  public getRecordById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT h.*, s.legal_name as startup_legal_name, s.aiif_startup_id, u.full_name as verified_by_name
      FROM historical_support_records h
      JOIN startup_masters s ON h.startup_id = s.id
      JOIN user_accounts u ON h.verified_by = u.id
      WHERE (h.id = ? OR h.record_code = ?) AND h.deleted_at IS NULL
    `).get(idOrCode, idOrCode);
  }

  public getRecordsByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT h.*, s.legal_name as startup_legal_name, s.aiif_startup_id, u.full_name as verified_by_name
      FROM historical_support_records h
      JOIN startup_masters s ON h.startup_id = s.id
      JOIN user_accounts u ON h.verified_by = u.id
      WHERE (s.id = ? OR s.aiif_startup_id = ?) AND h.deleted_at IS NULL
      ORDER BY h.activity_date ASC
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }
}
