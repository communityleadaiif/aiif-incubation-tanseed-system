import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface MilestoneInput {
  startupId: string;
  title: string;
  category: 'PROTOTYPE' | 'PILOT' | 'CUSTOMERS' | 'REVENUE' | 'IPR' | 'FUNDING' | 'MARKET_EXPANSION' | 'OPERATIONS';
  baselineState: string;
  targetState: string;
  targetDueDate: string;
  status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'AT_RISK' | 'COMPLETED' | 'DELAYED' | 'CANCELLED';
  verificationNotes?: string;
  completionDate?: string;
}

export class MilestoneService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createMilestone(input: MilestoneInput, actorId?: string, actorEmail?: string): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) throw new Error(`Startup not found: ${input.startupId}`);

    const id = randomUUID();
    const milestoneCode = this.idGen.generateId({ prefix: 'MLS' });

    const stmt = this.db.prepare(`
      INSERT INTO startup_milestones (
        id, milestone_code, startup_id, title, category,
        baseline_state, target_state, target_due_date,
        completion_date, status, verification_notes, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      milestoneCode,
      input.startupId,
      input.title,
      input.category,
      input.baselineState,
      input.targetState,
      input.targetDueDate,
      input.completionDate || null,
      input.status || 'NOT_STARTED',
      input.verificationNotes || null
    );

    const created = this.getMilestoneById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_MILESTONE',
      entityType: 'STARTUP_MILESTONE',
      entityId: id,
      entityDisplayCode: milestoneCode,
      newValue: created,
      reason: `Created milestone: ${input.title} for ${startup.aiif_startup_id}`
    });

    return created;
  }

  public updateMilestone(
    id: string,
    updates: Partial<MilestoneInput> & { expectedVersion: number },
    actorId?: string,
    actorEmail?: string
  ): any {
    const existing = this.getMilestoneById(id);
    if (!existing) throw new Error(`Milestone not found: ${id}`);

    if (existing.version !== updates.expectedVersion) {
      throw new Error(`Concurrency conflict: Milestone modified concurrently.`);
    }

    const nextTitle = updates.title !== undefined ? updates.title : existing.title;
    const nextCat = updates.category !== undefined ? updates.category : existing.category;
    const nextBase = updates.baselineState !== undefined ? updates.baselineState : existing.baseline_state;
    const nextTarg = updates.targetState !== undefined ? updates.targetState : existing.target_state;
    const nextDue = updates.targetDueDate !== undefined ? updates.targetDueDate : existing.target_due_date;
    const nextComp = updates.completionDate !== undefined ? updates.completionDate : existing.completion_date;
    const nextStat = updates.status !== undefined ? updates.status : existing.status;
    const nextNotes = updates.verificationNotes !== undefined ? updates.verificationNotes : existing.verification_notes;

    const stmt = this.db.prepare(`
      UPDATE startup_milestones SET
        title = ?,
        category = ?,
        baseline_state = ?,
        target_state = ?,
        target_due_date = ?,
        completion_date = ?,
        status = ?,
        verification_notes = ?,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?
    `);

    const res = stmt.run(
      nextTitle, nextCat, nextBase, nextTarg, nextDue, nextComp, nextStat, nextNotes,
      existing.id, updates.expectedVersion
    );

    if (res.changes === 0) {
      throw new Error('Failed to update milestone: Concurrency conflict.');
    }

    const updated = this.getMilestoneById(existing.id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE_MILESTONE',
      entityType: 'STARTUP_MILESTONE',
      entityId: existing.id,
      entityDisplayCode: existing.milestone_code,
      oldValue: existing,
      newValue: updated,
      reason: `Updated milestone status to ${nextStat}`
    });

    return updated;
  }

  public getMilestoneById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT m.*, s.legal_name as startup_legal_name, s.aiif_startup_id
      FROM startup_milestones m
      JOIN startup_masters s ON m.startup_id = s.id
      WHERE (m.id = ? OR m.milestone_code = ?) AND m.deleted_at IS NULL
    `).get(idOrCode, idOrCode);
  }

  public getMilestonesByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT m.*, s.legal_name as startup_legal_name, s.aiif_startup_id
      FROM startup_milestones m
      JOIN startup_masters s ON m.startup_id = s.id
      WHERE (s.id = ? OR s.aiif_startup_id = ?) AND m.deleted_at IS NULL
      ORDER BY m.target_due_date ASC
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }
}
