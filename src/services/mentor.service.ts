import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface MentorInput {
  fullName: string;
  primaryDomain: string;
  organization?: string;
  designation?: string;
  email: string;
  phone?: string;
  linkedinUrl?: string;
  expertiseTags?: string[];
  userAccountId?: string;
}

export interface MentorSessionInput {
  startupId: string;
  mentorId: string;
  sessionDate: string;
  durationMinutes?: number;
  topicsDiscussed: string;
  adviceActionItems: string;
  founderCommitments: string;
  mentorRecommendations?: string;
  nextMeetingDate?: string;
}

export class MentorService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createMentor(input: MentorInput, actorId?: string, actorEmail?: string): any {
    const id = randomUUID();
    const mentorCode = this.idGen.generateId({ prefix: 'MNT' });

    const stmt = this.db.prepare(`
      INSERT INTO mentor_profiles (
        id, mentor_code, user_account_id, full_name, primary_domain,
        organization, designation, email, phone, linkedin_url,
        expertise_tags, is_active, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
    `);

    stmt.run(
      id,
      mentorCode,
      input.userAccountId || null,
      input.fullName,
      input.primaryDomain,
      input.organization || null,
      input.designation || null,
      input.email,
      input.phone || null,
      input.linkedinUrl || null,
      input.expertiseTags ? JSON.stringify(input.expertiseTags) : null
    );

    const created = this.getMentorById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_MENTOR',
      entityType: 'MENTOR_PROFILE',
      entityId: id,
      entityDisplayCode: mentorCode,
      newValue: created,
      reason: `Registered mentor profile for ${input.fullName}`
    });

    return created;
  }

  public assignMentorToStartup(
    startupId: string,
    mentorId: string,
    objectives: string,
    actorId: string,
    actorEmail?: string
  ): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(startupId) as any;
    if (!startup) throw new Error(`Startup not found: ${startupId}`);

    const mentor = this.db.prepare('SELECT id, mentor_code, full_name FROM mentor_profiles WHERE id = ?').get(mentorId) as any;
    if (!mentor) throw new Error(`Mentor not found: ${mentorId}`);

    const id = randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    const stmt = this.db.prepare(`
      INSERT INTO mentor_assignments (
        id, startup_id, mentor_id, assigned_date, objectives, status, assigned_by, version
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, 1)
      ON CONFLICT(startup_id, mentor_id) DO UPDATE SET
        status = 'ACTIVE',
        objectives = excluded.objectives,
        assigned_date = excluded.assigned_date,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP;
    `);

    stmt.run(id, startupId, mentorId, today, objectives, actorId);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'ASSIGN_MENTOR',
      entityType: 'MENTOR_ASSIGNMENT',
      entityId: id,
      entityDisplayCode: `${startup.aiif_startup_id} <-> ${mentor.mentor_code}`,
      reason: `Assigned mentor ${mentor.full_name} to ${startup.aiif_startup_id}`
    });

    return this.getAssignmentsByStartup(startupId);
  }

  public recordSession(input: MentorSessionInput, actorId?: string, actorEmail?: string): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) throw new Error(`Startup not found: ${input.startupId}`);

    const mentor = this.db.prepare('SELECT id, mentor_code, full_name FROM mentor_profiles WHERE id = ?').get(input.mentorId) as any;
    if (!mentor) throw new Error(`Mentor not found: ${input.mentorId}`);

    const id = randomUUID();
    const sessionCode = this.idGen.generateId({ prefix: 'SES' });

    const stmt = this.db.prepare(`
      INSERT INTO mentor_sessions (
        id, session_code, startup_id, mentor_id, session_date,
        duration_minutes, topics_discussed, advice_action_items,
        founder_commitments, mentor_recommendations, next_meeting_date, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      sessionCode,
      input.startupId,
      input.mentorId,
      input.sessionDate,
      input.durationMinutes || 60,
      input.topicsDiscussed,
      input.adviceActionItems,
      input.founderCommitments,
      input.mentorRecommendations || null,
      input.nextMeetingDate || null
    );

    const created = this.getSessionById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'RECORD_MENTOR_SESSION',
      entityType: 'MENTOR_SESSION',
      entityId: id,
      entityDisplayCode: sessionCode,
      newValue: created,
      reason: `Recorded mentorship session between ${mentor.full_name} and ${startup.aiif_startup_id}`
    });

    return created;
  }

  public getMentorById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT * FROM mentor_profiles WHERE id = ? OR mentor_code = ?
    `).get(idOrCode, idOrCode);
  }

  public listMentors() {
    return this.db.prepare(`
      SELECT m.*, COUNT(a.startup_id) as active_startups_count
      FROM mentor_profiles m
      LEFT JOIN mentor_assignments a ON m.id = a.mentor_id AND a.status = 'ACTIVE'
      WHERE m.is_active = 1
      GROUP BY m.id
      ORDER BY m.full_name ASC
    `).all();
  }

  public getAssignmentsByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT a.*, m.mentor_code, m.full_name as mentor_name, m.primary_domain, m.organization, m.email
      FROM mentor_assignments a
      JOIN mentor_profiles m ON a.mentor_id = m.id
      JOIN startup_masters s ON a.startup_id = s.id
      WHERE s.id = ? OR s.aiif_startup_id = ?
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }

  public getSessionById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT ses.*, m.full_name as mentor_name, s.legal_name as startup_legal_name, s.aiif_startup_id
      FROM mentor_sessions ses
      JOIN mentor_profiles m ON ses.mentor_id = m.id
      JOIN startup_masters s ON ses.startup_id = s.id
      WHERE ses.id = ? OR ses.session_code = ?
    `).get(idOrCode, idOrCode);
  }

  public getSessionsByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT ses.*, m.full_name as mentor_name, s.legal_name as startup_legal_name, s.aiif_startup_id
      FROM mentor_sessions ses
      JOIN mentor_profiles m ON ses.mentor_id = m.id
      JOIN startup_masters s ON ses.startup_id = s.id
      WHERE s.id = ? OR s.aiif_startup_id = ?
      ORDER BY ses.session_date DESC
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }
}
