import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface TalentInput {
  fullName: string;
  gender: 'Male' | 'Female' | 'Other';
  email: string;
  phone: string;
  deptCode: string;
  programmeName: string;
  academicYear: string;
  admissionNumber?: string;
}

export interface BatchImportResult {
  submitted: number;
  created: number;
  updated: number;
  skipped: number;
  rejected: number;
  duplicates: number;
  errors: Array<{ row: number; reason: string; data: any }>;
  finalDatabaseCount: number;
}

export class TalentService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createTalent(input: TalentInput, actorId?: string, actorEmail?: string): any {
    const id = randomUUID();
    const studentCode = this.idGen.generateId({ prefix: 'STU' });

    const stmt = this.db.prepare(`
      INSERT INTO student_talent_profiles (
        id, student_code, full_name, gender, email, phone,
        dept_code, programme_name, academic_year, admission_number, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      studentCode,
      input.fullName,
      input.gender,
      input.email,
      input.phone,
      input.deptCode,
      input.programmeName,
      input.academicYear,
      input.admissionNumber || null
    );

    const created = this.getTalentById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_STUDENT',
      entityType: 'STUDENT_TALENT',
      entityId: id,
      entityDisplayCode: studentCode,
      newValue: created,
      reason: 'Created student talent record'
    });

    return created;
  }

  public getTalentById(idOrCode: string, includeDeleted = false): any {
    const sql = `
      SELECT s.*, d.dept_name
      FROM student_talent_profiles s
      LEFT JOIN master_departments d ON s.dept_code = d.dept_code
      WHERE (s.id = ? OR s.student_code = ?)
      ${includeDeleted ? '' : 'AND s.deleted_at IS NULL'}
    `;
    return this.db.prepare(sql).get(idOrCode, idOrCode);
  }

  public updateTalent(
    idOrCode: string,
    updates: Partial<TalentInput> & { expectedVersion: number },
    actorId?: string,
    actorEmail?: string
  ): any {
    const existing = this.getTalentById(idOrCode);
    if (!existing) {
      throw new Error(`Student not found: ${idOrCode}`);
    }

    if (existing.version !== updates.expectedVersion) {
      throw new Error(`Concurrency conflict: Student record modified concurrently. Expected version ${updates.expectedVersion}, found ${existing.version}.`);
    }

    const nextName = updates.fullName !== undefined ? updates.fullName : existing.full_name;
    const nextGender = updates.gender !== undefined ? updates.gender : existing.gender;
    const nextEmail = updates.email !== undefined ? updates.email : existing.email;
    const nextPhone = updates.phone !== undefined ? updates.phone : existing.phone;
    const nextDept = updates.deptCode !== undefined ? updates.deptCode : existing.dept_code;
    const nextProg = updates.programmeName !== undefined ? updates.programmeName : existing.programme_name;
    const nextYear = updates.academicYear !== undefined ? updates.academicYear : existing.academic_year;
    const nextAdm = updates.admissionNumber !== undefined ? updates.admissionNumber : existing.admission_number;

    const stmt = this.db.prepare(`
      UPDATE student_talent_profiles SET
        full_name = ?,
        gender = ?,
        email = ?,
        phone = ?,
        dept_code = ?,
        programme_name = ?,
        academic_year = ?,
        admission_number = ?,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?
    `);

    const res = stmt.run(
      nextName, nextGender, nextEmail, nextPhone,
      nextDept, nextProg, nextYear, nextAdm,
      existing.id, updates.expectedVersion
    );

    if (res.changes === 0) {
      throw new Error(`Failed to update student: optimistic concurrency failure.`);
    }

    const updated = this.getTalentById(existing.id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE_STUDENT',
      entityType: 'STUDENT_TALENT',
      entityId: existing.id,
      entityDisplayCode: existing.student_code,
      oldValue: existing,
      newValue: updated,
      reason: 'Updated student profile'
    });

    return updated;
  }

  public softDeleteTalent(idOrCode: string, actorId: string, actorEmail: string, reason: string): boolean {
    const existing = this.getTalentById(idOrCode);
    if (!existing) {
      throw new Error(`Student not found: ${idOrCode}`);
    }

    const stmt = this.db.prepare(`
      UPDATE student_talent_profiles SET
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
      action: 'ARCHIVE_STUDENT',
      entityType: 'STUDENT_TALENT',
      entityId: existing.id,
      entityDisplayCode: existing.student_code,
      oldValue: existing,
      reason: reason
    });

    return res.changes > 0;
  }

  public restoreTalent(idOrCode: string, actorId: string, actorEmail: string, reason: string): boolean {
    const existing = this.getTalentById(idOrCode, true);
    if (!existing) {
      throw new Error(`Student not found: ${idOrCode}`);
    }

    const stmt = this.db.prepare(`
      UPDATE student_talent_profiles SET
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
      action: 'RESTORE_STUDENT',
      entityType: 'STUDENT_TALENT',
      entityId: existing.id,
      entityDisplayCode: existing.student_code,
      newValue: this.getTalentById(existing.id),
      reason: reason
    });

    return res.changes > 0;
  }

  public listTalent(sortBy: 'name' | 'gender' | 'email' | 'department' | 'year' = 'name', sortOrder: 'ASC' | 'DESC' = 'ASC') {
    let orderClause = 's.full_name';
    if (sortBy === 'gender') orderClause = 's.gender';
    if (sortBy === 'email') orderClause = 's.email';
    if (sortBy === 'department') orderClause = 's.dept_code';
    if (sortBy === 'year') orderClause = 's.academic_year';

    const sql = `
      SELECT s.*, d.dept_name
      FROM student_talent_profiles s
      LEFT JOIN master_departments d ON s.dept_code = d.dept_code
      WHERE s.deleted_at IS NULL
      ORDER BY ${orderClause} ${sortOrder}
    `;

    return this.db.prepare(sql).all();
  }

  public importBatchTransactional(
    records: TalentInput[],
    actorId?: string,
    actorEmail?: string,
    policy: 'ATOMIC_ALL_OR_NOTHING' | 'SKIP_INVALID' = 'ATOMIC_ALL_OR_NOTHING'
  ): BatchImportResult {
    const result: BatchImportResult = {
      submitted: records.length,
      created: 0,
      updated: 0,
      skipped: 0,
      rejected: 0,
      duplicates: 0,
      errors: [],
      finalDatabaseCount: 0
    };

    const validDepts = new Set((this.db.prepare('SELECT dept_code FROM master_departments').all() as any[]).map(r => r.dept_code));
    const seenEmailsInBatch = new Set<string>();

    // Pre-validation pass
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const rowNum = i + 1;

      if (!rec.fullName || !rec.email || !rec.phone || !rec.deptCode || !rec.gender || !rec.programmeName || !rec.academicYear) {
        result.errors.push({ row: rowNum, reason: 'Missing mandatory fields', data: rec });
        result.rejected++;
        continue;
      }

      if (!validDepts.has(rec.deptCode)) {
        result.errors.push({ row: rowNum, reason: `Invalid department code: ${rec.deptCode}`, data: rec });
        result.rejected++;
        continue;
      }

      if (seenEmailsInBatch.has(rec.email.toLowerCase())) {
        result.errors.push({ row: rowNum, reason: `Duplicate email within batch: ${rec.email}`, data: rec });
        result.duplicates++;
        result.rejected++;
        continue;
      }
      seenEmailsInBatch.add(rec.email.toLowerCase());

      const existingDb = this.db.prepare('SELECT id FROM student_talent_profiles WHERE email = ?').get(rec.email);
      if (existingDb) {
        result.duplicates++;
        result.skipped++;
      }
    }

    if (policy === 'ATOMIC_ALL_OR_NOTHING' && result.errors.length > 0) {
      // Reconcile and return without inserting
      const totalCountRow = this.db.prepare('SELECT COUNT(*) as cnt FROM student_talent_profiles WHERE deleted_at IS NULL').get() as { cnt: number };
      result.finalDatabaseCount = totalCountRow.cnt;
      return result;
    }

    // Execute transactional insertion
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const insertStmt = this.db.prepare(`
        INSERT INTO student_talent_profiles (
          id, student_code, full_name, gender, email, phone,
          dept_code, programme_name, academic_year, admission_number, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const existing = this.db.prepare('SELECT id FROM student_talent_profiles WHERE email = ?').get(rec.email);
        if (existing) {
          continue;
        }

        const id = randomUUID();
        const code = this.idGen.generateId({ prefix: 'STU' });

        insertStmt.run(
          id, code, rec.fullName, rec.gender, rec.email,
          rec.phone, rec.deptCode, rec.programmeName, rec.academicYear,
          rec.admissionNumber || null
        );
        result.created++;
      }

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    const finalRow = this.db.prepare('SELECT COUNT(*) as cnt FROM student_talent_profiles WHERE deleted_at IS NULL').get() as { cnt: number };
    result.finalDatabaseCount = finalRow.cnt;

    return result;
  }
}
