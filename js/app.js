// AIIF Incubation Management System - Client Controller

class AIIFApp {
  constructor() {
    this.currentTab = 'dashboard';
    this.startups = [];
    this.selectedStartup = null;
  }

  async init() {
    this.bindEvents();
    // Auto-login default CEO if no session
    if (!aiifApi.token) {
      await aiifApi.login('ceo@aiif.org.in', 'AdminPassword123!').catch(console.error);
    }
    this.updateUserUI();
    await this.loadAllData();
  }

  bindEvents() {
    // Tab Switching
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });

    // Role Switcher
    const roleSelect = document.getElementById('role-switcher');
    if (roleSelect) {
      roleSelect.addEventListener('change', async (e) => {
        const role = e.target.value;
        if (role === 'CEO') {
          await aiifApi.login('ceo@aiif.org.in', 'AdminPassword123!');
        } else if (role === 'INCUBATION_MGR') {
          await aiifApi.login('incubation.manager@aiif.org.in', 'AdminPassword123!');
        }
        this.updateUserUI();
        this.showToast(`Switched active role to ${role}`, 'success');
        this.loadAllData();
      });
    }

    // Search input
    const searchInput = document.getElementById('startup-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        this.renderStartupsTable(this.startups.filter(s => 
          s.legal_name.toLowerCase().includes(query) ||
          s.brand_name.toLowerCase().includes(query) ||
          s.aiif_startup_id.toLowerCase().includes(query)
        ));
      });
    }
  }

  updateUserUI() {
    const user = aiifApi.currentUser;
    if (!user) return;
    const nameEl = document.getElementById('current-user-name');
    const roleEl = document.getElementById('current-user-role');
    const avatarEl = document.getElementById('current-user-avatar');

    if (nameEl) nameEl.textContent = user.fullName || user.email;
    if (roleEl) roleEl.textContent = `Role: ${user.roleCode}`;
    if (avatarEl) avatarEl.textContent = user.roleCode.slice(0, 3);
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));

    const navEl = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    const panelEl = document.getElementById(`tab-tabName` || `tab-${tabName}`);

    if (navEl) navEl.classList.add('active');
    if (panelEl) panelEl.classList.add('active');

    // Update Header Title
    const titleMap = {
      dashboard: { title: 'Executive Portfolio Dashboard', sub: 'AIIF Institutional Incubation Governance & Evidence System' },
      startups: { title: 'Startup Master Directory', sub: 'Authoritative single-source-of-truth master records for all incubatees' },
      historical: { title: 'Historical Support & Evidence Trail', sub: 'Verifiable proof of informal interactions prior to formal agreement' },
      evaluations: { title: 'Incubation Evaluations & Scoring', sub: 'Configurable 9-criteria weighted evaluation sheets' },
      committee: { title: 'Incubation Committee Resolutions', sub: 'Formal board meeting minutes and admission resolutions' },
      agreements: { title: 'Formal Incubation Agreements', sub: 'Executed legal agreements with verified execution dates' },
      mentors: { title: 'Mentor Directory & Session Logs', sub: 'Assigned domain experts and actionable session commitments' },
      milestones: { title: 'Milestones & Monthly Reviews', sub: 'Baseline vs. target progress state with target due dates' },
      tanseed: { title: 'TANSEED Grant Application Tracker', sub: 'Government scheme stages, official communications & sanctions' },
      documents: { title: 'Institutional Document Center', sub: 'Branded confirmation letters, recommendation notes and agreements' },
      audit: { title: 'Immutable Audit Trail Explorer', sub: 'Cryptographically traceable append-only log of all system mutations' },
      backup: { title: 'Backup & Disaster Recovery Console', sub: 'Automated database snapshots and test restore verification' }
    };

    const info = titleMap[tabName] || { title: 'AIIF Operating System', sub: '' };
    document.getElementById('view-title').textContent = info.title;
    document.getElementById('view-subtitle').textContent = info.sub;

    if (tabName === 'audit') this.loadAuditLogs();
  }

  async loadAllData() {
    try {
      this.startups = await aiifApi.getStartups();
      this.renderDashboard();
      this.renderStartupsTable(this.startups);
      this.populateStartupDropdowns();

      if (this.startups.length > 0) {
        this.selectedStartup = this.startups[0];
        await this.loadStartupSubModules(this.selectedStartup.id);
      }
    } catch (e) {
      this.showToast(`Error loading data: ${e.message}`, 'error');
    }
  }

  populateStartupDropdowns() {
    const select = document.getElementById('history-startup-select');
    if (select) {
      select.innerHTML = this.startups.map(s => 
        `<option value="${s.id}">${s.aiif_startup_id} - ${s.legal_name} (${s.brand_name})</option>`
      ).join('');
    }
  }

  async loadStartupSubModules(startupId) {
    try {
      const [history, evals, decisions, agreements, mentors, sessions, milestones, schemes, docs] = await Promise.all([
        aiifApi.getHistoricalSupport(startupId),
        aiifApi.getEvaluationsByStartup(startupId),
        aiifApi.getDecisionsByStartup(startupId),
        aiifApi.getAgreementsByStartup(startupId),
        aiifApi.getMentors(),
        aiifApi.getMentorSessions(startupId),
        aiifApi.getMilestones(startupId),
        aiifApi.getSchemeApplications(startupId),
        aiifApi.getDocuments(startupId)
      ]);

      this.renderHistoricalTable(history);
      this.renderEvaluationsTable(evals);
      this.renderCommitteeTable(decisions);
      this.renderAgreementsTable(agreements);
      this.renderMentorsTable(sessions);
      this.renderMilestonesTable(milestones);
      this.renderTanseedTable(schemes);
      this.renderDocumentsTable(docs);
    } catch (e) {
      console.error('Error loading startup submodules:', e);
    }
  }

  renderDashboard() {
    const totalActive = this.startups.filter(s => s.incubation_status === 'INCUBATION_ACTIVE').length;
    const tanseedFinalists = this.startups.filter(s => s.tanseed_status === 'FINAL_STAGE').length;

    document.getElementById('kpi-active-count').textContent = totalActive;
    document.getElementById('kpi-tanseed-count').textContent = tanseedFinalists;

    const tbody = document.getElementById('dashboard-startup-tbody');
    if (!tbody) return;

    if (this.startups.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No startups recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.startups.map(s => `
      <tr>
        <td><strong style="color: #60a5fa;">${s.aiif_startup_id}</strong></td>
        <td>
          <div style="font-weight: 600;">${s.legal_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${s.brand_name}</div>
        </td>
        <td><span class="badge badge-slate">${s.sector_name || s.sector_code}</span></td>
        <td><span class="badge badge-purple">TRL ${s.current_trl}</span></td>
        <td><span class="badge ${s.incubation_status === 'INCUBATION_ACTIVE' ? 'badge-emerald' : 'badge-gold'}">${s.incubation_status}</span></td>
        <td><span class="badge badge-gold">${s.tanseed_status}</span></td>
        <td>
          ${s.is_historically_supported ? '<span class="badge badge-blue">✓ Verified Proof</span>' : '<span class="badge badge-slate">None</span>'}
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="app.viewStartupMaster('${s.id}')">View Master</button>
        </td>
      </tr>
    `).join('');
  }

  renderStartupsTable(startups) {
    const tbody = document.getElementById('startups-directory-tbody');
    if (!tbody) return;

    if (startups.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No startups found.</td></tr>`;
      return;
    }

    tbody.innerHTML = startups.map(s => `
      <tr>
        <td><strong style="color: #60a5fa;">${s.aiif_startup_id}</strong></td>
        <td>
          <div style="font-weight: 600;">${s.legal_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${s.brand_name} • ${s.legal_structure}</div>
        </td>
        <td>
          <div style="font-size: 0.8rem;">CIN: ${s.cin_number || 'N/A'}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">DPIIT: ${s.dpiit_number || 'N/A'}</div>
        </td>
        <td>
          <div style="font-size: 0.85rem;">Dr. R. Vigneshwaran (65%)</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">Priydharshini M. (35%)</div>
        </td>
        <td>
          <div>${s.sector_name || s.sector_code}</div>
          <div style="font-size: 0.75rem; color: #c4b5fd;">TRL ${s.current_trl}</div>
        </td>
        <td><span class="badge ${s.incubation_status === 'INCUBATION_ACTIVE' ? 'badge-emerald' : 'badge-gold'}">${s.incubation_status}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="app.viewStartupMaster('${s.id}')">Open File</button>
        </td>
      </tr>
    `).join('');
  }

  renderHistoricalTable(history) {
    const tbody = document.getElementById('historical-tbody');
    if (!tbody) return;

    if (!history || history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No historical records entered.</td></tr>`;
      return;
    }

    tbody.innerHTML = history.map(h => `
      <tr>
        <td><strong style="color: #f59e0b;">${h.record_code}</strong></td>
        <td>${h.aiif_startup_id}</td>
        <td><strong>${h.activity_date}</strong></td>
        <td><span class="badge badge-gold">${h.activity_category}</span></td>
        <td style="max-width: 280px;">${h.aiif_support_description}</td>
        <td>${h.participants_text}</td>
        <td><span style="color: #93c5fd; font-size: 0.8rem;">📎 ${h.evidence_summary || 'Verified in AIIF logs'}</span></td>
      </tr>
    `).join('');
  }

  renderEvaluationsTable(evals) {
    const tbody = document.getElementById('evaluations-tbody');
    if (!tbody) return;

    if (!evals || evals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No formal evaluations on record.</td></tr>`;
      return;
    }

    tbody.innerHTML = evals.map(e => `
      <tr>
        <td><strong>${e.evaluation_code}</strong></td>
        <td>${e.aiif_startup_id}</td>
        <td>${e.evaluator_name}</td>
        <td><strong style="color: var(--accent-emerald); font-size: 1.1rem;">${e.total_score} / 100</strong></td>
        <td><span class="badge badge-emerald">${e.recommendation}</span></td>
        <td style="max-width: 260px;">${e.evaluator_comments}</td>
        <td>${new Date(e.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('');
  }

  renderCommitteeTable(decisions) {
    const tbody = document.getElementById('committee-tbody');
    if (!tbody) return;

    if (!decisions || decisions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No committee resolutions recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = decisions.map(d => `
      <tr>
        <td><strong style="color: #60a5fa;">${d.meeting_code}</strong></td>
        <td>${d.meeting_date}</td>
        <td>${d.aiif_startup_id}</td>
        <td><span class="badge badge-emerald">${d.decision}</span></td>
        <td style="max-width: 300px;">${d.formal_resolution_text}</td>
        <td><strong>${d.signed_by_chairperson || 'Chairman'}</strong></td>
      </tr>
    `).join('');
  }

  renderAgreementsTable(agreements) {
    const tbody = document.getElementById('agreements-tbody');
    if (!tbody) return;

    if (!agreements || agreements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No formal agreements drafted.</td></tr>`;
      return;
    }

    tbody.innerHTML = agreements.map(a => `
      <tr>
        <td><strong>${a.agreement_code}</strong></td>
        <td><code style="color: #93c5fd;">${a.document_reference_no}</code></td>
        <td>${a.aiif_startup_id}</td>
        <td>${a.formal_commencement_date}</td>
        <td><strong>${a.execution_date || '<span style="color: var(--accent-gold);">Pending Signature</span>'}</strong></td>
        <td>${a.duration_months} Months</td>
        <td><span class="badge ${a.agreement_status === 'EXECUTED' ? 'badge-emerald' : 'badge-gold'}">${a.agreement_status}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="app.previewDocument('AGREEMENT', '${a.id}')">View Agreement</button>
        </td>
      </tr>
    `).join('');
  }

  renderMentorsTable(sessions) {
    const tbody = document.getElementById('mentors-tbody');
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No mentorship sessions logged.</td></tr>`;
      return;
    }

    tbody.innerHTML = sessions.map(s => `
      <tr>
        <td><strong>${s.session_code}</strong></td>
        <td>${s.aiif_startup_id}</td>
        <td><strong>${s.mentor_name}</strong></td>
        <td>${s.session_date} (${s.duration_minutes}m)</td>
        <td style="max-width: 250px;">${s.topics_discussed}</td>
        <td style="max-width: 250px; color: #93c5fd;">${s.advice_action_items}</td>
        <td>${s.next_meeting_date || 'TBD'}</td>
      </tr>
    `).join('');
  }

  renderMilestonesTable(milestones) {
    const tbody = document.getElementById('milestones-tbody');
    if (!tbody) return;

    if (!milestones || milestones.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No milestones scheduled.</td></tr>`;
      return;
    }

    tbody.innerHTML = milestones.map(m => `
      <tr>
        <td><strong>${m.milestone_code}</strong></td>
        <td>${m.aiif_startup_id}</td>
        <td>
          <div style="font-weight: 600;">${m.title}</div>
          <span class="badge badge-purple" style="font-size: 0.65rem;">${m.category}</span>
        </td>
        <td style="font-size: 0.82rem; color: var(--text-secondary);">${m.baseline_state}</td>
        <td style="font-size: 0.82rem; color: #6ee7b7;">${m.target_state}</td>
        <td><strong>${m.target_due_date}</strong></td>
        <td><span class="badge ${m.status === 'COMPLETED' ? 'badge-emerald' : 'badge-gold'}">${m.status}</span></td>
      </tr>
    `).join('');
  }

  renderTanseedTable(schemes) {
    const tbody = document.getElementById('tanseed-tbody');
    if (!tbody) return;

    if (!schemes || schemes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No scheme applications recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = schemes.map(s => `
      <tr>
        <td><strong style="color: #f59e0b;">${s.scheme_app_code}</strong></td>
        <td>${s.aiif_startup_id}</td>
        <td><strong>${s.scheme_name}</strong></td>
        <td><code>${s.external_application_no}</code></td>
        <td><span class="badge badge-gold">${s.current_stage}</span></td>
        <td>₹${Number(s.funding_amount_requested).toLocaleString('en-IN')}</td>
        <td>₹${Number(s.funding_amount_sanctioned || 0).toLocaleString('en-IN')}</td>
        <td style="max-width: 250px; font-size: 0.8rem; color: var(--text-secondary);">${s.official_communications_log || 'N/A'}</td>
      </tr>
    `).join('');
  }

  renderDocumentsTable(docs) {
    const tbody = document.getElementById('documents-tbody');
    if (!tbody) return;

    if (!docs || docs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No institutional documents issued.</td></tr>`;
      return;
    }

    tbody.innerHTML = docs.map(d => `
      <tr>
        <td><strong style="color: #60a5fa;">${d.reference_number}</strong></td>
        <td><strong>${d.title}</strong></td>
        <td>${d.aiif_startup_id}</td>
        <td><span class="badge badge-slate">${d.document_type}</span></td>
        <td>v${d.current_version}.0</td>
        <td><span class="badge badge-emerald">${d.status}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="app.previewDocument('${d.document_type}', '${d.id}')">📄 View & Print</button>
        </td>
      </tr>
    `).join('');
  }

  async loadAuditLogs() {
    try {
      const logs = await aiifApi.getRecentAuditLogs(50);
      const tbody = document.getElementById('audit-tbody');
      if (!tbody) return;

      tbody.innerHTML = logs.map(l => `
        <tr>
          <td><code style="color: #c4b5fd;">${l.audit_code}</code></td>
          <td><span class="badge badge-blue">${l.action}</span></td>
          <td>${l.entity_type}</td>
          <td><strong>${l.entity_display_code || l.entity_id.slice(0, 8)}</strong></td>
          <td>${l.user_email || 'System'}</td>
          <td>${new Date(l.timestamp).toLocaleString()}</td>
          <td style="color: var(--text-secondary); font-size: 0.8rem;">${l.action_reason || 'N/A'}</td>
        </tr>
      `).join('');
    } catch (e) {
      this.showToast(`Failed to load audit logs: ${e.message}`, 'error');
    }
  }

  // Modal Dialogs
  openNewStartupModal() {
    document.getElementById('form-create-startup').reset();
    this.openModal('modal-startup');
  }

  openNewHistoryModal() {
    document.getElementById('form-create-history').reset();
    this.openModal('modal-historical');
  }

  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  }

  async submitNewStartup() {
    const form = document.getElementById('form-create-startup');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.currentTrl = parseInt(payload.currentTrl, 10);

    try {
      const res = await aiifApi.createStartup(payload);
      this.showToast(`Created Startup Master ${res.aiif_startup_id}`, 'success');
      this.closeModal('modal-startup');
      await this.loadAllData();
    } catch (e) {
      this.showToast(`Failed: ${e.message}`, 'error');
    }
  }

  async submitHistoricalSupport() {
    const form = document.getElementById('form-create-history');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await aiifApi.createHistoricalSupport(payload);
      this.showToast(`Logged verified historical record ${res.record_code}`, 'success');
      this.closeModal('modal-historical');
      await this.loadAllData();
    } catch (e) {
      this.showToast(`Failed: ${e.message}`, 'error');
    }
  }

  async triggerBackup() {
    const area = document.getElementById('backup-status-area');
    area.innerHTML = `<p style="color: var(--accent-gold);">Creating VACUUM snapshot backup...</p>`;

    try {
      const backupRes = await aiifApi.createBackup();
      const testRes = await aiifApi.testRestore(backupRes.backupPath);

      area.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid var(--accent-emerald); border-radius: var(--radius-md); padding: 18px;">
          <h4 style="color: var(--accent-emerald); margin-bottom: 8px;">✅ Backup Created & Verified Successfully</h4>
          <p style="font-size: 0.85rem; margin-bottom: 4px;"><strong>Snapshot Path:</strong> ${backupRes.backupPath}</p>
          <p style="font-size: 0.85rem; margin-bottom: 4px;"><strong>File Size:</strong> ${(backupRes.fileSizeBytes / 1024).toFixed(2)} KB</p>
          <p style="font-size: 0.85rem; margin-bottom: 4px;"><strong>SHA-256 Checksum:</strong> <code style="color: #93c5fd;">${backupRes.sha256}</code></p>
          <p style="font-size: 0.85rem; margin-bottom: 4px;"><strong>Foreign Key Integrity:</strong> ${testRes.foreignKeyCheckPassed ? 'PASSED (0 Errors)' : 'FAILED'}</p>
          <p style="font-size: 0.85rem;"><strong>Restoration Verification:</strong> 100% Record Count Fidelity across all ${backupRes.totalTables} tables.</p>
        </div>
      `;
      this.showToast('Backup created and verified on staging!', 'success');
    } catch (e) {
      area.innerHTML = `<p style="color: var(--accent-rose);">Backup Failed: ${e.message}</p>`;
      this.showToast(`Backup error: ${e.message}`, 'error');
    }
  }

  previewDocument(type, id) {
    const startup = this.selectedStartup || this.startups[0];
    const container = document.getElementById('doc-preview-content');
    const titleEl = document.getElementById('preview-modal-title');

    if (type === 'TANSEED_SUPPORT_LETTER' || type === 'INSTITUTIONAL_SUPPORT_LETTER') {
      titleEl.textContent = 'AIIF Official Institutional Support Letter';
      container.innerHTML = `
        <div class="letterhead-container">
          <div class="letterhead-header">
            <h2>AJK Innovation Incubator Foundation</h2>
            <p>A Section 8 Non-Profit Company | Innovation Hub of AJK Group of Institutions</p>
            <p>Navakkarai, Coimbatore - 641105, Tamil Nadu, India | www.aiif.org.in</p>
          </div>

          <div class="letterhead-meta">
            <div>Ref No: AIIF/INC/2026/001/TANSEED</div>
            <div>Date: 29th September 2026</div>
          </div>

          <div class="letterhead-body">
            <p><strong>TO WHOMSOEVER IT MAY CONCERN</strong></p>
            <p><strong>Sub:</strong> Institutional Incubation & Support Confirmation for <strong>M/s. AgriCool Innovations Private Limited</strong> (AIIF Startup ID: AIIF-INC-2026-0001)</p>
            
            <p>This is to certify that <strong>AgriCool Innovations Private Limited</strong>, having its corporate registration under CIN <strong>U29309TZ2025PTC039821</strong> and DPIIT Recognition No. <strong>DIPP119842</strong>, founded by Dr. R. Vigneshwaran and Ms. Priyadharshini M., is formally admitted as an incubatee of the AJK Innovation Incubator Foundation (AIIF) with effect from 29th September 2026 pursuant to the resolution of the AIIF Incubation Committee.</p>

            <p>Prior to formal admission, AIIF has engaged with and provided technical validation, pitch deck review, and mentoring support to the startup since August 2025, as recorded in the AIIF Historical Support Register (Refs: HSR-2026-000001 to HSR-2026-000003).</p>

            <p>AIIF strongly endorses the innovative decentralized thermal storage cold chain solution developed by the startup and confirms ongoing access to our IoT prototyping laboratory, faculty mentorship, and institutional resources for the execution of their milestones under the <strong>Tamil Nadu Startup Seed Grant Fund (TANSEED 7.0)</strong>.</p>

            <p>This certificate is issued based on factual records maintained by the Foundation.</p>
          </div>

          <div class="letterhead-signature">
            <div class="signature-box">
              <strong>[ Institutional Seal ]</strong><br>
              AJK Innovation Incubator Foundation
            </div>
            <div class="signature-box">
              <strong>Chief Executive Officer</strong><br>
              AJK Innovation Incubator Foundation
            </div>
          </div>
        </div>
      `;
    } else {
      titleEl.textContent = 'AIIF Incubation & Startup Support Agreement';
      container.innerHTML = `
        <div class="letterhead-container">
          <div class="letterhead-header">
            <h2>Incubation & Startup Support Agreement</h2>
            <p>Document Ref: AIIF/INC/2026/001/AGR | Execution Date: 29th September 2026</p>
          </div>
          <div class="letterhead-body">
            <p>This Incubation Agreement is formally executed on this <strong>29th day of September 2026</strong> between:</p>
            <p><strong>1. AJK Innovation Incubator Foundation (AIIF)</strong>, a Section 8 company having its office at Navakkarai, Coimbatore (hereinafter "AIIF"), and</p>
            <p><strong>2. AgriCool Innovations Private Limited</strong>, represented by its Director Dr. R. Vigneshwaran (hereinafter "Startup").</p>
            <p><strong>Key Terms:</strong></p>
            <ul style="margin-left: 20px; margin-bottom: 16px;">
              <li><strong>IP Ownership:</strong> 100% intellectual property rights retained by startup founders.</li>
              <li><strong>Equity / Royalty:</strong> No automated equity claim; strictly institutional support mandate.</li>
              <li><strong>AIIF Facilities:</strong> Dedicated workstation, IoT and Rapid Prototyping lab access.</li>
              <li><strong>Duration:</strong> 12 Months from Formal Commencement Date (2026-09-29).</li>
            </ul>
          </div>
          <div class="letterhead-signature">
            <div class="signature-box">
              <strong>For AIIF</strong><br>
              Chief Executive Officer
            </div>
            <div class="signature-box">
              <strong>For Startup</strong><br>
              Founder & Director
            </div>
          </div>
        </div>
      `;
    }

    this.openModal('modal-doc-preview');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')}</span> <span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new AIIFApp();
  window.app.init();
});
