import { getDatabase } from './connection.js';
import { runMigrations } from './migrate.js';
import { StartupService } from '../services/startup.service.js';
import { FounderService } from '../services/founder.service.js';
import { HistoricalSupportService } from '../services/historical-support.service.js';
import { EvaluationService } from '../services/evaluation.service.js';
import { CommitteeService } from '../services/committee.service.js';
import { AgreementService } from '../services/agreement.service.js';
import { MentorService } from '../services/mentor.service.js';
import { MilestoneService } from '../services/milestone.service.js';
import { SchemeService } from '../services/scheme.service.js';
import { DocumentService } from '../services/document.service.js';

export function seedDemoData() {
  const db = getDatabase();
  runMigrations(db);

  const startupSvc = new StartupService(db);
  const founderSvc = new FounderService(db);
  const historySvc = new HistoricalSupportService(db);
  const evalSvc = new EvaluationService(db);
  const committeeSvc = new CommitteeService(db);
  const agreementSvc = new AgreementService(db);
  const mentorSvc = new MentorService(db);
  const milestoneSvc = new MilestoneService(db);
  const schemeSvc = new SchemeService(db);
  const docSvc = new DocumentService(db);

  console.log('Seeding AIIF TANSEED Finalist Master File...');

  const ceoUser = db.prepare("SELECT id FROM user_accounts WHERE role_code = 'CEO'").get() as any;
  const mgrUser = db.prepare("SELECT id FROM user_accounts WHERE role_code = 'INCUBATION_MGR'").get() as any;

  // 1. Create TANSEED Finalist Startup Master
  const existing = db.prepare("SELECT id FROM startup_masters WHERE brand_name = 'AgriCool IoT'").get();
  if (!existing) {
    const startup = startupSvc.createStartup({
      legalName: 'AgriCool Innovations Private Limited',
      brandName: 'AgriCool IoT',
      cinNumber: 'U29309TZ2025PTC039821',
      dpiitNumber: 'DIPP119842',
      udyamNumber: 'UDYAM-TN-03-0098712',
      gstNumber: '33AAICA9812K1Z5',
      incorporationDate: '2025-06-18',
      legalStructure: 'Private Limited',
      registeredAddress: '14, AJK Campus, Navakkarai, Coimbatore - 641105, Tamil Nadu',
      website: 'https://agricool.in',
      sectorCode: 'AGRITECH',
      problemStatement: 'Severe post-harvest spoilage of fresh perishables (tomatoes, bananas, flowers) in Western Tamil Nadu due to high cold-room capital costs and erratic rural grid power.',
      solutionDescription: 'Modular, decentralized thermal-storage micro cold rooms powered by rooftop solar with real-time IoT humidity/temperature telemetry and WhatsApp farmer dispatch alerts.',
      technologyStack: 'Phase-Change Material (PCM) Thermal Batteries, ESP32 Microcontrollers, LoRaWAN / Cellular Gateway, Cloud Telemetry Engine',
      currentTrl: 7,
      businessModel: 'Cooling-as-a-Service (CaaS) @ ₹1.5/kg/day + Hardware Lease to FPOs and Farmer Cooperatives',
      targetMarket: 'Smallholder horticultural farmers and FPOs in Coimbatore, Tiruppur, Erode, and Nilgiris districts',
      revenueModel: 'Recurring CaaS subscription + annual maintenance contracts',
      currentAnnualRevenue: 1450000.00,
      totalFundingRaised: 500000.00,
      fundingRequired: 1500000.00,
      incubationStatus: 'INCUBATION_ACTIVE',
      tanseedStatus: 'FINAL_STAGE',
      isHistoricallySupported: true,
      formalAdmissionDate: '2026-09-29'
    }, ceoUser.id, 'ceo@aiif.org.in');

    console.log(`Created Startup: ${startup.aiif_startup_id} (${startup.legal_name})`);

    // 2. Add Founders
    founderSvc.createFounder({
      startupId: startup.id,
      fullName: 'Dr. R. Vigneshwaran',
      designation: 'Founder & Chief Executive Officer',
      email: 'vignesh@agricool.in',
      phone: '+919842176540',
      dinNumber: '09812734',
      ownershipPercentage: 65.00,
      profileSummary: 'Ph.D. in Agricultural Engineering with 8 years research experience in cold chain thermodynamics.',
      linkedinUrl: 'https://linkedin.com/in/dr-r-vigneshwaran',
      isPrimaryContact: true
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    founderSvc.createFounder({
      startupId: startup.id,
      fullName: 'Ms. Priyadharshini M.',
      designation: 'Co-Founder & Chief Technology Officer',
      email: 'priya@agricool.in',
      phone: '+919842176541',
      dinNumber: '09812735',
      ownershipPercentage: 35.00,
      profileSummary: 'M.Tech in Embedded Systems, ex-R&D engineer specializing in IoT sensor arrays and battery management systems.',
      linkedinUrl: 'https://linkedin.com/in/priya-m-agricool',
      isPrimaryContact: false
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    // 3. Add Verified Historical Support Records (Anti-fabrication genuine evidence)
    historySvc.createRecord({
      startupId: startup.id,
      activityDate: '2025-08-12',
      activityCategory: 'FOUNDER_MEETING',
      aiifSupportDescription: 'Initial discovery meeting with AIIF incubation team. Evaluated technology prototype and advised on incorporation roadmap.',
      participantsText: 'Dr. R. Vigneshwaran, AIIF CEO, Incubation Manager',
      evidenceSummary: 'Meeting notes in AIIF logbook and initial prototype demonstration photographs',
      verifiedBy: mgrUser.id
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    historySvc.createRecord({
      startupId: startup.id,
      activityDate: '2025-10-24',
      activityCategory: 'PITCH_REVIEW',
      aiifSupportDescription: 'Conducted pitch deck critique and financial model audit for Tamil Nadu Startup Seed Grant Fund (TANSEED 7.0) submission.',
      participantsText: 'Founders, AIIF Mentors, External Chartered Accountant',
      evidenceSummary: 'Pitch deck annotated review draft v1.4 sent via email on 2025-10-24',
      verifiedBy: mgrUser.id
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    historySvc.createRecord({
      startupId: startup.id,
      activityDate: '2026-02-18',
      activityCategory: 'TANSEED_FACILITATION',
      aiifSupportDescription: 'Facilitated mock pitch session ahead of TANSEED jury shortlist evaluation and provided institutional facilitation letter.',
      participantsText: 'Dr. R. Vigneshwaran, AIIF Incubation Committee',
      evidenceSummary: 'Mock jury scoring matrix and confirmation email from StartupTN portal',
      verifiedBy: mgrUser.id
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    // 4. Formal Evaluation
    evalSvc.submitEvaluation({
      startupId: startup.id,
      evaluatorId: mgrUser.id,
      scores: {
        PROBLEM_RELEVANCE: 10,
        INNOVATION: 14,
        TECH_PRODUCT: 14,
        MARKET_POTENTIAL: 14,
        SCALABILITY: 9,
        BUSINESS_MODEL: 9,
        TEAM_CAPABILITY: 10,
        TRACTION_VALIDATION: 9,
        SOCIAL_IMPACT: 5
      },
      evaluatorComments: 'Highly viable agritech solution addressing regional farming bottlenecks with strong technical competence and proven pilot traction.',
      conditionsPrescribed: 'Startup to complete formal agreement execution and adhere to quarterly milestone audits.'
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    // 5. Formal Committee Meeting & Resolution
    const meeting = committeeSvc.createMeeting({
      meetingDate: '2026-09-29',
      meetingVenue: 'AIIF Executive Boardroom, Navakkarai',
      membersPresent: [
        { name: 'Dr. A. J. K. Chairman', designation: 'Chairman, Incubation Council', role: 'CHAIR' },
        { name: 'Chief Executive Officer', designation: 'CEO, AIIF', role: 'CONVENOR' },
        { name: 'Dr. K. S. Principal', designation: 'Principal, AJKCAS', role: 'MEMBER' },
        { name: 'Mr. V. Sundar', designation: 'Managing Partner, Coimbatore Angel Network', role: 'EXTERNAL_EXPERT' }
      ],
      agendaSummary: 'Formal review and admission of TANSEED final-stage incubatees to AIIF',
      officialMinutes: 'Committee reviewed evaluation score of 94/100 and historical evidence file. Unanimously resolved to formally admit the startup to the incubation programme with effect from 2026-09-29.',
      createdBy: ceoUser.id
    }, ceoUser.id, 'ceo@aiif.org.in');

    committeeSvc.recordDecision({
      meetingId: meeting.id,
      startupId: startup.id,
      decision: 'APPROVED',
      formalResolutionText: 'RESOLVED THAT AgriCool Innovations Private Limited be formally admitted into the AIIF Incubation Programme effective 29th September 2026, subject to execution of the Incubation and Startup Support Agreement.',
      effectiveAdmissionDate: '2026-09-29',
      signedByChairperson: 'Dr. A. J. K. Chairman'
    }, ceoUser.id, 'ceo@aiif.org.in');

    // 6. Formal Agreement Execution (Anti-backdating: current date execution)
    const draftAgr = agreementSvc.createDraftAgreement({
      startupId: startup.id,
      formalCommencementDate: '2026-09-29',
      durationMonths: 12,
      equityPercentage: 0.0,
      aiifSignatoryName: 'Chief Executive Officer',
      startupSignatoryName: 'Dr. R. Vigneshwaran',
      termsClauses: {
        ipOwnership: '100% Retained by Startup Founders',
        facilityAccess: 'AIIF IoT and Rapid Prototyping Laboratory access',
        supportServices: 'Mentorship, TANSEED grant compliance tracking, accounting and legal guidance'
      }
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    agreementSvc.executeAgreement(draftAgr.id, '2026-09-29', undefined, ceoUser.id, 'ceo@aiif.org.in');

    // 7. Register and Assign Mentors
    const mentor = mentorSvc.createMentor({
      fullName: 'Dr. C. P. Subramaniam',
      primaryDomain: 'Cold Chain Engineering & CleanTech',
      organization: 'Tamil Nadu Agricultural University / Ex-Advisor',
      designation: 'Honorary Mentor & Technical Consultant',
      email: 'mentor.cp@aiif.org.in',
      phone: '+919843012345',
      linkedinUrl: 'https://linkedin.com/in/dr-cp-subramaniam',
      expertiseTags: ['Thermal Engineering', 'Agricultural Storage', 'Grant Readiness']
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    mentorSvc.assignMentorToStartup(
      startup.id,
      mentor.id,
      'Guide IoT telemetry calibration, field validation reports, and TANSEED jury final pitch preparation.',
      ceoUser.id,
      'ceo@aiif.org.in'
    );

    mentorSvc.recordSession({
      startupId: startup.id,
      mentorId: mentor.id,
      sessionDate: '2026-09-29',
      durationMinutes: 90,
      topicsDiscussed: 'Review of Phase 2 field validation data from Thondamuthur FPO; TANSEED Final Stage pitch deck refinement.',
      adviceActionItems: 'Highlight ROI metrics per smallholder farmer in slide 6; include sensor temperature log charts.',
      founderCommitments: 'Incorporate real-time sensor graphs into pitch by tomorrow evening.',
      mentorRecommendations: 'Highly confident in technical readiness for grand jury presentation.',
      nextMeetingDate: '2026-10-06'
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    // 8. Milestones
    milestoneSvc.createMilestone({
      startupId: startup.id,
      title: 'Field Deployment with Thondamuthur Farmers Producer Org',
      category: 'PILOT',
      baselineState: 'Lab prototype unit operating in test environment',
      targetState: '2 operational 5-metric-ton solar micro cold rooms active at farm gate',
      targetDueDate: '2026-11-30',
      status: 'IN_PROGRESS'
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    milestoneSvc.createMilestone({
      startupId: startup.id,
      title: 'TANSEED 7.0 Seed Grant Final Jury & Sanction',
      category: 'FUNDING',
      baselineState: 'Shortlisted for Grand Jury evaluation',
      targetState: 'Final selection and receipt of formal ₹10 Lakhs grant sanction letter',
      targetDueDate: '2026-10-31',
      status: 'IN_PROGRESS'
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    // 9. TANSEED Scheme Tracker
    schemeSvc.createApplication({
      startupId: startup.id,
      schemeCode: 'TANSEED',
      externalApplicationNo: 'TANSEED-7.0-AGR-0042',
      submissionDate: '2025-11-04',
      currentStage: 'FINAL_STAGE',
      fundingAmountRequested: 1000000.00,
      fundingAmountSanctioned: 0.00,
      disbursementStatus: 'PENDING',
      officialCommunicationsLog: 'Application submitted -> Shortlisted in round 1 -> Pitch presentation completed -> Selected for Final Grand Jury (Scheduled October 2026)',
      finalOutcomeNotes: 'Startup has completed all institutional reviews and is fully compliant with documentation standards.'
    }, mgrUser.id, 'incubation.manager@aiif.org.in');

    // 10. Generate Branded Institutional Document Records
    docSvc.createDocument({
      startupId: startup.id,
      documentType: 'INSTITUTIONAL_SUPPORT_LETTER',
      title: 'AIIF Institutional Support & Incubation Confirmation Letter',
      preparedBy: mgrUser.id,
      approvedBy: ceoUser.id
    }, ceoUser.id, 'ceo@aiif.org.in');

    docSvc.createDocument({
      startupId: startup.id,
      documentType: 'TANSEED_SUPPORT_LETTER',
      title: 'Official AIIF TANSEED 7.0 Recommendation & Incubation Support Letter',
      preparedBy: mgrUser.id,
      approvedBy: ceoUser.id
    }, ceoUser.id, 'ceo@aiif.org.in');

    console.log('Successfully seeded TANSEED Finalist Master File with full auditable trail.');
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  try {
    seedDemoData();
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}
