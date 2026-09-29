import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface FounderInput {
  startupId: string;
  fullName: string;
  designation?: string;
  email: string;
  phone: string;
  dinNumber?: string;
  ownershipPercentage?: number;
  profileSummary?: string;
  linkedinUrl?: string;
  isPrimaryContact?: boolean;
}

export class FounderService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createFounder(input: FounderInput, actorId?: string, actorEmail?: string): any {
    // Validate startup existence
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) {
      throw new Error(`Invalid startup ID: ${input.startupId}`);
    }

    const id = randomUUID();
    const founderCode = this.idGen.generateId({ prefix: 'FND' });

    const stmt = this.db.prepare(`
      INSERT INTO founder_profiles (
        id, founder_code, startup_id, full_name, designation,
        email, phone, din_number, ownership_percentage, profile_summary,
        linkedin_url, is_primary_contact, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      founderCode,
      input.startupId,
      input.fullName,
      input.designation || 'Founder & CEO',
      input.email,
      input.phone,
      input.dinNumber || null,
      input.ownershipPercentage || 0,
      input.profileSummary || null,
      input.linkedinUrl || null,
      input.isPrimaryContact ? 1 : 0
    );

    const created = this.getFounderById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_FOUNDER',
      entityType: 'FOUNDER_PROFILE',
      entityId: id,
      entityDisplayCode: founderCode,
      newValue: created,
      reason: `Added founder ${input.fullName} to startup ${startup.aiif_startup_id}`
    });

    return created;
  }

  public getFounderById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT f.*, s.legal_name as startup_legal_name, s.aiif_startup_id
      FROM founder_profiles f
      JOIN startup_masters s ON f.startup_id = s.id
      WHERE (f.id = ? OR f.founder_code = ?) AND f.deleted_at IS NULL
    `).get(idOrCode, idOrCode);
  }

  public getFoundersByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT f.*, s.legal_name as startup_legal_name, s.aiif_startup_id
      FROM founder_profiles f
      JOIN startup_masters s ON f.startup_id = s.id
      WHERE (s.id = ? OR s.aiif_startup_id = ?) AND f.deleted_at IS NULL
      ORDER BY f.is_primary_contact DESC, f.created_at ASC
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }

  public updateFounder(
    id: string,
    updates: Partial<FounderInput> & { expectedVersion: number },
    actorId?: string,
    actorEmail?: string
  ): any {
    const existing = this.getFounderById(id);
    if (!existing) {
      throw new Error(`Founder not found: ${id}`);
    }

    if (existing.version !== updates.expectedVersion) {
      throw new Error(`Concurrency conflict on founder record. Expected version ${updates.expectedVersion}, got ${existing.version}.`);
    }

    const nextName = updates.fullName !== undefined ? updates.fullName : existing.full_name;
    const nextDesig = updates.designation !== undefined ? updates.designation : existing.designation;
    const nextEmail = updates.email !== undefined ? updates.email : existing.email;
    const nextPhone = updates.phone !== undefined ? updates.phone : existing.phone;
    const nextDin = updates.dinNumber !== undefined ? updates.dinNumber : existing.din_number;
    const nextOwnership = updates.ownershipPercentage !== undefined ? updates.ownershipPercentage : existing.ownership_percentage;
    const nextProfile = updates.profileSummary !== undefined ? updates.profileSummary : existing.profile_summary;
    const nextLinkedin = updates.linkedinUrl !== undefined ? updates.linkedinUrl : existing.linkedin_url;
    const nextPrimary = updates.isPrimaryContact !== undefined ? (updates.isPrimaryContact ? 1 : 0) : existing.is_primary_contact;

    const stmt = this.db.prepare(`
      UPDATE founder_profiles SET
        full_name = ?,
        designation = ?,
        email = ?,
        phone = ?,
        din_number = ?,
        ownership_percentage = ?,
        profile_summary = ?,
        linkedin_url = ?,
        is_primary_contact = ?,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?
    `);

    const res = stmt.run(
      nextName, nextDesig, nextEmail, nextPhone, nextDin,
      nextOwnership, nextProfile, nextLinkedin, nextPrimary,
      existing.id, updates.expectedVersion
    );

    if (res.changes === 0) {
      throw new Error(`Failed to update founder: Concurrency conflict`);
    }

    const updated = this.getFounderById(existing.id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE_FOUNDER',
      entityType: 'FOUNDER_PROFILE',
      entityId: existing.id,
      entityDisplayCode: existing.founder_code,
      oldValue: existing,
      newValue: updated,
      reason: 'Updated founder profile'
    });

    return updated;
  }
}
