import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface SchemeApplicationInput {
  startupId: string;
  schemeCode: string;
  externalApplicationNo: string;
  submissionDate: string;
  currentStage: 'DRAFTING' | 'SUBMITTED' | 'PRELIMINARY_EVALUATION' | 'SHORTLISTED_FOR_PITCH' | 'FINAL_STAGE' | 'SANCTION_RECEIVED' | 'AGREEMENT_SIGNED' | 'DISBURSED' | 'REJECTED';
  fundingAmountRequested: number;
  fundingAmountSanctioned?: number;
  disbursementStatus?: 'PENDING' | 'PARTIALLY_DISBURSED' | 'FULLY_DISBURSED';
  officialCommunicationsLog?: string;
  finalOutcomeNotes?: string;
}

export class SchemeService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public getMasterSchemes() {
    return this.db.prepare('SELECT * FROM master_funding_schemes WHERE is_active = 1 ORDER BY scheme_name ASC').all();
  }

  public createApplication(input: SchemeApplicationInput, actorId?: string, actorEmail?: string): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) throw new Error(`Startup not found: ${input.startupId}`);

    const scheme = this.db.prepare('SELECT scheme_code, scheme_name FROM master_funding_schemes WHERE scheme_code = ?').get(input.schemeCode) as any;
    if (!scheme) throw new Error(`Invalid scheme code: ${input.schemeCode}`);

    const id = randomUUID();
    const schemeAppCode = this.idGen.generateId({ prefix: 'SCH' });

    const stmt = this.db.prepare(`
      INSERT INTO scheme_applications (
        id, scheme_app_code, startup_id, scheme_code,
        external_application_no, submission_date, current_stage,
        funding_amount_requested, funding_amount_sanctioned,
        disbursement_status, official_communications_log, final_outcome_notes, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      schemeAppCode,
      input.startupId,
      input.schemeCode,
      input.externalApplicationNo,
      input.submissionDate,
      input.currentStage,
      input.fundingAmountRequested,
      input.fundingAmountSanctioned || 0,
      input.disbursementStatus || 'PENDING',
      input.officialCommunicationsLog || null,
      input.finalOutcomeNotes || null
    );

    // If TANSEED, synchronize startup tanseed_status
    if (input.schemeCode === 'TANSEED') {
      let tanseedStatus = 'APPLIED';
      if (input.currentStage === 'FINAL_STAGE') tanseedStatus = 'FINAL_STAGE';
      else if (input.currentStage === 'SHORTLISTED_FOR_PITCH') tanseedStatus = 'SHORTLISTED';
      else if (input.currentStage === 'SANCTION_RECEIVED') tanseedStatus = 'SANCTIONED';
      else if (input.currentStage === 'DISBURSED') tanseedStatus = 'DISBURSED';
      else if (input.currentStage === 'REJECTED') tanseedStatus = 'REJECTED';

      this.db.prepare(`
        UPDATE startup_masters SET 
          tanseed_status = ?,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(tanseedStatus, input.startupId);
    }

    const created = this.getApplicationById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_SCHEME_APPLICATION',
      entityType: 'SCHEME_APPLICATION',
      entityId: id,
      entityDisplayCode: schemeAppCode,
      newValue: created,
      reason: `Recorded scheme application for ${scheme.scheme_name} (${input.currentStage})`
    });

    return created;
  }

  public updateStage(
    id: string,
    currentStage: SchemeApplicationInput['currentStage'],
    sanctionedAmount?: number,
    disbursementStatus?: 'PENDING' | 'PARTIALLY_DISBURSED' | 'FULLY_DISBURSED',
    actorId?: string,
    actorEmail?: string
  ): any {
    const existing = this.getApplicationById(id);
    if (!existing) throw new Error(`Scheme application not found: ${id}`);

    const stmt = this.db.prepare(`
      UPDATE scheme_applications SET
        current_stage = ?,
        funding_amount_sanctioned = COALESCE(?, funding_amount_sanctioned),
        disbursement_status = COALESCE(?, disbursement_status),
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(currentStage, sanctionedAmount !== undefined ? sanctionedAmount : null, disbursementStatus || null, id);

    if (existing.scheme_code === 'TANSEED') {
      let tanseedStatus = 'APPLIED';
      if (currentStage === 'FINAL_STAGE') tanseedStatus = 'FINAL_STAGE';
      else if (currentStage === 'SHORTLISTED_FOR_PITCH') tanseedStatus = 'SHORTLISTED';
      else if (currentStage === 'SANCTION_RECEIVED') tanseedStatus = 'SANCTIONED';
      else if (currentStage === 'DISBURSED') tanseedStatus = 'DISBURSED';
      else if (currentStage === 'REJECTED') tanseedStatus = 'REJECTED';

      this.db.prepare(`
        UPDATE startup_masters SET 
          tanseed_status = ?,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(tanseedStatus, existing.startup_id);
    }

    const updated = this.getApplicationById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE_SCHEME_STAGE',
      entityType: 'SCHEME_APPLICATION',
      entityId: id,
      entityDisplayCode: existing.scheme_app_code,
      oldValue: existing,
      newValue: updated,
      reason: `Updated scheme stage to ${currentStage}`
    });

    return updated;
  }

  public getApplicationById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT sa.*, s.legal_name as startup_legal_name, s.aiif_startup_id, sch.scheme_name, sch.agency_name
      FROM scheme_applications sa
      JOIN startup_masters s ON sa.startup_id = s.id
      JOIN master_funding_schemes sch ON sa.scheme_code = sch.scheme_code
      WHERE (sa.id = ? OR sa.scheme_app_code = ?) AND sa.deleted_at IS NULL
    `).get(idOrCode, idOrCode);
  }

  public getApplicationsByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT sa.*, s.legal_name as startup_legal_name, s.aiif_startup_id, sch.scheme_name, sch.agency_name
      FROM scheme_applications sa
      JOIN startup_masters s ON sa.startup_id = s.id
      JOIN master_funding_schemes sch ON sa.scheme_code = sch.scheme_code
      WHERE (s.id = ? OR s.aiif_startup_id = ?) AND sa.deleted_at IS NULL
      ORDER BY sa.submission_date DESC
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }
}
