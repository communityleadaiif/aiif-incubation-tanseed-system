import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface EvaluationInput {
  startupId: string;
  applicationId?: string;
  evaluatorId: string;
  scores: Record<string, number>; // criterion_key -> score
  evaluatorComments: string;
  conditionsPrescribed?: string;
}

export class EvaluationService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public getCriteria() {
    return this.db.prepare(`
      SELECT * FROM evaluation_criteria 
      WHERE is_active = 1 
      ORDER BY display_order ASC
    `).all() as Array<{ id: string; criterion_key: string; title: string; max_weight: number }>;
  }

  public submitEvaluation(input: EvaluationInput, actorId?: string, actorEmail?: string): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) {
      throw new Error(`Startup not found: ${input.startupId}`);
    }

    const criteria = this.getCriteria();
    let totalScore = 0;

    for (const crit of criteria) {
      const score = input.scores[crit.criterion_key];
      if (score === undefined || score === null) {
        throw new Error(`Missing score for criterion: ${crit.title} (${crit.criterion_key})`);
      }
      if (score < 0 || score > crit.max_weight) {
        throw new Error(`Score for ${crit.title} must be between 0 and ${crit.max_weight}`);
      }
      totalScore += score;
    }

    // Determine standard recommendation
    let recommendation: 'RECOMMENDED' | 'RECOMMENDED_WITH_CONDITIONS' | 'FURTHER_EVALUATION_REQUIRED' | 'NOT_RECOMMENDED';
    if (totalScore >= 75) {
      recommendation = 'RECOMMENDED';
    } else if (totalScore >= 60) {
      recommendation = 'RECOMMENDED_WITH_CONDITIONS';
    } else if (totalScore >= 45) {
      recommendation = 'FURTHER_EVALUATION_REQUIRED';
    } else {
      recommendation = 'NOT_RECOMMENDED';
    }

    const id = randomUUID();
    const evaluationCode = this.idGen.generateId({ prefix: 'EVA' });

    const stmt = this.db.prepare(`
      INSERT INTO startup_evaluations (
        id, evaluation_code, startup_id, application_id,
        evaluator_id, scores_breakdown_json, total_score,
        recommendation, evaluator_comments, conditions_prescribed, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      evaluationCode,
      input.startupId,
      input.applicationId || null,
      input.evaluatorId,
      JSON.stringify(input.scores),
      totalScore,
      recommendation,
      input.evaluatorComments,
      input.conditionsPrescribed || null
    );

    // Update startup pipeline status to EVALUATION
    this.db.prepare(`
      UPDATE startup_masters SET 
        incubation_status = 'EVALUATION', 
        version = version + 1, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(input.startupId);

    const created = this.getEvaluationById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'SUBMIT_EVALUATION',
      entityType: 'STARTUP_EVALUATION',
      entityId: id,
      entityDisplayCode: evaluationCode,
      newValue: created,
      reason: `Submitted evaluation with total score ${totalScore} (${recommendation})`
    });

    return created;
  }

  public getEvaluationById(idOrCode: string): any {
    const row = this.db.prepare(`
      SELECT e.*, s.legal_name as startup_legal_name, s.aiif_startup_id, u.full_name as evaluator_name
      FROM startup_evaluations e
      JOIN startup_masters s ON e.startup_id = s.id
      JOIN user_accounts u ON e.evaluator_id = u.id
      WHERE e.id = ? OR e.evaluation_code = ?
    `).get(idOrCode, idOrCode) as any;

    if (row && row.scores_breakdown_json) {
      try {
        row.scores = JSON.parse(row.scores_breakdown_json);
      } catch (e) {
        row.scores = {};
      }
    }
    return row;
  }

  public getEvaluationsByStartup(startupIdOrAiifId: string) {
    const rows = this.db.prepare(`
      SELECT e.*, s.legal_name as startup_legal_name, s.aiif_startup_id, u.full_name as evaluator_name
      FROM startup_evaluations e
      JOIN startup_masters s ON e.startup_id = s.id
      JOIN user_accounts u ON e.evaluator_id = u.id
      WHERE s.id = ? OR s.aiif_startup_id = ?
      ORDER BY e.created_at DESC
    `).all(startupIdOrAiifId, startupIdOrAiifId) as any[];

    return rows.map(r => {
      try {
        r.scores = JSON.parse(r.scores_breakdown_json);
      } catch {
        r.scores = {};
      }
      return r;
    });
  }
}
