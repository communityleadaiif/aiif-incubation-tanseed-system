-- Migration 001: Initial Schema
-- Enforce Foreign Keys and UTF-8 collation

CREATE TABLE IF NOT EXISTS __schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Controlled Roles
CREATE TABLE IF NOT EXISTS master_roles (
    role_code VARCHAR(32) PRIMARY KEY,
    role_name VARCHAR(64) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Master Sectors
CREATE TABLE IF NOT EXISTS master_sectors (
    sector_code VARCHAR(32) PRIMARY KEY,
    sector_name VARCHAR(100) NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

-- Technology Readiness Levels (TRL 1 to 9)
CREATE TABLE IF NOT EXISTS master_trl_levels (
    trl_level INTEGER PRIMARY KEY CHECK (trl_level BETWEEN 1 AND 9),
    title VARCHAR(128) NOT NULL,
    description TEXT NOT NULL
);

-- Master Funding Schemes
CREATE TABLE IF NOT EXISTS master_funding_schemes (
    scheme_code VARCHAR(32) PRIMARY KEY,
    scheme_name VARCHAR(128) NOT NULL,
    agency_name VARCHAR(128) NOT NULL,
    guidelines_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

-- Master Academic Departments
CREATE TABLE IF NOT EXISTS master_departments (
    dept_code VARCHAR(32) PRIMARY KEY,
    dept_name VARCHAR(128) NOT NULL,
    institution_name VARCHAR(128) NOT NULL DEFAULT 'AJK Group of Institutions'
);

-- Master Sequence Generator for Permanent Immutable IDs
CREATE TABLE IF NOT EXISTS entity_sequences (
    entity_prefix VARCHAR(32) NOT NULL,
    sequence_year INTEGER NOT NULL,
    current_value INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (entity_prefix, sequence_year)
);

-- User Accounts & Authentication
CREATE TABLE IF NOT EXISTS user_accounts (
    id VARCHAR(36) PRIMARY KEY,
    user_code VARCHAR(32) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    phone VARCHAR(20),
    role_code VARCHAR(32) NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login_at TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (role_code) REFERENCES master_roles(role_code)
);

-- Startup Master Record
CREATE TABLE IF NOT EXISTS startup_masters (
    id VARCHAR(36) PRIMARY KEY,
    aiif_startup_id VARCHAR(32) UNIQUE NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    brand_name VARCHAR(255) NOT NULL,
    cin_number VARCHAR(32) UNIQUE,
    dpiit_number VARCHAR(32) UNIQUE,
    udyam_number VARCHAR(32) UNIQUE,
    gst_number VARCHAR(32),
    incorporation_date DATE,
    legal_structure VARCHAR(64) NOT NULL DEFAULT 'Private Limited'
        CHECK (legal_structure IN ('Private Limited', 'LLP', 'Partnership', 'Proprietorship', 'Unregistered Idea')),
    registered_address TEXT,
    website VARCHAR(255),
    sector_code VARCHAR(32) NOT NULL,
    problem_statement TEXT NOT NULL,
    solution_description TEXT NOT NULL,
    technology_stack TEXT,
    current_trl INTEGER NOT NULL DEFAULT 1 CHECK (current_trl BETWEEN 1 AND 9),
    business_model TEXT,
    target_market TEXT,
    revenue_model TEXT,
    current_annual_revenue DECIMAL(15, 2) DEFAULT 0.00,
    total_funding_raised DECIMAL(15, 2) DEFAULT 0.00,
    funding_required DECIMAL(15, 2) DEFAULT 0.00,
    incubation_status VARCHAR(32) NOT NULL DEFAULT 'LEAD'
        CHECK (incubation_status IN (
            'LEAD', 'APPLICATION_STARTED', 'APPLICATION_SUBMITTED', 'SCREENING',
            'EVALUATION', 'COMMITTEE_REVIEW', 'APPROVED', 'AGREEMENT_PENDING',
            'INCUBATION_ACTIVE', 'MILESTONE_REVIEW', 'FUNDING_READY', 
            'FUNDING_APPLIED', 'FUNDED', 'GROWTH_SCALE', 'GRADUATED', 'ALUMNI', 'REJECTED'
        )),
    tanseed_status VARCHAR(32) DEFAULT 'NONE'
        CHECK (tanseed_status IN ('NONE', 'PREPARING', 'APPLIED', 'SHORTLISTED', 'FINAL_STAGE', 'SANCTIONED', 'REJECTED', 'DISBURSED')),
    is_historically_supported INTEGER NOT NULL DEFAULT 0,
    formal_admission_date DATE,
    graduation_date DATE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (sector_code) REFERENCES master_sectors(sector_code),
    FOREIGN KEY (current_trl) REFERENCES master_trl_levels(trl_level)
);
CREATE INDEX IF NOT EXISTS idx_startup_status ON startup_masters(incubation_status);
CREATE INDEX IF NOT EXISTS idx_startup_aiif_id ON startup_masters(aiif_startup_id);

-- Founder Profiles
CREATE TABLE IF NOT EXISTS founder_profiles (
    id VARCHAR(36) PRIMARY KEY,
    founder_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    designation VARCHAR(64) NOT NULL DEFAULT 'Founder & CEO',
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    din_number VARCHAR(16),
    ownership_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (ownership_percentage BETWEEN 0 AND 100),
    profile_summary TEXT,
    linkedin_url VARCHAR(255),
    is_primary_contact INTEGER NOT NULL DEFAULT 0,
    user_account_id VARCHAR(36) UNIQUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_account_id) REFERENCES user_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_founder_startup ON founder_profiles(startup_id);
CREATE INDEX IF NOT EXISTS idx_founder_email ON founder_profiles(email);

-- Students / Talent Registry
CREATE TABLE IF NOT EXISTS student_talent_profiles (
    id VARCHAR(36) PRIMARY KEY,
    student_code VARCHAR(32) UNIQUE NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    gender VARCHAR(16) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    dept_code VARCHAR(32) NOT NULL,
    programme_name VARCHAR(64) NOT NULL,
    academic_year VARCHAR(16) NOT NULL,
    admission_number VARCHAR(64) UNIQUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (dept_code) REFERENCES master_departments(dept_code)
);

-- Incubation Applications
CREATE TABLE IF NOT EXISTS incubation_applications (
    id VARCHAR(36) PRIMARY KEY,
    application_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    submitted_by VARCHAR(36) NOT NULL,
    application_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    raw_responses_json TEXT NOT NULL,
    tanseed_details_json TEXT,
    founder_declaration_signed INTEGER NOT NULL DEFAULT 0,
    declaration_timestamp TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED' 
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_SCREENING', 'SHORTLISTED', 'REJECTED', 'APPROVED_FOR_COMMITTEE')),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (submitted_by) REFERENCES user_accounts(id)
);

-- Evaluation Criteria
CREATE TABLE IF NOT EXISTS evaluation_criteria (
    id VARCHAR(36) PRIMARY KEY,
    criterion_key VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(128) NOT NULL,
    max_weight DECIMAL(5, 2) NOT NULL,
    display_order INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

-- Startup Evaluations
CREATE TABLE IF NOT EXISTS startup_evaluations (
    id VARCHAR(36) PRIMARY KEY,
    evaluation_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    application_id VARCHAR(36),
    evaluator_id VARCHAR(36) NOT NULL,
    scores_breakdown_json TEXT NOT NULL,
    total_score DECIMAL(5, 2) NOT NULL CHECK (total_score BETWEEN 0 AND 100),
    recommendation VARCHAR(32) NOT NULL 
        CHECK (recommendation IN ('RECOMMENDED', 'RECOMMENDED_WITH_CONDITIONS', 'FURTHER_EVALUATION_REQUIRED', 'NOT_RECOMMENDED')),
    evaluator_comments TEXT NOT NULL,
    conditions_prescribed TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (application_id) REFERENCES incubation_applications(id),
    FOREIGN KEY (evaluator_id) REFERENCES user_accounts(id)
);

-- Committee Meetings
CREATE TABLE IF NOT EXISTS committee_meetings (
    id VARCHAR(36) PRIMARY KEY,
    meeting_code VARCHAR(32) UNIQUE NOT NULL,
    meeting_date DATE NOT NULL,
    meeting_venue VARCHAR(255) NOT NULL DEFAULT 'AIIF Boardroom / Hybrid',
    committee_members_present TEXT NOT NULL,
    agenda_summary TEXT NOT NULL,
    official_minutes TEXT NOT NULL,
    created_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES user_accounts(id)
);

-- Committee Decisions & Resolutions
CREATE TABLE IF NOT EXISTS committee_decisions (
    id VARCHAR(36) PRIMARY KEY,
    meeting_id VARCHAR(36) NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    evaluation_id VARCHAR(36),
    decision VARCHAR(32) NOT NULL 
        CHECK (decision IN ('APPROVED', 'APPROVED_WITH_CONDITIONS', 'DEFERRED', 'REJECTED')),
    formal_resolution_text TEXT NOT NULL,
    conditions_specified TEXT,
    effective_admission_date DATE,
    signed_by_chairperson VARCHAR(128),
    signed_timestamp TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES committee_meetings(id),
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (evaluation_id) REFERENCES startup_evaluations(id)
);

-- Incubation Agreements
CREATE TABLE IF NOT EXISTS incubation_agreements (
    id VARCHAR(36) PRIMARY KEY,
    agreement_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    document_reference_no VARCHAR(64) UNIQUE NOT NULL,
    formal_commencement_date DATE NOT NULL,
    duration_months INTEGER NOT NULL DEFAULT 12,
    expiry_date DATE NOT NULL,
    equity_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    agreement_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
        CHECK (agreement_status IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED_BY_LEGAL', 'EXECUTED', 'TERMINATED', 'EXPIRED', 'SUPERSEDED')),
    aiif_signatory_name VARCHAR(128),
    aiif_signatory_designation VARCHAR(128) DEFAULT 'Chief Executive Officer',
    startup_signatory_name VARCHAR(128),
    startup_signatory_designation VARCHAR(128) DEFAULT 'Founder & Director',
    execution_date DATE,
    executed_document_file_id VARCHAR(36),
    terms_clauses_json TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT
);

-- Historical Support Records (Informal Evidence-Grounded Past Support)
CREATE TABLE IF NOT EXISTS historical_support_records (
    id VARCHAR(36) PRIMARY KEY,
    record_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    activity_date DATE NOT NULL,
    activity_category VARCHAR(64) NOT NULL 
        CHECK (activity_category IN (
            'FOUNDER_MEETING', 'MENTOR_SESSION', 'PITCH_REVIEW', 'INVESTOR_CONNECTION',
            'WORKSHOP_EVENT', 'PRODUCT_REVIEW', 'TANSEED_FACILITATION', 'INFRASTRUCTURE_ACCESS', 'OTHER'
        )),
    aiif_support_description TEXT NOT NULL,
    participants_text TEXT NOT NULL,
    entry_label VARCHAR(255) NOT NULL DEFAULT 'Historical Record - entered based on verified documentary evidence.',
    evidence_summary TEXT,
    verified_by VARCHAR(36) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (verified_by) REFERENCES user_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_historical_startup ON historical_support_records(startup_id);

-- Mentor Profiles
CREATE TABLE IF NOT EXISTS mentor_profiles (
    id VARCHAR(36) PRIMARY KEY,
    mentor_code VARCHAR(32) UNIQUE NOT NULL,
    user_account_id VARCHAR(36) UNIQUE,
    full_name VARCHAR(128) NOT NULL,
    primary_domain VARCHAR(100) NOT NULL,
    organization VARCHAR(128),
    designation VARCHAR(128),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    linkedin_url VARCHAR(255),
    expertise_tags TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_account_id) REFERENCES user_accounts(id)
);

-- Mentor Assignments
CREATE TABLE IF NOT EXISTS mentor_assignments (
    id VARCHAR(36) PRIMARY KEY,
    startup_id VARCHAR(36) NOT NULL,
    mentor_id VARCHAR(36) NOT NULL,
    assigned_date DATE NOT NULL,
    objectives TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'DISCONTINUED')),
    assigned_by VARCHAR(36) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (mentor_id) REFERENCES mentor_profiles(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_by) REFERENCES user_accounts(id),
    UNIQUE (startup_id, mentor_id)
);

-- Mentor Sessions
CREATE TABLE IF NOT EXISTS mentor_sessions (
    id VARCHAR(36) PRIMARY KEY,
    session_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    mentor_id VARCHAR(36) NOT NULL,
    session_date DATE NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    topics_discussed TEXT NOT NULL,
    advice_action_items TEXT NOT NULL,
    founder_commitments TEXT NOT NULL,
    mentor_recommendations TEXT,
    next_meeting_date DATE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (mentor_id) REFERENCES mentor_profiles(id) ON DELETE RESTRICT
);

-- Startup Milestones
CREATE TABLE IF NOT EXISTS startup_milestones (
    id VARCHAR(36) PRIMARY KEY,
    milestone_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL 
        CHECK (category IN ('PROTOTYPE', 'PILOT', 'CUSTOMERS', 'REVENUE', 'IPR', 'FUNDING', 'MARKET_EXPANSION', 'OPERATIONS')),
    baseline_state TEXT NOT NULL,
    target_state TEXT NOT NULL,
    target_due_date DATE NOT NULL,
    completion_date DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED'
        CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'COMPLETED', 'DELAYED', 'CANCELLED')),
    verification_notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT
);

-- Monthly Progress Reviews
CREATE TABLE IF NOT EXISTS monthly_reviews (
    id VARCHAR(36) PRIMARY KEY,
    review_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    review_period VARCHAR(16) NOT NULL,
    product_tech_progress TEXT NOT NULL,
    customer_revenue_progress TEXT NOT NULL,
    team_progress TEXT,
    ipr_progress TEXT,
    funding_progress TEXT,
    key_achievements TEXT NOT NULL,
    challenges_faced TEXT NOT NULL,
    risks_identified TEXT NOT NULL,
    next_30_day_priorities TEXT NOT NULL,
    mentor_feedback_summary TEXT,
    aiif_action_items TEXT,
    startup_action_items TEXT,
    reviewed_by VARCHAR(36) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (reviewed_by) REFERENCES user_accounts(id),
    UNIQUE (startup_id, review_period)
);

-- Government & Funding Scheme Applications
CREATE TABLE IF NOT EXISTS scheme_applications (
    id VARCHAR(36) PRIMARY KEY,
    scheme_app_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    scheme_code VARCHAR(32) NOT NULL,
    external_application_no VARCHAR(128) NOT NULL,
    submission_date DATE NOT NULL,
    current_stage VARCHAR(64) NOT NULL 
        CHECK (current_stage IN (
            'DRAFTING', 'SUBMITTED', 'PRELIMINARY_EVALUATION', 'SHORTLISTED_FOR_PITCH',
            'FINAL_STAGE', 'SANCTION_RECEIVED', 'AGREEMENT_SIGNED', 'DISBURSED', 'REJECTED'
        )),
    funding_amount_requested DECIMAL(15, 2) NOT NULL,
    funding_amount_sanctioned DECIMAL(15, 2) DEFAULT 0.00,
    disbursement_status VARCHAR(32) DEFAULT 'PENDING'
        CHECK (disbursement_status IN ('PENDING', 'PARTIALLY_DISBURSED', 'FULLY_DISBURSED')),
    official_communications_log TEXT,
    pitch_deck_document_id VARCHAR(36),
    business_plan_document_id VARCHAR(36),
    aiif_support_letter_document_id VARCHAR(36),
    final_outcome_notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (scheme_code) REFERENCES master_funding_schemes(scheme_code)
);

-- Institutional Document Records
CREATE TABLE IF NOT EXISTS document_records (
    id VARCHAR(36) PRIMARY KEY,
    document_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    document_type VARCHAR(64) NOT NULL
        CHECK (document_type IN (
            'APPLICATION_FORM', 'EVALUATION_SHEET', 'COMMITTEE_RESOLUTION', 'HISTORICAL_SUPPORT_RECORD',
            'INCUBATION_AGREEMENT', 'FOUNDER_UNDERTAKING', 'MENTOR_ALLOCATION', 'MENTORSHIP_AGREEMENT',
            'MONTHLY_REVIEW_REPORT', 'MILESTONE_PLAN', 'INSTITUTIONAL_SUPPORT_LETTER', 'TANSEED_SUPPORT_LETTER',
            'GOVT_SCHEME_SUPPORT_LETTER', 'INVESTOR_REFERRAL', 'GRADUATION_CERTIFICATE', 'OTHER'
        )),
    reference_number VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'EXECUTED', 'SUPERSEDED', 'ARCHIVED')),
    prepared_by VARCHAR(36) NOT NULL,
    approved_by VARCHAR(36),
    file_path TEXT,
    file_hash_sha256 VARCHAR(64),
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (prepared_by) REFERENCES user_accounts(id),
    FOREIGN KEY (approved_by) REFERENCES user_accounts(id)
);

-- Document Versions
CREATE TABLE IF NOT EXISTS document_versions (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL,
    version_number INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    change_summary TEXT NOT NULL,
    uploaded_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES document_records(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES user_accounts(id),
    UNIQUE (document_id, version_number)
);

-- Attached Evidence Files
CREATE TABLE IF NOT EXISTS evidence_records (
    id VARCHAR(36) PRIMARY KEY,
    evidence_code VARCHAR(32) UNIQUE NOT NULL,
    startup_id VARCHAR(36) NOT NULL,
    entity_type VARCHAR(64) NOT NULL 
        CHECK (entity_type IN ('HISTORICAL_SUPPORT', 'MILESTONE', 'MONTHLY_REVIEW', 'SCHEME_APPLICATION', 'CORPORATE_FILING')),
    entity_id VARCHAR(36) NOT NULL,
    file_title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    uploaded_by VARCHAR(36) NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(36),
    deletion_reason TEXT,
    FOREIGN KEY (startup_id) REFERENCES startup_masters(id) ON DELETE RESTRICT,
    FOREIGN KEY (uploaded_by) REFERENCES user_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence_records(entity_type, entity_id);

-- Append-Only Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    audit_code VARCHAR(32) UNIQUE NOT NULL,
    user_id VARCHAR(36),
    user_email VARCHAR(255),
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    entity_display_code VARCHAR(64),
    old_value_json TEXT,
    new_value_json TEXT,
    changed_fields_json TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    action_reason TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
