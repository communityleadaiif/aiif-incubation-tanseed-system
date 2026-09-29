import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface AgreementInput {
  startupId: string;
  formalCommencementDate: string; // ISO Date YYYY-MM-DD
  durationMonths?: number;
  equityPercentage?: number;
  aiifSignatoryName?: string;
  aiifSignatoryDesignation?: string;
  startupSignatoryName?: string;
  startupSignatoryDesignation?: string;
  termsClauses?: any;
}

export class AgreementService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createDraftAgreement(input: AgreementInput, actorId?: string, actorEmail?: string): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id, legal_name FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) {
      throw new Error(`Startup not found: ${input.startupId}`);
    }

    const id = randomUUID();
    const agreementCode = this.idGen.generateId({ prefix: 'AGR' });
    const refYear = new Date().getFullYear();
    const docRefNo = `AIIF/INC/${refYear}/${startup.aiif_startup_id.split('-').pop()}/AGR`;

    const duration = input.durationMonths || 12;
    const commDate = new Date(input.formalCommencementDate);
    const expDate = new Date(commDate);
    expDate.setMonth(expDate.getMonth() + duration);
    const expiryDateStr = expDate.toISOString().slice(0, 10);

    const stmt = this.db.prepare(`
      INSERT INTO incubation_agreements (
        id, agreement_code, startup_id, document_reference_no,
        formal_commencement_date, duration_months, expiry_date,
        equity_percentage, agreement_status, aiif_signatory_name,
        aiif_signatory_designation, startup_signatory_name,
        startup_signatory_designation, terms_clauses_json, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      agreementCode,
      input.startupId,
      docRefNo,
      input.formalCommencementDate,
      duration,
      expiryDateStr,
      input.equityPercentage || 0,
      input.aiifSignatoryName || 'Chief Executive Officer',
      input.aiifSignatoryDesignation || 'CEO, AIIF',
      input.startupSignatoryName || 'Founder & Director',
      input.startupSignatoryDesignation || 'Director',
      input.termsClauses ? JSON.stringify(input.termsClauses) : null
    );

    // Update startup pipeline status to AGREEMENT_PENDING
    this.db.prepare(`
      UPDATE startup_masters SET 
        incubation_status = 'AGREEMENT_PENDING',
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.startupId);

    const created = this.getAgreementById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_DRAFT_AGREEMENT',
      entityType: 'INCUBATION_AGREEMENT',
      entityId: id,
      entityDisplayCode: docRefNo,
      newValue: created,
      reason: `Created draft incubation agreement for ${startup.aiif_startup_id}`
    });

    return created;
  }

  public executeAgreement(
    id: string,
    actualExecutionDate: string,
    executedFileId?: string,
    actorId?: string,
    actorEmail?: string
  ): any {
    const existing = this.getAgreementById(id);
    if (!existing) {
      throw new Error(`Agreement not found: ${id}`);
    }

    if (existing.agreement_status === 'EXECUTED') {
      throw new Error(`Agreement is already executed on ${existing.execution_date}`);
    }

    // Execution date must be verified
    const stmt = this.db.prepare(`
      UPDATE incubation_agreements SET
        agreement_status = 'EXECUTED',
        execution_date = ?,
        executed_document_file_id = ?,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(actualExecutionDate, executedFileId || null, id);

    // Transition startup status to INCUBATION_ACTIVE
    this.db.prepare(`
      UPDATE startup_masters SET
        incubation_status = 'INCUBATION_ACTIVE',
        formal_admission_date = ?,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existing.formal_commencement_date, existing.startup_id);

    const updated = this.getAgreementById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'EXECUTE_AGREEMENT',
      entityType: 'INCUBATION_AGREEMENT',
      entityId: id,
      entityDisplayCode: existing.document_reference_no,
      oldValue: existing,
      newValue: updated,
      reason: `Formally executed incubation agreement on ${actualExecutionDate}`
    });

    return updated;
  }

  public getAgreementById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT a.*, s.legal_name as startup_legal_name, s.brand_name, s.aiif_startup_id
      FROM incubation_agreements a
      JOIN startup_masters s ON a.startup_id = s.id
      WHERE a.id = ? OR a.agreement_code = ? OR a.document_reference_no = ?
    `).get(idOrCode, idOrCode, idOrCode);
  }

  public getAgreementsByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT a.*, s.legal_name as startup_legal_name, s.brand_name, s.aiif_startup_id
      FROM incubation_agreements a
      JOIN startup_masters s ON a.startup_id = s.id
      WHERE s.id = ? OR s.aiif_startup_id = ?
      ORDER BY a.created_at DESC
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }
}
