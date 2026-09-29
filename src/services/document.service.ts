import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IdGeneratorService } from './id-generator.service.js';
import { AuditService } from './audit.service.js';

export interface DocumentInput {
  startupId: string;
  documentType: 'APPLICATION_FORM' | 'EVALUATION_SHEET' | 'COMMITTEE_RESOLUTION' | 'HISTORICAL_SUPPORT_RECORD' | 'INCUBATION_AGREEMENT' | 'FOUNDER_UNDERTAKING' | 'MENTOR_ALLOCATION' | 'MENTORSHIP_AGREEMENT' | 'MONTHLY_REVIEW_REPORT' | 'MILESTONE_PLAN' | 'INSTITUTIONAL_SUPPORT_LETTER' | 'TANSEED_SUPPORT_LETTER' | 'GOVT_SCHEME_SUPPORT_LETTER' | 'INVESTOR_REFERRAL' | 'GRADUATION_CERTIFICATE' | 'OTHER';
  title: string;
  preparedBy: string;
  approvedBy?: string;
  filePath?: string;
  fileBuffer?: Buffer;
  mimeType?: string;
}

export interface EvidenceInput {
  startupId: string;
  entityType: 'HISTORICAL_SUPPORT' | 'MILESTONE' | 'MONTHLY_REVIEW' | 'SCHEME_APPLICATION' | 'CORPORATE_FILING';
  entityId: string;
  fileTitle: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
  uploadedBy: string;
}

export class DocumentService {
  private idGen: IdGeneratorService;
  private audit: AuditService;

  constructor(private db: DatabaseSync) {
    this.idGen = new IdGeneratorService(db);
    this.audit = new AuditService(db);
  }

  public createDocument(input: DocumentInput, actorId?: string, actorEmail?: string): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) throw new Error(`Startup not found: ${input.startupId}`);

    const id = randomUUID();
    const docCode = this.idGen.generateId({ prefix: 'DOC' });
    const year = new Date().getFullYear();
    const typeSuffix = input.documentType.replace('_LETTER', '').replace('_FORM', '').replace('_REPORT', '').slice(0, 8);
    const refNumber = `AIIF/INC/${year}/${startup.aiif_startup_id.split('-').pop()}/${typeSuffix}`;

    let fileHash: string | null = null;
    let fileSize: number | null = null;

    if (input.fileBuffer) {
      fileHash = createHash('sha256').update(input.fileBuffer).digest('hex');
      fileSize = input.fileBuffer.length;
    }

    const stmt = this.db.prepare(`
      INSERT INTO document_records (
        id, document_code, startup_id, document_type, reference_number,
        title, current_version, status, prepared_by, approved_by,
        file_path, file_hash_sha256, mime_type, file_size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 'DRAFT', ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      docCode,
      input.startupId,
      input.documentType,
      refNumber,
      input.title,
      input.preparedBy,
      input.approvedBy || null,
      input.filePath || null,
      fileHash,
      input.mimeType || 'application/pdf',
      fileSize
    );

    const created = this.getDocumentById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE_DOCUMENT',
      entityType: 'DOCUMENT_RECORD',
      entityId: id,
      entityDisplayCode: refNumber,
      newValue: created,
      reason: `Created document ${input.title} (${refNumber})`
    });

    return created;
  }

  public addVersion(
    documentId: string,
    filePath: string,
    fileBuffer: Buffer,
    changeSummary: string,
    uploadedBy: string
  ): any {
    const doc = this.getDocumentById(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    const nextVersion = doc.current_version + 1;
    const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const versionId = randomUUID();
      this.db.prepare(`
        INSERT INTO document_versions (
          id, document_id, version_number, file_path, file_hash_sha256, change_summary, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(versionId, documentId, nextVersion, filePath, fileHash, changeSummary, uploadedBy);

      this.db.prepare(`
        UPDATE document_records SET
          current_version = ?,
          file_path = ?,
          file_hash_sha256 = ?,
          file_size_bytes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextVersion, filePath, fileHash, fileBuffer.length, documentId);

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    return this.getDocumentById(documentId);
  }

  public attachEvidence(input: EvidenceInput, actorId?: string, actorEmail?: string): any {
    const startup = this.db.prepare('SELECT id, aiif_startup_id FROM startup_masters WHERE id = ?').get(input.startupId) as any;
    if (!startup) throw new Error(`Startup not found: ${input.startupId}`);

    const id = randomUUID();
    const evidenceCode = this.idGen.generateId({ prefix: 'EVD' });
    const fileHash = createHash('sha256').update(input.fileBuffer).digest('hex');
    const fileSize = input.fileBuffer.length;

    // Structured storage directory: /data/evidence/{startupId}/{entityType}/
    const uploadDir = path.join(process.cwd(), 'data', 'evidence', startup.aiif_startup_id, input.entityType);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const safeFilename = `${evidenceCode}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const targetFilePath = path.join(uploadDir, safeFilename);
    fs.writeFileSync(targetFilePath, input.fileBuffer);

    const stmt = this.db.prepare(`
      INSERT INTO evidence_records (
        id, evidence_code, startup_id, entity_type, entity_id,
        file_title, file_name, file_path, file_hash_sha256,
        mime_type, file_size_bytes, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      evidenceCode,
      input.startupId,
      input.entityType,
      input.entityId,
      input.fileTitle,
      input.fileName,
      targetFilePath,
      fileHash,
      input.mimeType,
      fileSize,
      input.uploadedBy
    );

    const created = this.getEvidenceById(id);

    this.audit.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'ATTACH_EVIDENCE',
      entityType: 'EVIDENCE_RECORD',
      entityId: id,
      entityDisplayCode: evidenceCode,
      newValue: created,
      reason: `Attached evidence file ${input.fileName} (SHA256: ${fileHash.slice(0, 12)}...) to ${input.entityType}`
    });

    return created;
  }

  public getDocumentById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT d.*, s.legal_name as startup_legal_name, s.aiif_startup_id, u.full_name as prepared_by_name
      FROM document_records d
      JOIN startup_masters s ON d.startup_id = s.id
      JOIN user_accounts u ON d.prepared_by = u.id
      WHERE (d.id = ? OR d.document_code = ? OR d.reference_number = ?) AND d.deleted_at IS NULL
    `).get(idOrCode, idOrCode, idOrCode);
  }

  public getEvidenceById(idOrCode: string): any {
    return this.db.prepare(`
      SELECT e.*, s.legal_name as startup_legal_name, s.aiif_startup_id, u.full_name as uploaded_by_name
      FROM evidence_records e
      JOIN startup_masters s ON e.startup_id = s.id
      JOIN user_accounts u ON e.uploaded_by = u.id
      WHERE (e.id = ? OR e.evidence_code = ?) AND e.deleted_at IS NULL
    `).get(idOrCode, idOrCode);
  }

  public getEvidenceForEntity(entityType: string, entityId: string) {
    return this.db.prepare(`
      SELECT e.*, u.full_name as uploaded_by_name
      FROM evidence_records e
      JOIN user_accounts u ON e.uploaded_by = u.id
      WHERE e.entity_type = ? AND e.entity_id = ? AND e.deleted_at IS NULL
      ORDER BY e.uploaded_at DESC
    `).all(entityType, entityId);
  }

  public getDocumentsByStartup(startupIdOrAiifId: string) {
    return this.db.prepare(`
      SELECT d.*, s.legal_name as startup_legal_name, s.aiif_startup_id, u.full_name as prepared_by_name
      FROM document_records d
      JOIN startup_masters s ON d.startup_id = s.id
      JOIN user_accounts u ON d.prepared_by = u.id
      WHERE (s.id = ? OR s.aiif_startup_id = ?) AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC
    `).all(startupIdOrAiifId, startupIdOrAiifId);
  }
}
