import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './db/connection.js';
import { AuthService, UserSession } from './services/auth.service.js';
import { StartupService } from './services/startup.service.js';
import { FounderService } from './services/founder.service.js';
import { TalentService } from './services/talent.service.js';
import { EvaluationService } from './services/evaluation.service.js';
import { CommitteeService } from './services/committee.service.js';
import { AgreementService } from './services/agreement.service.js';
import { HistoricalSupportService } from './services/historical-support.service.js';
import { MentorService } from './services/mentor.service.js';
import { MilestoneService } from './services/milestone.service.js';
import { ReviewService } from './services/review.service.js';
import { SchemeService } from './services/scheme.service.js';
import { DocumentService } from './services/document.service.js';
import { AuditService } from './services/audit.service.js';
import { BackupService } from './services/backup.service.js';

export interface AuthenticatedRequest extends Request {
  user?: UserSession;
}

export function createApp(customDb?: DatabaseSync) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(path.join(process.cwd(), 'public')));

  const db = customDb || getDatabase();

  const authService = new AuthService(db);
  const startupService = new StartupService(db);
  const founderService = new FounderService(db);
  const talentService = new TalentService(db);
  const evaluationService = new EvaluationService(db);
  const committeeService = new CommitteeService(db);
  const agreementService = new AgreementService(db);
  const historicalService = new HistoricalSupportService(db);
  const mentorService = new MentorService(db);
  const milestoneService = new MilestoneService(db);
  const reviewService = new ReviewService(db);
  const schemeService = new SchemeService(db);
  const documentService = new DocumentService(db);
  const auditService = new AuditService(db);
  const backupService = new BackupService(db);

  // Authentication Middleware
  const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed authorization token' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const user = authService.verifyToken(token);
      req.user = user;
      next();
    } catch (e) {
      return res.status(401).json({ error: (e as Error).message });
    }
  };

  // RBAC Authorizer Middleware
  const requireRole = (...allowedRoles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthenticated' });
      }
      if (!allowedRoles.includes(req.user.roleCode)) {
        return res.status(403).json({ error: `Forbidden: User role ${req.user.roleCode} not authorized for this operation` });
      }
      next();
    };
  };

  // Root and Health check
  app.get('/', (req, res) => {
    const indexPath = path.join(process.cwd(), 'public', 'index.html');
    res.sendFile(indexPath);
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'HEALTHY', timestamp: new Date().toISOString(), db: 'CONNECTED' });
  });

  // -------------------------------------------------------------
  // AUTHENTICATION ROUTES
  // -------------------------------------------------------------
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      const result = authService.login(email, password);
      res.json(result);
    } catch (e) {
      res.status(401).json({ error: (e as Error).message });
    }
  });

  app.get('/api/auth/me', authenticate, (req: AuthenticatedRequest, res) => {
    try {
      const profile = authService.getUserById(req.user!.userId);
      res.json(profile);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // STARTUP MASTER ROUTES
  // -------------------------------------------------------------
  app.post('/api/startups', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const startup = startupService.createStartup(req.body, req.user!.userId, req.user!.email);
      res.status(201).json(startup);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/startups', authenticate, (req, res) => {
    try {
      const { sector, status, tanseedStatus, search } = req.query as any;
      const list = startupService.listStartups({ sector, status, tanseedStatus, search });
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get('/api/startups/:id', authenticate, (req, res) => {
    try {
      const startup = startupService.getStartupById(req.params.id);
      if (!startup) return res.status(404).json({ error: 'Startup not found' });
      res.json(startup);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.put('/api/startups/:id', authenticate, requireRole('CEO', 'INCUBATION_MGR', 'PROGRAM_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      if (req.body.expectedVersion === undefined) {
        return res.status(400).json({ error: 'expectedVersion is required for optimistic concurrency' });
      }
      const updated = startupService.updateStartup(req.params.id, req.body, req.user!.userId, req.user!.email, req.body.reason);
      res.json(updated);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Concurrency conflict') || msg.includes('Optimistic locking failed')) {
        return res.status(409).json({ error: msg });
      }
      res.status(400).json({ error: msg });
    }
  });

  app.delete('/api/startups/:id', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ error: 'Deletion reason is required for audit trail' });
      const success = startupService.softDeleteStartup(req.params.id, req.user!.userId, req.user!.email, reason);
      res.json({ success, message: 'Startup soft-deleted successfully' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/startups/:id/restore', authenticate, requireRole('CEO'), (req: AuthenticatedRequest, res) => {
    try {
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ error: 'Restore reason is required' });
      const success = startupService.restoreStartup(req.params.id, req.user!.userId, req.user!.email, reason);
      res.json({ success, message: 'Startup restored successfully' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // FOUNDER ROUTES
  // -------------------------------------------------------------
  app.post('/api/founders', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const founder = founderService.createFounder(req.body, req.user!.userId, req.user!.email);
      res.status(201).json(founder);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/founders/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const list = founderService.getFoundersByStartup(req.params.startupId);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get('/api/founders/:id', authenticate, (req, res) => {
    try {
      const founder = founderService.getFounderById(req.params.id);
      if (!founder) return res.status(404).json({ error: 'Founder not found' });
      res.json(founder);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // STUDENT / TALENT ROUTES
  // -------------------------------------------------------------
  app.post('/api/talent', authenticate, requireRole('CEO', 'INCUBATION_MGR', 'PROGRAM_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const student = talentService.createTalent(req.body, req.user!.userId, req.user!.email);
      res.status(201).json(student);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/talent', authenticate, (req, res) => {
    try {
      const { sortBy, sortOrder } = req.query as any;
      const list = talentService.listTalent(sortBy, sortOrder);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get('/api/talent/:id', authenticate, (req, res) => {
    try {
      const student = talentService.getTalentById(req.params.id);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      res.json(student);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.put('/api/talent/:id', authenticate, requireRole('CEO', 'INCUBATION_MGR', 'PROGRAM_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const updated = talentService.updateTalent(req.params.id, req.body, req.user!.userId, req.user!.email);
      res.json(updated);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Concurrency conflict')) return res.status(409).json({ error: msg });
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/talent/batch-import', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const { records, policy } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ error: 'records must be an array' });
      const result = talentService.importBatchTransactional(records, req.user!.userId, req.user!.email, policy);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // EVALUATION ROUTES
  // -------------------------------------------------------------
  app.get('/api/evaluations/criteria', authenticate, (req, res) => {
    try {
      const criteria = evaluationService.getCriteria();
      res.json(criteria);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post('/api/evaluations/submit', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const payload = { ...req.body, evaluatorId: req.user!.userId };
      const evaluation = evaluationService.submitEvaluation(payload, req.user!.userId, req.user!.email);
      res.status(201).json(evaluation);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/evaluations/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const evals = evaluationService.getEvaluationsByStartup(req.params.startupId);
      res.json(evals);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // COMMITTEE ROUTES
  // -------------------------------------------------------------
  app.post('/api/committee/meetings', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const payload = { ...req.body, createdBy: req.user!.userId };
      const meeting = committeeService.createMeeting(payload, req.user!.userId, req.user!.email);
      res.status(201).json(meeting);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/committee/decisions', authenticate, requireRole('CEO'), (req: AuthenticatedRequest, res) => {
    try {
      const decision = committeeService.recordDecision(req.body, req.user!.userId, req.user!.email);
      res.status(201).json(decision);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/committee/decisions/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const decisions = committeeService.getDecisionsByStartup(req.params.startupId);
      res.json(decisions);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // INCUBATION AGREEMENT ROUTES
  // -------------------------------------------------------------
  app.post('/api/agreements/draft', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const agreement = agreementService.createDraftAgreement(req.body, req.user!.userId, req.user!.email);
      res.status(201).json(agreement);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/agreements/:id/execute', authenticate, requireRole('CEO'), (req: AuthenticatedRequest, res) => {
    try {
      const { actualExecutionDate, executedFileId } = req.body;
      if (!actualExecutionDate) return res.status(400).json({ error: 'actualExecutionDate is required' });
      const executed = agreementService.executeAgreement(req.params.id, actualExecutionDate, executedFileId, req.user!.userId, req.user!.email);
      res.json(executed);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/agreements/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const list = agreementService.getAgreementsByStartup(req.params.startupId);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // HISTORICAL SUPPORT ROUTES (Anti-Fabrication Separated Records)
  // -------------------------------------------------------------
  app.post('/api/historical-support', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const payload = { ...req.body, verifiedBy: req.user!.userId };
      const record = historicalService.createRecord(payload, req.user!.userId, req.user!.email);
      res.status(201).json(record);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/historical-support/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const list = historicalService.getRecordsByStartup(req.params.startupId);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // MENTOR & MENTORSHIP SESSION ROUTES
  // -------------------------------------------------------------
  app.post('/api/mentors', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const mentor = mentorService.createMentor(req.body, req.user!.userId, req.user!.email);
      res.status(201).json(mentor);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/mentors', authenticate, (req, res) => {
    try {
      const list = mentorService.listMentors();
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post('/api/mentors/assign', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const { startupId, mentorId, objectives } = req.body;
      const assignments = mentorService.assignMentorToStartup(startupId, mentorId, objectives, req.user!.userId, req.user!.email);
      res.json(assignments);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/mentors/session', authenticate, requireRole('CEO', 'INCUBATION_MGR', 'MENTOR'), (req: AuthenticatedRequest, res) => {
    try {
      const session = mentorService.recordSession(req.body, req.user!.userId, req.user!.email);
      res.status(201).json(session);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/mentors/sessions/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const sessions = mentorService.getSessionsByStartup(req.params.startupId);
      res.json(sessions);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // MILESTONE ROUTES
  // -------------------------------------------------------------
  app.post('/api/milestones', authenticate, requireRole('CEO', 'INCUBATION_MGR', 'FOUNDER'), (req: AuthenticatedRequest, res) => {
    try {
      const milestone = milestoneService.createMilestone(req.body, req.user!.userId, req.user!.email);
      res.status(201).json(milestone);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.put('/api/milestones/:id', authenticate, requireRole('CEO', 'INCUBATION_MGR', 'FOUNDER'), (req: AuthenticatedRequest, res) => {
    try {
      const updated = milestoneService.updateMilestone(req.params.id, req.body, req.user!.userId, req.user!.email);
      res.json(updated);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Concurrency conflict')) return res.status(409).json({ error: msg });
      res.status(400).json({ error: msg });
    }
  });

  app.get('/api/milestones/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const list = milestoneService.getMilestonesByStartup(req.params.startupId);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // MONTHLY REVIEW ROUTES
  // -------------------------------------------------------------
  app.post('/api/reviews', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const payload = { ...req.body, reviewedBy: req.user!.userId };
      const review = reviewService.createReview(payload, req.user!.userId, req.user!.email);
      res.status(201).json(review);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/reviews/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const reviews = reviewService.getReviewsByStartup(req.params.startupId);
      res.json(reviews);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // SCHEMES & TANSEED ROUTES
  // -------------------------------------------------------------
  app.get('/api/schemes/masters', authenticate, (req, res) => {
    try {
      const masters = schemeService.getMasterSchemes();
      res.json(masters);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post('/api/schemes/applications', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const app = schemeService.createApplication(req.body, req.user!.userId, req.user!.email);
      res.status(201).json(app);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.put('/api/schemes/applications/:id/stage', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const { currentStage, sanctionedAmount, disbursementStatus } = req.body;
      const updated = schemeService.updateStage(req.params.id, currentStage, sanctionedAmount, disbursementStatus, req.user!.userId, req.user!.email);
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/schemes/applications/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const list = schemeService.getApplicationsByStartup(req.params.startupId);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // DOCUMENT & EVIDENCE ROUTES
  // -------------------------------------------------------------
  app.post('/api/documents', authenticate, requireRole('CEO', 'INCUBATION_MGR'), (req: AuthenticatedRequest, res) => {
    try {
      const payload = { ...req.body, preparedBy: req.user!.userId };
      const doc = documentService.createDocument(payload, req.user!.userId, req.user!.email);
      res.status(201).json(doc);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/documents/by-startup/:startupId', authenticate, (req, res) => {
    try {
      const list = documentService.getDocumentsByStartup(req.params.startupId);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post('/api/evidence/attach', authenticate, (req: AuthenticatedRequest, res) => {
    try {
      const { startupId, entityType, entityId, fileTitle, fileName, fileBase64, mimeType } = req.body;
      if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });
      const fileBuffer = Buffer.from(fileBase64, 'base64');
      const evidence = documentService.attachEvidence({
        startupId,
        entityType,
        entityId,
        fileTitle,
        fileName,
        fileBuffer,
        mimeType: mimeType || 'application/pdf',
        uploadedBy: req.user!.userId
      }, req.user!.userId, req.user!.email);
      res.status(201).json(evidence);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/evidence/by-entity', authenticate, (req, res) => {
    try {
      const { entityType, entityId } = req.query as any;
      if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId query params required' });
      const list = documentService.getEvidenceForEntity(entityType, entityId);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // AUDIT LOG ROUTES
  // -------------------------------------------------------------
  app.get('/api/audit-logs/by-entity', authenticate, requireRole('CEO', 'INCUBATION_MGR', 'AUDITOR'), (req, res) => {
    try {
      const { entityType, entityId } = req.query as any;
      if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId required' });
      const logs = auditService.getLogsForEntity(entityType, entityId);
      res.json(logs);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get('/api/audit-logs/recent', authenticate, requireRole('CEO', 'INCUBATION_MGR', 'AUDITOR'), (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const logs = auditService.getAllLogs(limit, offset);
      res.json(logs);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // -------------------------------------------------------------
  // SYSTEM BACKUP & DISASTER RECOVERY ROUTES
  // -------------------------------------------------------------
  app.post('/api/system/backup/create', authenticate, requireRole('CEO'), (req, res) => {
    try {
      const result = backupService.createSnapshotBackup();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post('/api/system/backup/test-restore', authenticate, requireRole('CEO'), (req, res) => {
    try {
      const { backupPath } = req.body;
      if (!backupPath) return res.status(400).json({ error: 'backupPath required' });
      const result = backupService.testRestoreVerification(backupPath);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return app;
}
