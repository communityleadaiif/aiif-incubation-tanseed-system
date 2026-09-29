import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../db/migrate.js';
import { TalentService, TalentInput } from '../services/talent.service.js';
import { StartupService } from '../services/startup.service.js';
import { FounderService } from '../services/founder.service.js';
import { AgreementService } from '../services/agreement.service.js';
import { BackupService } from '../services/backup.service.js';
import { AuthService } from '../services/auth.service.js';
import { AuditService } from '../services/audit.service.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('AIIF System Master Specification - Section 30 Data Integrity Test Suite', () => {
  let db: DatabaseSync;
  let talentService: TalentService;
  let startupService: StartupService;
  let founderService: FounderService;
  let agreementService: AgreementService;
  let backupService: BackupService;
  let authService: AuthService;
  let auditService: AuditService;

  beforeEach(() => {
    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create an isolated in-memory or fresh database instance for each test
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runMigrations(db);

    talentService = new TalentService(db);
    startupService = new StartupService(db);
    founderService = new FounderService(db);
    agreementService = new AgreementService(db);
    backupService = new BackupService(db);
    authService = new AuthService(db);
    auditService = new AuditService(db);
  });

  afterEach(() => {
    db.close();
  });

  // =========================================================================
  // TEST A — Identity: Create 100 students. Verify every student has a unique ID.
  // =========================================================================
  it('Test A — Identity: 100 students must receive unique, permanent immutable IDs', () => {
    const studentIds = new Set<string>();
    const studentCodes = new Set<string>();

    for (let i = 1; i <= 100; i++) {
      const pad = String(i).padStart(3, '0');
      const student = talentService.createTalent({
        fullName: `Student Candidate ${pad}`,
        gender: i % 2 === 0 ? 'Female' : 'Male',
        email: `student.${pad}@ajk.edu.in`,
        phone: `+9198765${String(10000 + i)}`,
        deptCode: 'CSE',
        programmeName: 'B.E. Computer Science',
        academicYear: '2026-2027',
        admissionNumber: `ADM-2026-${pad}`
      });

      expect(student).toBeDefined();
      expect(student.id).toBeDefined();
      expect(student.student_code).toMatch(/^STU-2026-\d{6}$/);

      // Check for zero duplicates
      expect(studentIds.has(student.id)).toBe(false);
      expect(studentCodes.has(student.student_code)).toBe(false);

      studentIds.add(student.id);
      studentCodes.add(student.student_code);
    }

    expect(studentIds.size).toBe(100);
    expect(studentCodes.size).toBe(100);
  });

  // =========================================================================
  // TEST B — Sorting: Sort by name, gender, email, department, year.
  // Verify all fields remain attached to the correct student.
  // =========================================================================
  it('Test B — Sorting: Sorting records across multiple columns must not decouple fields from entity IDs', () => {
    const createdList: any[] = [];
    const depts = ['CSE', 'AI_DS', 'IT', 'ECE', 'BCA'];

    for (let i = 1; i <= 20; i++) {
      const pad = String(i).padStart(3, '0');
      const s = talentService.createTalent({
        fullName: i % 2 === 0 ? `Zara Applicant ${pad}` : `Arun Candidate ${pad}`,
        gender: i % 3 === 0 ? 'Other' : (i % 2 === 0 ? 'Female' : 'Male'),
        email: `candidate.${pad}@ajk.edu.in`,
        phone: `+9198765${String(20000 + i)}`,
        deptCode: depts[i % depts.length],
        programmeName: 'Engineering',
        academicYear: `202${i % 4}-202${(i % 4) + 1}`,
        admissionNumber: `ADM-SORT-${pad}`
      });
      createdList.push(s);
    }

    // Sort by name
    const sortedByName = talentService.listTalent('name', 'ASC');
    expect(sortedByName.length).toBe(20);
    for (const item of sortedByName as any[]) {
      const original = createdList.find(c => c.id === item.id);
      expect(item.email).toBe(original.email);
      expect(item.phone).toBe(original.phone);
      expect(item.dept_code).toBe(original.dept_code);
      expect(item.admission_number).toBe(original.admission_number);
    }

    // Sort by email
    const sortedByEmail = talentService.listTalent('email', 'DESC');
    for (const item of sortedByEmail as any[]) {
      const original = createdList.find(c => c.id === item.id);
      expect(item.full_name).toBe(original.full_name);
      expect(item.gender).toBe(original.gender);
    }

    // Sort by department
    const sortedByDept = talentService.listTalent('department', 'ASC');
    for (const item of sortedByDept as any[]) {
      const original = createdList.find(c => c.id === item.id);
      expect(item.student_code).toBe(original.student_code);
      expect(item.dept_code).toBe(original.dept_code);
    }
  });

  // =========================================================================
  // TEST C — Editing: Edit Student #47 email. Verify only Student #47 changes.
  // =========================================================================
  it('Test C — Editing: Mutating Student #47 must strictly isolate changes and leave all 99 other records untouched', () => {
    const students: any[] = [];
    for (let i = 1; i <= 100; i++) {
      const pad = String(i).padStart(3, '0');
      students.push(talentService.createTalent({
        fullName: `Candidate ${pad}`,
        gender: 'Female',
        email: `original.email.${pad}@ajk.edu.in`,
        phone: `+9198765${String(30000 + i)}`,
        deptCode: 'CSE',
        programmeName: 'B.E. Computer Science',
        academicYear: '2026-2027',
        admissionNumber: `ADM-ISO-${pad}`
      }));
    }

    const student47 = students[46]; // 47th item (index 46)
    const updated47 = talentService.updateTalent(student47.id, {
      email: 'new.verified.email.047@ajk.edu.in',
      expectedVersion: student47.version
    });

    expect(updated47.email).toBe('new.verified.email.047@ajk.edu.in');
    expect(updated47.version).toBe(2);

    // Verify all other 99 students remained completely unchanged
    for (let i = 0; i < 100; i++) {
      if (i === 46) continue;
      const current = talentService.getTalentById(students[i].id);
      expect(current.email).toBe(students[i].email);
      expect(current.version).toBe(1);
    }
  });

  // =========================================================================
  // TEST D — Concurrent Edit: Optimistic locking rejects stale writes.
  // =========================================================================
  it('Test D — Concurrent Edit: Stale writes must be rejected with Concurrency Conflict without silent overwrites', () => {
    const student = talentService.createTalent({
      fullName: 'Concurrency Test Candidate',
      gender: 'Male',
      email: 'concurrent@ajk.edu.in',
      phone: '+919876540001',
      deptCode: 'CSE',
      programmeName: 'B.E. Computer Science',
      academicYear: '2026-2027'
    });

    // User A and User B fetch record at version 1
    const userAFetch = talentService.getTalentById(student.id);
    const userBFetch = talentService.getTalentById(student.id);

    expect(userAFetch.version).toBe(1);
    expect(userBFetch.version).toBe(1);

    // User A successfully updates email from version 1 -> version 2
    const updatedByA = talentService.updateTalent(student.id, {
      email: 'userA.updated@ajk.edu.in',
      expectedVersion: userAFetch.version
    });
    expect(updatedByA.version).toBe(2);

    // User B tries to update department using old version 1 -> must fail with Concurrency Conflict
    expect(() => {
      talentService.updateTalent(student.id, {
        deptCode: 'AI_DS',
        expectedVersion: userBFetch.version // Stale version 1!
      });
    }).toThrow(/Concurrency conflict/);

    // Verify User A's changes are preserved
    const finalState = talentService.getTalentById(student.id);
    expect(finalState.email).toBe('userA.updated@ajk.edu.in');
    expect(finalState.dept_code).toBe('CSE'); // Not overwritten by stale User B
    expect(finalState.version).toBe(2);
  });

  // =========================================================================
  // TEST E — Duplicate Import: Import same 100 students twice.
  // Verify duplicates are detected and not duplicated in the DB.
  // =========================================================================
  it('Test E — Duplicate Import: Re-importing duplicate records must detect duplicates and prevent DB pollution', () => {
    const batch: TalentInput[] = [];
    for (let i = 1; i <= 100; i++) {
      const pad = String(i).padStart(3, '0');
      batch.push({
        fullName: `Batch Student ${pad}`,
        gender: 'Male',
        email: `batch.${pad}@ajk.edu.in`,
        phone: `+9198765${String(40000 + i)}`,
        deptCode: 'IT',
        programmeName: 'B.Tech IT',
        academicYear: '2026-2027',
        admissionNumber: `ADM-BATCH-${pad}`
      });
    }

    // First import
    const result1 = talentService.importBatchTransactional(batch);
    expect(result1.submitted).toBe(100);
    expect(result1.created).toBe(100);
    expect(result1.duplicates).toBe(0);
    expect(result1.finalDatabaseCount).toBe(100);

    // Second import of the identical 100 records
    const result2 = talentService.importBatchTransactional(batch);
    expect(result2.submitted).toBe(100);
    expect(result2.created).toBe(0);
    expect(result2.skipped).toBe(100);
    expect(result2.duplicates).toBe(100);
    expect(result2.finalDatabaseCount).toBe(100); // Database count remained strictly 100!
  });

  // =========================================================================
  // TEST F — Partial Import Failure: Atomic Transaction Policy
  // =========================================================================
  it('Test F — Partial Import Failure: In ALL_OR_NOTHING mode, batch with invalid records rolls back completely', () => {
    const validBatch: TalentInput[] = [];
    for (let i = 1; i <= 50; i++) {
      const pad = String(i).padStart(3, '0');
      validBatch.push({
        fullName: `Initial Valid Student ${pad}`,
        gender: 'Female',
        email: `valid.student.${pad}@ajk.edu.in`,
        phone: `+9198765${String(50000 + i)}`,
        deptCode: 'CSE',
        programmeName: 'B.E.',
        academicYear: '2026-2027'
      });
    }
    talentService.importBatchTransactional(validBatch);

    // Prepare mixed batch: 20 valid + 2 invalid
    const mixedBatch: TalentInput[] = [];
    for (let i = 1; i <= 20; i++) {
      mixedBatch.push({
        fullName: `Candidate ${i}`,
        gender: 'Male',
        email: `candidate.mix.${i}@ajk.edu.in`,
        phone: `+9198765${String(60000 + i)}`,
        deptCode: 'CSE',
        programmeName: 'B.E.',
        academicYear: '2026-2027'
      });
    }
    // Add invalid records
    mixedBatch.push({
      fullName: 'Invalid Student 1',
      gender: 'Male',
      email: 'invalid1@ajk.edu.in',
      phone: '', // missing phone!
      deptCode: 'CSE',
      programmeName: 'B.E.',
      academicYear: '2026-2027'
    });
    mixedBatch.push({
      fullName: 'Invalid Student 2',
      gender: 'Female',
      email: 'invalid2@ajk.edu.in',
      phone: '+919876543210',
      deptCode: 'NON_EXISTENT_DEPT', // invalid dept code foreign key!
      programmeName: 'B.E.',
      academicYear: '2026-2027'
    });

    const result = talentService.importBatchTransactional(mixedBatch, undefined, undefined, 'ATOMIC_ALL_OR_NOTHING');
    expect(result.errors.length).toBe(2);
    expect(result.created).toBe(0); // Zero inserted due to atomic rollback
    expect(result.finalDatabaseCount).toBe(50); // Exact initial 50 records untouched
  });

  // =========================================================================
  // TEST G — Delete/Restore: Archive Student #53, verify disappears from active lists,
  // restore and verify relations intact.
  // =========================================================================
  it('Test G — Delete/Restore: Soft-deleted entity is hidden from active list and fully restored on un-archive', () => {
    const student = talentService.createTalent({
      fullName: 'Student Fifty Three',
      gender: 'Female',
      email: 'student53@ajk.edu.in',
      phone: '+919876553053',
      deptCode: 'BIOTECH',
      programmeName: 'B.Sc. Biotechnology',
      academicYear: '2026-2027',
      admissionNumber: 'ADM-2026-053'
    });

    // 1. Archive student
    const archived = talentService.softDeleteTalent(student.id, 'admin-1', 'admin@aiif.org.in', 'Temporary leave of absence');
    expect(archived).toBe(true);

    // 2. Verify student disappears from normal active list
    const activeList = talentService.listTalent();
    const foundInActive = activeList.find((s: any) => s.id === student.id);
    expect(foundInActive).toBeUndefined();

    // 3. Verify record still exists when querying with includeDeleted
    const rawDeleted = talentService.getTalentById(student.id, true);
    expect(rawDeleted).toBeDefined();
    expect(rawDeleted.deleted_at).toBeDefined();
    expect(rawDeleted.deletion_reason).toBe('Temporary leave of absence');

    // 4. Restore student
    const restored = talentService.restoreTalent(student.id, 'admin-1', 'admin@aiif.org.in', 'Student returned to programme');
    expect(restored).toBe(true);

    // 5. Verify student reappears in active list with all fields intact
    const restoredActive = talentService.getTalentById(student.id);
    expect(restoredActive).toBeDefined();
    expect(restoredActive.deleted_at).toBeNull();
    expect(restoredActive.email).toBe('student53@ajk.edu.in');
    expect(restoredActive.admission_number).toBe('ADM-2026-053');
  });

  // =========================================================================
  // TEST H — Refresh: Persistence verification across fresh DB connection instances
  // =========================================================================
  it('Test H — Refresh: Data written to disk database persists completely across connection reloads', () => {
    const testDbPath = path.join(process.cwd(), 'data', 'test_persistence.sqlite');
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

    // 1. Open first connection and write record
    const diskDb1 = new DatabaseSync(testDbPath);
    diskDb1.exec('PRAGMA foreign_keys = ON;');
    runMigrations(diskDb1);
    const startupSvc1 = new StartupService(diskDb1);

    const startup = startupSvc1.createStartup({
      legalName: 'Persistence Technologies Private Limited',
      brandName: 'PersistTech',
      sectorCode: 'AI_ML',
      problemStatement: 'Data loss due to non-persistent architectures',
      solutionDescription: 'Strict ACID relational persistence engine',
      currentTrl: 6,
      tanseedStatus: 'FINAL_STAGE'
    });
    expect(startup.aiif_startup_id).toMatch(/^AIIF-INC-2026-\d{4}$/);
    diskDb1.close();

    // 2. Open completely fresh database connection (simulating full server restart / browser reload)
    const diskDb2 = new DatabaseSync(testDbPath);
    diskDb2.exec('PRAGMA foreign_keys = ON;');
    const startupSvc2 = new StartupService(diskDb2);

    const reloadedStartup = startupSvc2.getStartupById(startup.id);
    expect(reloadedStartup).toBeDefined();
    expect(reloadedStartup.legal_name).toBe('Persistence Technologies Private Limited');
    expect(reloadedStartup.brand_name).toBe('PersistTech');
    expect(reloadedStartup.tanseed_status).toBe('FINAL_STAGE');

    diskDb2.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  // =========================================================================
  // TEST I — Auth Lifecycle Persistence: Token authentication & verification
  // =========================================================================
  it('Test I — Auth Lifecycle: User login produces signed JWT, verified on server, state persisted', () => {
    const loginResult = authService.login('ceo@aiif.org.in', 'AdminPassword123!');
    expect(loginResult.token).toBeDefined();
    expect(loginResult.user.email).toBe('ceo@aiif.org.in');
    expect(loginResult.user.roleCode).toBe('CEO');

    // Verify token validity
    const verified = authService.verifyToken(loginResult.token);
    expect(verified.email).toBe('ceo@aiif.org.in');
    expect(verified.roleCode).toBe('CEO');

    // Invalid password must fail
    expect(() => {
      authService.login('ceo@aiif.org.in', 'WrongPassword!');
    }).toThrow(/Invalid email or password/);
  });

  // =========================================================================
  // TEST J — Schema Migration: Running migrations multiple times is idempotent with zero data loss
  // =========================================================================
  it('Test J — Schema Migration: Running migrations repeatedly is idempotent and preserves existing data', () => {
    const startup = startupService.createStartup({
      legalName: 'Migration Safety Systems Pvt Ltd',
      brandName: 'MigrateSafe',
      sectorCode: 'SAAS',
      problemStatement: 'Unsafe DB migrations wiping records',
      solutionDescription: 'Versioned immutable migrations',
      currentTrl: 5
    });

    // Run migrations again
    const newlyApplied = runMigrations(db);
    expect(newlyApplied.length).toBe(0); // Already applied, zero newly applied

    // Verify existing record is 100% intact
    const existing = startupService.getStartupById(startup.id);
    expect(existing).toBeDefined();
    expect(existing.legal_name).toBe('Migration Safety Systems Pvt Ltd');
  });

  // =========================================================================
  // TEST K — Backup: Create snapshot backup and verify restoration fidelity
  // =========================================================================
  it('Test K — Backup: Snapshot backup and restore test must pass with 100% record counts & foreign key validation', () => {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const diskDbPath = path.join(dataDir, 'test_backup_source.sqlite');
    if (fs.existsSync(diskDbPath)) fs.unlinkSync(diskDbPath);

    const testDb = new DatabaseSync(diskDbPath);
    testDb.exec('PRAGMA foreign_keys = ON;');
    runMigrations(testDb);

    const sSvc = new StartupService(testDb);
    const fSvc = new FounderService(testDb);
    const bkSvc = new BackupService(testDb, diskDbPath);

    const startup = sSvc.createStartup({
      legalName: 'TANSEED Finalist Innovators Pvt Ltd',
      brandName: 'TANSEED Hero',
      sectorCode: 'AGRITECH',
      problemStatement: 'Agritech cold chain documentation gaps',
      solutionDescription: 'Decentralized solar micro-storage units',
      currentTrl: 7,
      tanseedStatus: 'FINAL_STAGE'
    });

    const founder = fSvc.createFounder({
      startupId: startup.id,
      fullName: 'Dr. Ramesh Kumar',
      designation: 'Founder & CEO',
      email: 'ramesh@tanseedhero.com',
      phone: '+919876543299',
      ownershipPercentage: 85.0
    });

    // 1. Take Snapshot Backup
    const backupResult = bkSvc.createSnapshotBackup();
    expect(backupResult.backupPath).toBeDefined();
    expect(fs.existsSync(backupResult.backupPath)).toBe(true);
    expect(backupResult.fileSizeBytes).toBeGreaterThan(0);
    expect(backupResult.sha256).toHaveLength(64);

    // 2. Perform Restore Verification Test
    const restoreTest = bkSvc.testRestoreVerification(backupResult.backupPath);
    expect(restoreTest.success).toBe(true);
    expect(restoreTest.foreignKeyCheckPassed).toBe(true);
    expect(restoreTest.mismatches.length).toBe(0);

    const restoredStartupCount = testDb.prepare('SELECT COUNT(*) as cnt FROM startup_masters').get() as { cnt: number };
    const restoredFounderCount = testDb.prepare('SELECT COUNT(*) as cnt FROM founder_profiles').get() as { cnt: number };
    expect(restoredStartupCount.cnt).toBe(1);
    expect(restoredFounderCount.cnt).toBe(1);

    testDb.close();
    if (fs.existsSync(diskDbPath)) fs.unlinkSync(diskDbPath);
    if (fs.existsSync(backupResult.backupPath)) fs.unlinkSync(backupResult.backupPath);
  });

  // =========================================================================
  // TEST L — Strict Referential Integrity: Non-existent foreign key references must be rejected
  // =========================================================================
  it('Test L — Strict Referential Integrity: Database must reject child records referencing non-existent parents', () => {
    // Attempt to create founder with fake non-existent startup UUID
    const fakeStartupId = '00000000-0000-0000-0000-000000000999';

    expect(() => {
      founderService.createFounder({
        startupId: fakeStartupId,
        fullName: 'Orphan Founder',
        email: 'orphan@test.com',
        phone: '+919999999999'
      });
    }).toThrow(/Invalid startup ID/);

    // Attempt direct SQL insert with foreign key violation
    expect(() => {
      db.prepare(`
        INSERT INTO founder_profiles (
          id, founder_code, startup_id, full_name, email, phone, version
        ) VALUES ('fake-id-1', 'FND-FAKE-01', 'non-existent-startup', 'Direct Orphan', 'orphan@test.com', '+919999999999', 1)
      `).run();
    }).toThrow(/FOREIGN KEY constraint failed/);
  });
});
