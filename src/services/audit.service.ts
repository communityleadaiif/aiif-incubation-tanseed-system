import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { IdGeneratorService } from './id-generator.service.js';

export interface AuditLogEntry {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  entityDisplayCode?: string;
  oldValue?: any;
  newValue?: any;
  changedFields?: string[];
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

export class AuditService {
  private idGen: IdGeneratorService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
  }

  public record(entry: AuditLogEntry): string {
    const id = randomUUID();
    const auditCode = this.idGen.generateId({ prefix: 'AUD', format: 'AUDIT', digits: 8 });

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (
        id, audit_code, user_id, user_email, action, entity_type,
        entity_id, entity_display_code, old_value_json, new_value_json,
        changed_fields_json, ip_address, user_agent, action_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      auditCode,
      entry.userId || null,
      entry.userEmail || null,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.entityDisplayCode || null,
      entry.oldValue ? JSON.stringify(entry.oldValue) : null,
      entry.newValue ? JSON.stringify(entry.newValue) : null,
      entry.changedFields ? JSON.stringify(entry.changedFields) : null,
      entry.ipAddress || null,
      entry.userAgent || null,
      entry.reason || null
    );

    return auditCode;
  }

  public getLogsForEntity(entityType: string, entityId: string) {
    return this.db.prepare(`
      SELECT * FROM audit_logs 
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY timestamp DESC
    `).all(entityType, entityId);
  }

  public getAllLogs(limit: number = 100, offset: number = 0) {
    return this.db.prepare(`
      SELECT * FROM audit_logs 
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  }
}
