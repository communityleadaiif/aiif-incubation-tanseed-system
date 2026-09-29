import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface CommitteeMeetingInput {
  meetingDate: string;
  meetingVenue?: string;
  membersPresent: Array<{ name: string; designation: string; role: string }>;
  agendaSummary: string;
  officialMinutes: string;
  createdBy: string;
}

export interface CommitteeDecisionInput {
  meetingId: string;
  startupId: string;
  evaluationId?: string;
  decision: 'APPROVED' | 'APPROVED_WITH_CONDITIONS' | 'DEFERRED' | 'REJECTED';
  formalResolutionText: string;
  conditionsSpecified?: string;
  effectiveAdmissionDate?: string;
  signedByChairperson?: string;
}

export class CommitteeService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createMeeting(input: CommitteeMeetingInput, actorId?: string, actorEmail?: string): any {
    const id = randomUUID();
    const meetingCode = this.idGen.generateId({ prefix: 'COM', format: 'COMMITTEE' });

    const stmt = this.db.prepare(`
      INSERT INTO committee_meetings (
        id, meeting_code, meeting_date, meeting_venue,
        committee_members_present, agenda_summary, official_minutes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      meetingCode,
      input.meetingDate,
      input.meetingVenue || 'AIIF Boardroom / Hybrid',
      JSON.stringify(input.membersPresent),
      input.agendaSummary,
      input.officialMinutes,
      input.createdBy
    );

    const created = this.getMeetingById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_COMMITTEE_MEETING',
      entityType: 'COMMITTEE_MEETING',
      entityId: id,
      entityDisplayCode: meetingCode,
      newValue: created,
      reason: `Convened committee meeting on ${input.meetingDate}`
    });

    return created;
  }

  public recordDecision(input: CommitteeDecisionInput, actorId?: string, actorEmail?: string): any {
    const meeting = this.db.prepare('SELECT id, meeting_code FROM committee_meetings WHERE id = ?').get(input.meetingId) as any;
    if (!meeting) {
      throw new Error(`Committee meeting not found: ${input.meetingId}`);
    }

    const startup = this.db.prepare('SELECT id, aiif_startup_id, legal_name FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) {
      throw new Error(`Startup not found: ${input.startupId}`);
    }

    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO committee_decisions (
        id, meeting_id, startup_id, evaluation_id, decision,
        formal_resolution_text, conditions_specified,
        effective_admission_date, signed_by_chairperson, signed_timestamp, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const signedTimestamp = input.signedByChairperson ? new Date().toISOString() : null;

    stmt.run(
      id,
      input.meetingId,
      input.startupId,
      input.evaluationId || null,
      input.decision,
      input.formalResolutionText,
      input.conditionsSpecified || null,
      input.effectiveAdmissionDate || null,
      input.signedByChairperson || null,
      signedTimestamp
    );

    // If approved, transition startup status to APPROVED
    if (input.decision === 'APPROVED' || input.decision === 'APPROVED_WITH_CONDITIONS') {
      this.db.prepare(`
        UPDATE startup_masters SET 
          incubation_status = 'APPROVED',
          formal_admission_date = ?,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.effectiveAdmissionDate || null, input.startupId);
    } else if (input.decision === 'REJECTED') {
      this.db.prepare(`
        UPDATE startup_masters SET 
          incubation_status = 'REJECTED',
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.startupId);
    }

    const created = this.getDecisionById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'RECORD_COMMITTEE_DECISION',
      entityType: 'COMMITTEE_DECISION',
      entityId: id,
      entityDisplayCode: meeting.meeting_code,
      newValue: created,
      reason: `Recorded resolution: ${input.decision} for ${startup.aiif_startup_id}`
    });

    return created;
  }

  public getMeetingById(idOrCode: string): any {
    const row = this.db.prepare(`
      SELECT m.*, u.full_name as created_by_name
      FROM committee_meetings m
      JOIN user_accounts u ON m.created_by = u.id
      WHERE m.id = ? OR m.meeting_code = ?
    `).get(idOrCode, idOrCode) as any;

    if (row && row.committee_members_present) {
      try {
        row.members = JSON.parse(row.committee_members_present);
      } catch {
        row.members = [];
      }
    }
    return row;
  }

  public getDecisionById(id: string): any {
    return this.db.prepare(`
      SELECT d.*, m.meeting_code, m.meeting_date, s.legal_name as startup_legal_name, s.aiif_startup_id
      FROM committee_decisions d
      JOIN committee_meetings m ON d.meeting_id = m.id
      JOIN startup_masters s ON d.startup_id = s.id
      WHERE d.id = ?
    `).get(id);
  }

  public getDecisionsByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT d.*, m.meeting_code, m.meeting_date, s.legal_name as startup_legal_name, s.aiif_startup_id
      FROM committee_decisions d
      JOIN committee_meetings m ON d.meeting_id = m.id
      JOIN startup_masters s ON d.startup_id = s.id
      WHERE s.id = ? OR s.aiif_startup_id = ?
      ORDER BY m.meeting_date DESC
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }
}
