import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../db/migrate.js';
import { createApp } from '../app.js';
import { StartupService } from '../services/startup.service.js';
import { FounderService } from '../services/founder.service.js';
import { EvaluationService } from '../services/evaluation.service.js';
import { AgreementService } from '../services/agreement.service.js';
import { DocumentService } from '../services/document.service.js';
import { HistoricalSupportService } from '../services/historical-support.service.js';
import express from 'express';

describe('AIIF Security, RBAC Enforcement & Boundary Stress Tests', () => {
  let db: DatabaseSync;
  let app: express.Express;
  let ceoToken: string;
  let mgrToken: string;
  let auditorToken: string;
  let startupSvc: StartupService;
  let founderSvc: FounderService;
  let evalSvc: EvaluationService;
  let agreementSvc: AgreementService;
  let docSvc: DocumentService;
  let historySvc: HistoricalSupportService;

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runMigrations(db);

    // Create an Auditor User account
    db.prepare(`
      INSERT INTO user_accounts (id, user_code, email, password_hash, full_name, role_code, is_active)
      VALUES (
        'usr-auditor-00000000-0000-0000-0000-000000000003',
        'USR-2026-000003',
        'auditor@aiif.org.in',
        '$2a$10$JeYwsoX7gHYAgUe4UNFcbOUHv40U8HmX.kgolIfdVGymcR/QioeDy',
        'Institutional Compliance Auditor',
        'AUDITOR',
        1
      )
    `).run();

    startupSvc = new StartupService(db);
    founderSvc = new FounderService(db);
    evalSvc = new EvaluationService(db);
    agreementSvc = new AgreementService(db);
    docSvc = new DocumentService(db);
    historySvc = new HistoricalSupportService(db);

    app = createApp(db);

    // Login CEO
    const ceoRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ceo@aiif.org.in', password: 'AdminPassword123!' });
    ceoToken = ceoRes.body.token;

    // Login Manager
    const mgrRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'incubation.manager@aiif.org.in', password: 'AdminPassword123!' });
    mgrToken = mgrRes.body.token;

    // Login Auditor
    const audRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auditor@aiif.org.in', password: 'AdminPassword123!' });
    auditorToken = audRes.body.token;
  });

  afterEach(() => {
    db.close();
  });

  // =========================================================================
  // 1. RBAC SECURITY TESTS
  // =========================================================================
  describe('RBAC Authorization Enforcement', () => {
    it('Auditor role is strictly forbidden from creating or modifying startups (403)', async () => {
      const res = await request(app)
        .post('/api/startups')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          legalName: 'Unauthorized Create Attempt',
          brandName: 'FailBrand',
          sectorCode: 'AI_ML',
          problemStatement: 'Testing RBAC',
          solutionDescription: 'Testing RBAC'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('Incubation Manager is strictly forbidden from executing agreements (CEO only) (403)', async () => {
      // First CEO creates startup and draft agreement
      const startup = startupSvc.createStartup({
        legalName: 'RBAC Test Startup Ltd',
        brandName: 'RBACTest',
        sectorCode: 'SAAS',
        problemStatement: 'RBAC',
        solutionDescription: 'RBAC'
      });

      const agreement = agreementSvc.createDraftAgreement({
        startupId: startup.id,
        formalCommencementDate: '2026-09-29'
      });

      // Manager attempts to execute agreement -> must fail with 403
      const res = await request(app)
        .post(`/api/agreements/${agreement.id}/execute`)
        .set('Authorization', `Bearer ${mgrToken}`)
        .send({ actualExecutionDate: '2026-09-29' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('Unauthenticated requests to protected endpoints return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/startups');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Missing or malformed authorization token');
    });
  });

  // =========================================================================
  // 2. CONSTRAINTS & BOUNDARY TESTS
  // =========================================================================
  describe('Database Constraints & Field Boundaries', () => {
    it('Reject startup creation with invalid TRL level out of bounds (TRL must be 1-9)', () => {
      expect(() => {
        startupSvc.createStartup({
          legalName: 'Invalid TRL Startup',
          brandName: 'BadTRL',
          sectorCode: 'AI_ML',
          problemStatement: 'TRL out of bounds',
          solutionDescription: 'TRL out of bounds',
          currentTrl: 12 // Out of bounds!
        });
      }).toThrow(/CHECK constraint failed/);
    });

    it('Reject founder profile with ownership percentage > 100%', () => {
      const startup = startupSvc.createStartup({
        legalName: 'Ownership Test Startup',
        brandName: 'OwnTest',
        sectorCode: 'AI_ML',
        problemStatement: 'Testing ownership bound',
        solutionDescription: 'Testing ownership bound'
      });

      expect(() => {
        founderSvc.createFounder({
          startupId: startup.id,
          fullName: 'Greedy Founder',
          email: 'greedy@test.com',
          phone: '+919876543210',
          ownershipPercentage: 150.0 // Invalid > 100%!
        });
      }).toThrow(/CHECK constraint failed/);
    });

    it('Reject evaluation submission with missing criteria or out-of-bound scores', () => {
      const startup = startupSvc.createStartup({
        legalName: 'Eval Test Startup',
        brandName: 'EvalTest',
        sectorCode: 'AI_ML',
        problemStatement: 'Testing eval bounds',
        solutionDescription: 'Testing eval bounds'
      });

      // Missing criterion
      expect(() => {
        evalSvc.submitEvaluation({
          startupId: startup.id,
          evaluatorId: 'usr-mgr-00000000-0000-0000-0000-000000000002',
          scores: {
            PROBLEM_RELEVANCE: 10,
            INNOVATION: 10
            // Missing other 7 criteria!
          },
          evaluatorComments: 'Incomplete'
        });
      }).toThrow(/Missing score for criterion/);

      // Score exceeding max weight
      expect(() => {
        evalSvc.submitEvaluation({
          startupId: startup.id,
          evaluatorId: 'usr-mgr-00000000-0000-0000-0000-000000000002',
          scores: {
            PROBLEM_RELEVANCE: 99, // Max is 10!
            INNOVATION: 15,
            TECH_PRODUCT: 15,
            MARKET_POTENTIAL: 15,
            SCALABILITY: 10,
            BUSINESS_MODEL: 10,
            TEAM_CAPABILITY: 10,
            TRACTION_VALIDATION: 10,
            SOCIAL_IMPACT: 5
          },
          evaluatorComments: 'Invalid weight'
        });
      }).toThrow(/must be between 0 and 10/);
    });
  });

  // =========================================================================
  // 3. ANTI-FABRICATION & DOCUMENT INTEGRITY
  // =========================================================================
  describe('Anti-Fabrication & Document Versioning Guarantees', () => {
    it('Historical Support Record automatically attaches tamper-proof entry disclaimer', () => {
      const startup = startupSvc.createStartup({
        legalName: 'Historical Test Startup',
        brandName: 'HistTest',
        sectorCode: 'AGRITECH',
        problemStatement: 'Hist test',
        solutionDescription: 'Hist test'
      });

      const rec = historySvc.createRecord({
        startupId: startup.id,
        activityDate: '2025-05-10',
        activityCategory: 'PRODUCT_REVIEW',
        aiifSupportDescription: 'Prototype bench testing',
        participantsText: 'Founders and AIIF lab engineer',
        evidenceSummary: 'Lab logbook page 44',
        verifiedBy: 'usr-mgr-00000000-0000-0000-0000-000000000002'
      });

      expect(rec.entry_label).toContain('Historical Record - entered on');
      expect(rec.entry_label).toContain('based on verified documentary evidence');
    });

    it('Agreements reject duplicate execution to prevent contract tampering', () => {
      const startup = startupSvc.createStartup({
        legalName: 'Agreement Guard Startup',
        brandName: 'AgrGuard',
        sectorCode: 'CLEANTECH',
        problemStatement: 'Agreement test',
        solutionDescription: 'Agreement test'
      });

      const draft = agreementSvc.createDraftAgreement({
        startupId: startup.id,
        formalCommencementDate: '2026-09-29'
      });

      // First execution succeeds
      agreementSvc.executeAgreement(draft.id, '2026-09-29');

      // Second execution attempt must throw error
      expect(() => {
        agreementSvc.executeAgreement(draft.id, '2026-09-29');
      }).toThrow(/Agreement is already executed/);
    });

    it('Document versioning correctly increments version and computes SHA-256 hash', () => {
      const startup = startupSvc.createStartup({
        legalName: 'Doc Version Startup',
        brandName: 'DocVer',
        sectorCode: 'SAAS',
        problemStatement: 'Doc versioning',
        solutionDescription: 'Doc versioning'
      });

      const initialBuffer = Buffer.from('Initial Version 1.0 Content of AIIF Agreement');
      const doc = docSvc.createDocument({
        startupId: startup.id,
        documentType: 'INCUBATION_AGREEMENT',
        title: 'Incubation Agreement Master',
        preparedBy: 'usr-mgr-00000000-0000-0000-0000-000000000002',
        fileBuffer: initialBuffer
      });

      expect(doc.current_version).toBe(1);
      expect(doc.file_hash_sha256).toHaveLength(64);

      // Add Version 2
      const updatedBuffer = Buffer.from('Updated Version 2.0 Content with Annexure B');
      const v2Doc = docSvc.addVersion(
        doc.id,
        '/data/agreements/v2.pdf',
        updatedBuffer,
        'Added Annexure B - Mentor Allocation',
        'usr-mgr-00000000-0000-0000-0000-000000000002'
      );

      expect(v2Doc.current_version).toBe(2);
      expect(v2Doc.file_hash_sha256).not.toBe(doc.file_hash_sha256);
    });
  });
});
