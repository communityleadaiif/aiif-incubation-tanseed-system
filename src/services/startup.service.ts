import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface StartupInput {
  legalName: string;
  brandName: string;
  cinNumber?: string;
  dpiitNumber?: string;
  udyamNumber?: string;
  gstNumber?: string;
  incorporationDate?: string;
  legalStructure?: 'Private Limited' | 'LLP' | 'Partnership' | 'Proprietorship' | 'Unregistered Idea';
  registeredAddress?: string;
  website?: string;
  sectorCode: string;
  problemStatement: string;
  solutionDescription: string;
  technologyStack?: string;
  currentTrl?: number;
  businessModel?: string;
  targetMarket?: string;
  revenueModel?: string;
  currentAnnualRevenue?: number;
  totalFundingRaised?: number;
  fundingRequired?: number;
  incubationStatus?: string;
  tanseedStatus?: string;
  isHistoricallySupported?: boolean;
  formalAdmissionDate?: string;
}

export class StartupService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createStartup(input: StartupInput, actorId?: string, actorEmail?: string): any {
    const id = randomUUID();
    const aiifStartupId = this.idGen.generateId({ prefix: 'AIIF-INC', format: 'STARTUP' });

    const stmt = this.db.prepare(`
      INSERT INTO startup_masters (
        id, aiif_startup_id, legal_name, brand_name, cin_number,
        dpiit_number, udyam_number, gst_number, incorporation_date,
        legal_structure, registered_address, website, sector_code,
        problem_statement, solution_description, technology_stack,
        current_trl, business_model, target_market, revenue_model,
        current_annual_revenue, total_funding_raised, funding_required,
        incubation_status, tanseed_status, is_historically_supported,
        formal_admission_date, version
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
      )
    `);

    stmt.run(
      id,
      aiifStartupId,
      input.legalName,
      input.brandName,
      input.cinNumber || null,
      input.dpiitNumber || null,
      input.udyamNumber || null,
      input.gstNumber || null,
      input.incorporationDate || null,
      input.legalStructure || 'Private Limited',
      input.registeredAddress || null,
      input.website || null,
      input.sectorCode,
      input.problemStatement,
      input.solutionDescription,
      input.technologyStack || null,
      input.currentTrl || 1,
      input.businessModel || null,
      input.targetMarket || null,
      input.revenueModel || null,
      input.currentAnnualRevenue || 0,
      input.totalFundingRaised || 0,
      input.fundingRequired || 0,
      input.incubationStatus || 'LEAD',
      input.tanseedStatus || 'NONE',
      input.isHistoricallySupported ? 1 : 0,
      input.formalAdmissionDate || null
    );

    const created = this.getStartupById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_STARTUP',
      entityType: 'STARTUP_MASTER',
      entityId: id,
      entityDisplayCode: aiifStartupId,
      newValue: created,
      reason: 'Created new startup master record'
    });

    return created;
  }

  public getStartupById(idOrAiifId: string, includeDeleted = false): any {
    const query = `
      SELECT s.*, sec.sector_name, trl.title as trl_title
      FROM startup_masters s
      LEFT JOIN master_sectors sec ON s.sector_code = sec.sector_code
      LEFT JOIN master_trl_levels trl ON s.current_trl = trl.trl_level
      WHERE (s.id = ? OR s.aiif_startup_id = ?)
      ${includeDeleted ? '' : 'AND s.deleted_at IS NULL'}
    `;
    return this.db.prepare(query).get(idOrAiifId, idOrAiifId);
  }

  public updateStartup(
    idOrAiifId: string,
    updates: Partial<StartupInput> & { expectedVersion: number },
    actorId?: string,
    actorEmail?: string,
    reason?: string
  ): any {
    const existing = this.getStartupById(idOrAiifId);
    if (!existing) {
      throw new Error(`Startup not found: ${idOrAiifId}`);
    }

    if (existing.version !== updates.expectedVersion) {
      throw new Error(`Concurrency conflict: Record version is ${existing.version}, but client expected version ${updates.expectedVersion}. Please reload.`);
    }

    const nextLegalName = updates.legalName !== undefined ? updates.legalName : existing.legal_name;
    const nextBrandName = updates.brandName !== undefined ? updates.brandName : existing.brand_name;
    const nextCin = updates.cinNumber !== undefined ? updates.cinNumber : existing.cin_number;
    const nextDpiit = updates.dpiitNumber !== undefined ? updates.dpiitNumber : existing.dpiit_number;
    const nextUdyam = updates.udyamNumber !== undefined ? updates.udyamNumber : existing.udyam_number;
    const nextGst = updates.gstNumber !== undefined ? updates.gstNumber : existing.gst_number;
    const nextIncDate = updates.incorporationDate !== undefined ? updates.incorporationDate : existing.incorporation_date;
    const nextStructure = updates.legalStructure !== undefined ? updates.legalStructure : existing.legal_structure;
    const nextAddress = updates.registeredAddress !== undefined ? updates.registeredAddress : existing.registered_address;
    const nextWebsite = updates.website !== undefined ? updates.website : existing.website;
    const nextSector = updates.sectorCode !== undefined ? updates.sectorCode : existing.sector_code;
    const nextProblem = updates.problemStatement !== undefined ? updates.problemStatement : existing.problem_statement;
    const nextSolution = updates.solutionDescription !== undefined ? updates.solutionDescription : existing.solution_description;
    const nextTechStack = updates.technologyStack !== undefined ? updates.technologyStack : existing.technology_stack;
    const nextTrl = updates.currentTrl !== undefined ? updates.currentTrl : existing.current_trl;
    const nextBizModel = updates.businessModel !== undefined ? updates.businessModel : existing.business_model;
    const nextTargetMarket = updates.targetMarket !== undefined ? updates.targetMarket : existing.target_market;
    const nextRevenueModel = updates.revenueModel !== undefined ? updates.revenueModel : existing.revenue_model;
    const nextRevenue = updates.currentAnnualRevenue !== undefined ? updates.currentAnnualRevenue : existing.current_annual_revenue;
    const nextTotalRaised = updates.totalFundingRaised !== undefined ? updates.totalFundingRaised : existing.total_funding_raised;
    const nextFundingReq = updates.fundingRequired !== undefined ? updates.fundingRequired : existing.funding_required;
    const nextStatus = updates.incubationStatus !== undefined ? updates.incubationStatus : existing.incubation_status;
    const nextTanseed = updates.tanseedStatus !== undefined ? updates.tanseedStatus : existing.tanseed_status;
    const nextHistSupport = updates.isHistoricallySupported !== undefined ? (updates.isHistoricallySupported ? 1 : 0) : existing.is_historically_supported;
    const nextFormalAdm = updates.formalAdmissionDate !== undefined ? updates.formalAdmissionDate : existing.formal_admission_date;

    const stmt = this.db.prepare(`
      UPDATE startup_masters SET
        legal_name = ?,
        brand_name = ?,
        cin_number = ?,
        dpiit_number = ?,
        udyam_number = ?,
        gst_number = ?,
        incorporation_date = ?,
        legal_structure = ?,
        registered_address = ?,
        website = ?,
        sector_code = ?,
        problem_statement = ?,
        solution_description = ?,
        technology_stack = ?,
        current_trl = ?,
        business_model = ?,
        target_market = ?,
        revenue_model = ?,
        current_annual_revenue = ?,
        total_funding_raised = ?,
        funding_required = ?,
        incubation_status = ?,
        tanseed_status = ?,
        is_historically_supported = ?,
        formal_admission_date = ?,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?
    `);

    const res = stmt.run(
      nextLegalName, nextBrandName, nextCin, nextDpiit, nextUdyam, nextGst,
      nextIncDate, nextStructure, nextAddress, nextWebsite, nextSector,
      nextProblem, nextSolution, nextTechStack, nextTrl, nextBizModel,
      nextTargetMarket, nextRevenueModel, nextRevenue, nextTotalRaised,
      nextFundingReq, nextStatus, nextTanseed, nextHistSupport, nextFormalAdm,
      existing.id, updates.expectedVersion
    );

    if (res.changes === 0) {
      throw new Error(`Optimistic locking failed: Record was updated concurrently.`);
    }

    const updated = this.getStartupById(existing.id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE_STARTUP',
      entityType: 'STARTUP_MASTER',
      entityId: existing.id,
      entityDisplayCode: existing.aiif_startup_id,
      oldValue: existing,
      newValue: updated,
      reason: reason || 'Updated startup master record'
    });

    return updated;
  }

  public softDeleteStartup(idOrAiifId: string, actorId: string, actorEmail: string, reason: string): boolean {
    const existing = this.getStartupById(idOrAiifId);
    if (!existing) {
      throw new Error(`Startup not found: ${idOrAiifId}`);
    }

    const stmt = this.db.prepare(`
      UPDATE startup_masters SET
        deleted_at = CURRENT_TIMESTAMP,
        deleted_by = ?,
        deletion_reason = ?,
        version = version + 1
      WHERE id = ? AND deleted_at IS NULL
    `);

    const res = stmt.run(actorId, reason, existing.id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'SOFT_DELETE_STARTUP',
      entityType: 'STARTUP_MASTER',
      entityId: existing.id,
      entityDisplayCode: existing.aiif_startup_id,
      oldValue: existing,
      reason: reason
    });

    return res.changes > 0;
  }

  public restoreStartup(idOrAiifId: string, actorId: string, actorEmail: string, reason: string): boolean {
    const existing = this.getStartupById(idOrAiifId, true);
    if (!existing) {
      throw new Error(`Startup not found: ${idOrAiifId}`);
    }

    const stmt = this.db.prepare(`
      UPDATE startup_masters SET
        deleted_at = NULL,
        deleted_by = NULL,
        deletion_reason = NULL,
        version = version + 1
      WHERE id = ? AND deleted_at IS NOT NULL
    `);

    const res = stmt.run(existing.id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'RESTORE_STARTUP',
      entityType: 'STARTUP_MASTER',
      entityId: existing.id,
      entityDisplayCode: existing.aiif_startup_id,
      newValue: this.getStartupById(existing.id),
      reason: reason
    });

    return res.changes > 0;
  }

  public listStartups(filters: { sector?: string; status?: string; tanseedStatus?: string; search?: string } = {}) {
    let sql = `
      SELECT s.*, sec.sector_name, trl.title as trl_title
      FROM startup_masters s
      LEFT JOIN master_sectors sec ON s.sector_code = sec.sector_code
      LEFT JOIN master_trl_levels trl ON s.current_trl = trl.trl_level
      WHERE s.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (filters.sector) {
      sql += ` AND s.sector_code = ?`;
      params.push(filters.sector);
    }
    if (filters.status) {
      sql += ` AND s.incubation_status = ?`;
      params.push(filters.status);
    }
    if (filters.tanseedStatus) {
      sql += ` AND s.tanseed_status = ?`;
      params.push(filters.tanseedStatus);
    }
    if (filters.search) {
      sql += ` AND (s.legal_name LIKE ? OR s.brand_name LIKE ? OR s.aiif_startup_id LIKE ?)`;
      const searchWildcard = `%${filters.search}%`;
      params.push(searchWildcard, searchWildcard, searchWildcard);
    }

    sql += ` ORDER BY s.created_at DESC`;

    return this.db.prepare(sql).all(...params);
  }
}
