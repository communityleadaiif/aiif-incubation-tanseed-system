import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface MonthlyReviewInput {
  startupId: string;
  reviewPeriod: string; // "YYYY-MM"
  productTechProgress: string;
  customerRevenueProgress: string;
  teamProgress?: string;
  iprProgress?: string;
  fundingProgress?: string;
  keyAchievements: string;
  challengesFaced: string;
  risksIdentified: string;
  next30DayPriorities: string;
  mentorFeedbackSummary?: string;
  aiifActionItems?: string;
  startupActionItems?: string;
  reviewedBy: string;
}

export class ReviewService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createReview(input: MonthlyReviewInput, actorId?: string, actorEmail?: string): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) throw new Error(`Startup not found: ${input.startupId}`);

    const id = randomUUID();
    const reviewCode = this.idGen.generateId({ prefix: 'REV' });

    const stmt = this.db.prepare(`
      INSERT INTO monthly_reviews (
        id, review_code, startup_id, review_period,
        product_tech_progress, customer_revenue_progress, team_progress,
        ipr_progress, funding_progress, key_achievements,
        challenges_faced, risks_identified, next_30_day_priorities,
        mentor_feedback_summary, aiif_action_items, startup_action_items,
        reviewed_by, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      reviewCode,
      input.startupId,
      input.reviewPeriod,
      input.productTechProgress,
      input.customerRevenueProgress,
      input.teamProgress || null,
      input.iprProgress || null,
      input.fundingProgress || null,
      input.keyAchievements,
      input.challengesFaced,
      input.risksIdentified,
      input.next30DayPriorities,
      input.mentorFeedbackSummary || null,
      input.aiifActionItems || null,
      input.startupActionItems || null,
      input.reviewedBy
    );

    const created = this.getReviewById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_MONTHLY_REVIEW',
      entityType: 'MONTHLY_REVIEW',
      entityId: id,
      entityDisplayCode: reviewCode,
      newValue: created,
      reason: `Recorded monthly review for period ${input.reviewPeriod}`
    });

    return created;
  }

  public getReviewById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT r.*, s.legal_name as startup_legal_name, s.aiif_startup_id, u.full_name as reviewed_by_name
      FROM monthly_reviews r
      JOIN startup_masters s ON r.startup_id = s.id
      JOIN user_accounts u ON r.reviewed_by = u.id
      WHERE r.id = ? OR r.review_code = ?
    `).get(idOrCode, idOrCode);
  }

  public getReviewsByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT r.*, s.legal_name as startup_legal_name, s.aiif_startup_id, u.full_name as reviewed_by_name
      FROM monthly_reviews r
      JOIN startup_masters s ON r.startup_id = s.id
      JOIN user_accounts u ON r.reviewed_by = u.id
      WHERE s.id = ? OR s.aiif_startup_id = ?
      ORDER BY r.review_period DESC
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }
}
