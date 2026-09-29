import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../db/migrate.js';
import { createApp } from '../app.js';
import express from 'express';

describe('AIIF Incubation REST API & RBAC Integration Tests', () => {
  let db: DatabaseSync;
  let app: express.Express;
  let ceoToken: string;
  let mgrToken: string;

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runMigrations(db);
    app = createApp(db);

    // Login CEO
    const ceoRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ceo@aiif.org.in', password: 'AdminPassword123!' });
    expect(ceoRes.status).toBe(200);
    ceoToken = ceoRes.body.token;

    // Login Manager
    const mgrRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'incubation.manager@aiif.org.in', password: 'AdminPassword123!' });
    expect(mgrRes.status).toBe(200);
    mgrToken = mgrRes.body.token;
  });

  afterEach(() => {
    db.close();
  });

  it('End-to-End Governance Lifecycle: Lead -> Evaluation -> Committee Approval -> Agreement -> Historical Evidence -> TANSEED Tracking', async () => {
    // 1. Create Startup
    const startupRes = await request(app)
      .post('/api/startups')
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({
        legalName: 'BioCold Logistics Private Limited',
        brandName: 'BioCold',
        cinNumber: 'U72900TZ2026PTC012345',
        sectorCode: 'AGRITECH',
        problemStatement: 'Lack of cold storage in rural Tamil Nadu',
        solutionDescription: 'IoT solar-powered decentralized micro cold storages',
        currentTrl: 6,
        isHistoricallySupported: true,
        tanseedStatus: 'FINAL_STAGE'
      });

    expect(startupRes.status).toBe(201);
    const startup = startupRes.body;
    expect(startup.aiif_startup_id).toMatch(/^AIIF-INC-2026-\d{4}$/);
    expect(startup.incubation_status).toBe('LEAD');
    expect(startup.is_historically_supported).toBe(1);

    // 2. Add Founder
    const founderRes = await request(app)
      .post('/api/founders')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        startupId: startup.id,
        fullName: 'Dr. S. Kavitha',
        designation: 'Managing Director & Founder',
        email: 'kavitha@biocold.in',
        phone: '+919443322110',
        ownershipPercentage: 70.0,
        isPrimaryContact: true
      });
    expect(founderRes.status).toBe(201);
    expect(founderRes.body.founder_code).toMatch(/^FND-2026-\d{6}$/);

    // 3. Record Genuine Historical Support Record (Anti-Fabrication separated)
    const historyRes = await request(app)
      .post('/api/historical-support')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        startupId: startup.id,
        activityDate: '2025-11-15',
        activityCategory: 'TANSEED_FACILITATION',
        aiifSupportDescription: 'Conducted pitch deck review and grant strategy session for TANSEED application',
        participantsText: 'Dr. S. Kavitha, Incubation Manager, Mentor X',
        evidenceSummary: 'Pitch deck version 1.2 and email correspondence on record'
      });
    expect(historyRes.status).toBe(201);
    expect(historyRes.body.record_code).toMatch(/^HSR-2026-\d{6}$/);
    expect(historyRes.body.entry_label).toContain('Historical Record');

    // 4. Submit Formal Incubation Evaluation
    const evalRes = await request(app)
      .post('/api/evaluations/submit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        startupId: startup.id,
        scores: {
          PROBLEM_RELEVANCE: 9,
          INNOVATION: 13,
          TECH_PRODUCT: 14,
          MARKET_POTENTIAL: 14,
          SCALABILITY: 9,
          BUSINESS_MODEL: 8,
          TEAM_CAPABILITY: 9,
          TRACTION_VALIDATION: 8,
          SOCIAL_IMPACT: 5
        },
        evaluatorComments: 'Exceptional rural agritech solution with validated pilot deployments in Coimbatore district.',
        conditionsPrescribed: 'Startup must execute formal incubation agreement within 30 days.'
      });
    expect(evalRes.status).toBe(201);
    expect(evalRes.body.total_score).toBe(89);
    expect(evalRes.body.recommendation).toBe('RECOMMENDED');

    // 5. Committee Meeting & Approval Resolution
    const meetingRes = await request(app)
      .post('/api/committee/meetings')
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({
        meetingDate: '2026-09-29',
        meetingVenue: 'AIIF Boardroom',
        membersPresent: [
          { name: 'CEO', designation: 'Chairman', role: 'CHAIR' },
          { name: 'Principal, AJKCAS', designation: 'Academic Member', role: 'MEMBER' },
          { name: 'External Investor', designation: 'VC Partner', role: 'EXPERT' }
        ],
        agendaSummary: 'Formal review and admission of TANSEED finalist startups',
        officialMinutes: 'Committee thoroughly reviewed evaluation sheet and historical record. Approved unanimously.'
      });
    expect(meetingRes.status).toBe(201);
    const meeting = meetingRes.body;

    const decisionRes = await request(app)
      .post('/api/committee/decisions')
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({
        meetingId: meeting.id,
        startupId: startup.id,
        evaluationId: evalRes.body.id,
        decision: 'APPROVED',
        formalResolutionText: 'RESOLVED THAT BioCold Logistics Private Limited be formally admitted to the incubation programme of AJK Innovation Incubator Foundation effective 2026-09-29.',
        effectiveAdmissionDate: '2026-09-29',
        signedByChairperson: 'AIIF CEO'
      });
    expect(decisionRes.status).toBe(201);

    // Verify startup status is now APPROVED
    const checkStartup1 = await request(app)
      .get(`/api/startups/${startup.id}`)
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(checkStartup1.body.incubation_status).toBe('APPROVED');

    // 6. Draft & Execute Formal Incubation Agreement
    const draftAgrRes = await request(app)
      .post('/api/agreements/draft')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        startupId: startup.id,
        formalCommencementDate: '2026-09-29',
        durationMonths: 12,
        equityPercentage: 0.0,
        startupSignatoryName: 'Dr. S. Kavitha'
      });
    expect(draftAgrRes.status).toBe(201);
    const agreement = draftAgrRes.body;
    expect(agreement.agreement_status).toBe('DRAFT');

    const execAgrRes = await request(app)
      .post(`/api/agreements/${agreement.id}/execute`)
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({
        actualExecutionDate: '2026-09-29'
      });
    expect(execAgrRes.status).toBe(200);
    expect(execAgrRes.body.agreement_status).toBe('EXECUTED');

    // Verify startup is now INCUBATION_ACTIVE
    const checkStartup2 = await request(app)
      .get(`/api/startups/${startup.id}`)
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(checkStartup2.body.incubation_status).toBe('INCUBATION_ACTIVE');

    // 7. Track TANSEED Final Stage Application
    const schemeAppRes = await request(app)
      .post('/api/schemes/applications')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        startupId: startup.id,
        schemeCode: 'TANSEED',
        externalApplicationNo: 'TANSEED-7.0-AGR-0042',
        submissionDate: '2026-08-10',
        currentStage: 'FINAL_STAGE',
        fundingAmountRequested: 1000000.00,
        officialCommunicationsLog: 'Shortlisted for Grand Jury Pitch at StartupTN HQ, Chennai'
      });
    expect(schemeAppRes.status).toBe(201);
    expect(schemeAppRes.body.scheme_app_code).toMatch(/^SCH-2026-\d{6}$/);

    // 8. Verify Audit Trail captured all actions
    const auditRes = await request(app)
      .get('/api/audit-logs/recent')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.length).toBeGreaterThanOrEqual(6);
  });
});
