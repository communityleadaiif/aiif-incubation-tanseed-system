-- Migration 002: Master Data & Lookup Seeds

-- Master Roles
INSERT OR IGNORE INTO master_roles (role_code, role_name, description) VALUES
('CEO', 'Chief Executive Officer', 'Full administrative authority and institutional approvals'),
('INCUBATION_MGR', 'Incubation Manager', 'Operational management of startups, evaluations, mentors, and milestones'),
('PROGRAM_MGR', 'Program Manager', 'Programs, events, and operational facilitation'),
('MENTOR', 'Mentor', 'Assigned startups mentorship and session feedback'),
('FOUNDER', 'Startup Founder', 'Startup profile, milestone updates, and submission access'),
('FINANCE_ADMIN', 'Finance & Admin', 'Financial records and disbursement administration'),
('AUDITOR', 'Auditor / Viewer', 'Read-only access to records and compliance trails');

-- Master Sectors
INSERT OR IGNORE INTO master_sectors (sector_code, sector_name, is_active) VALUES
('AGRITECH', 'Agriculture & Food Technology', 1),
('HEALTHTECH', 'Healthcare & Biomedical', 1),
('AI_ML', 'Artificial Intelligence & DeepTech', 1),
('CLEANTECH', 'CleanTech & Renewable Energy', 1),
('EDTECH', 'Education & Learning Technology', 1),
('FINTECH', 'Financial Technology', 1),
('INDUSTRY_40', 'Industry 4.0 & Advanced Manufacturing', 1),
('SAAS', 'Enterprise Software & SaaS', 1),
('AEROSPACE', 'Drones & Aerospace', 1),
('OTHER', 'General Innovation', 1);

-- Master TRL Levels (1 to 9)
INSERT OR IGNORE INTO master_trl_levels (trl_level, title, description) VALUES
(1, 'Basic Principles Observed', 'Scientific research begins to be translated into applied R&D'),
(2, 'Technology Concept Formulated', 'Practical applications can be invented; basic properties defined'),
(3, 'Experimental Proof of Concept', 'Active R&D initiated, analytical and laboratory-scale studies'),
(4, 'Technology Validated in Lab', 'Basic technological components integrated to establish lab validity'),
(5, 'Technology Validated in Relevant Environment', 'Basic technological components integrated with realistic supporting elements'),
(6, 'Technology Demonstrated in Relevant Environment', 'Representative prototype tested in a relevant environment'),
(7, 'System Prototype Demonstration in Operational Environment', 'Prototype near or at planned operational system scale'),
(8, 'System Complete and Qualified', 'Technology proven to work in final form under expected conditions'),
(9, 'Actual System Proven in Operational Environment', 'Competitive manufacturing in operational environment');

-- Master Funding Schemes
INSERT OR IGNORE INTO master_funding_schemes (scheme_code, scheme_name, agency_name, guidelines_url, is_active) VALUES
('TANSEED', 'Tamil Nadu Startup Seed Grant Fund (TANSEED)', 'StartupTN (TANSIM)', 'https://startuptn.in', 1),
('EDII_IVP', 'Innovation Voucher Programme (IVP)', 'EDII Tamil Nadu', 'https://editn.in', 1),
('NIDHI_PRAYAS', 'NIDHI-PRAYAS (PRomoting and Accelerating Young and ASpiring innovators)', 'DST, Govt of India', 'https://dst.gov.in', 1),
('NIDHI_EIR', 'NIDHI-Entrepreneurs-in-Residence (EIR)', 'DST, Govt of India', 'https://dst.gov.in', 1),
('BIRAC_BIG', 'Biotechnology Ignition Grant (BIG)', 'BIRAC, DBT, Govt of India', 'https://birac.nic.in', 1),
('STARTUP_INDIA_SEED', 'Startup India Seed Fund Scheme (SISFS)', 'DPIIT, Govt of India', 'https://seedfund.startupindia.gov.in', 1);

-- Master Departments
INSERT OR IGNORE INTO master_departments (dept_code, dept_name, institution_name) VALUES
('CSE', 'Computer Science and Engineering', 'AJK Group of Institutions'),
('AI_DS', 'Artificial Intelligence and Data Science', 'AJK Group of Institutions'),
('IT', 'Information Technology', 'AJK Group of Institutions'),
('ECE', 'Electronics and Communication Engineering', 'AJK Group of Institutions'),
('MECH', 'Mechanical Engineering', 'AJK Group of Institutions'),
('BCA', 'Bachelor of Computer Applications', 'AJK College of Arts and Science'),
('BCOM', 'Commerce & Management', 'AJK College of Arts and Science'),
('BIOTECH', 'Biotechnology', 'AJK College of Arts and Science');

-- Evaluation Criteria (Configurable weightings sum to 100)
INSERT OR IGNORE INTO evaluation_criteria (id, criterion_key, title, max_weight, display_order, is_active) VALUES
('CRIT-001', 'PROBLEM_RELEVANCE', 'Problem Relevance & Urgency', 10.00, 1, 1),
('CRIT-002', 'INNOVATION', 'Innovation & Novelty', 15.00, 2, 1),
('CRIT-003', 'TECH_PRODUCT', 'Technology / Product Feasibility', 15.00, 3, 1),
('CRIT-004', 'MARKET_POTENTIAL', 'Market Potential & Target Size', 15.00, 4, 1),
('CRIT-005', 'SCALABILITY', 'Scalability & Growth Horizon', 10.00, 5, 1),
('CRIT-006', 'BUSINESS_MODEL', 'Business & Revenue Model', 10.00, 6, 1),
('CRIT-007', 'TEAM_CAPABILITY', 'Founder & Team Capability', 10.00, 7, 1),
('CRIT-008', 'TRACTION_VALIDATION', 'Traction, Pilot & Validation', 10.00, 8, 1),
('CRIT-009', 'SOCIAL_IMPACT', 'Social, Economic & Regional Impact', 5.00, 9, 1);

-- Default Super Admin / CEO User
-- Password: "AdminPassword123!"
INSERT OR IGNORE INTO user_accounts (
    id, user_code, email, password_hash, full_name, phone, role_code, is_active
) VALUES (
    'usr-ceo-00000000-0000-0000-0000-000000000001',
    'USR-2026-000001',
    'ceo@aiif.org.in',
    '$2a$10$JeYwsoX7gHYAgUe4UNFcbOUHv40U8HmX.kgolIfdVGymcR/QioeDy',
    'AIIF Chief Executive Officer',
    '+919876543210',
    'CEO',
    1
);

-- Default Incubation Manager User
INSERT OR IGNORE INTO user_accounts (
    id, user_code, email, password_hash, full_name, phone, role_code, is_active
) VALUES (
    'usr-mgr-00000000-0000-0000-0000-000000000002',
    'USR-2026-000002',
    'incubation.manager@aiif.org.in',
    '$2a$10$JeYwsoX7gHYAgUe4UNFcbOUHv40U8HmX.kgolIfdVGymcR/QioeDy',
    'AIIF Incubation Manager',
    '+919876543211',
    'INCUBATION_MGR',
    1
);
