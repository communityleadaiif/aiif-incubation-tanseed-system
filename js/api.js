// AIIF API Client with JWT Auth & Optimistic Concurrency Support

class AIIFApiClient {
  constructor() {
    this.baseUrl = window.location.origin;
    this.token = localStorage.getItem('aiif_session_token') || null;
    this.currentUser = JSON.parse(localStorage.getItem('aiif_session_user') || 'null');
  }

  setSession(token, user) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem('aiif_session_token', token);
    localStorage.setItem('aiif_session_user', JSON.stringify(user));
  }

  clearSession() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('aiif_session_token');
    localStorage.removeItem('aiif_session_user');
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      // Auto re-login as default CEO for smooth interactive demo if token expires
      if (endpoint !== '/api/auth/login') {
        const autoLogin = await this.login('ceo@aiif.org.in', 'AdminPassword123!');
        if (autoLogin) {
          return this.request(endpoint, options);
        }
      }
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error || `HTTP error ${response.status}`;
      throw new Error(errorMsg);
    }

    return data;
  }

  // Auth
  async login(email, password) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setSession(res.token, res.user);
    return res.user;
  }

  // Startups
  getStartups(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/api/startups?${params.toString()}`);
  }

  getStartupById(id) {
    return this.request(`/api/startups/${id}`);
  }

  createStartup(payload) {
    return this.request('/api/startups', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  updateStartup(id, payload, expectedVersion) {
    return this.request(`/api/startups/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...payload, expectedVersion })
    });
  }

  softDeleteStartup(id, reason) {
    return this.request(`/api/startups/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason })
    });
  }

  // Founders
  getFoundersByStartup(startupId) {
    return this.request(`/api/founders/by-startup/${startupId}`);
  }

  createFounder(payload) {
    return this.request('/api/founders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Historical Support
  getHistoricalSupport(startupId) {
    return this.request(`/api/historical-support/by-startup/${startupId}`);
  }

  createHistoricalSupport(payload) {
    return this.request('/api/historical-support', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Evaluations
  getEvaluationCriteria() {
    return this.request('/api/evaluations/criteria');
  }

  getEvaluationsByStartup(startupId) {
    return this.request(`/api/evaluations/by-startup/${startupId}`);
  }

  submitEvaluation(payload) {
    return this.request('/api/evaluations/submit', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Committee
  createMeeting(payload) {
    return this.request('/api/committee/meetings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  recordDecision(payload) {
    return this.request('/api/committee/decisions', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  getDecisionsByStartup(startupId) {
    return this.request(`/api/committee/decisions/by-startup/${startupId}`);
  }

  // Agreements
  createDraftAgreement(payload) {
    return this.request('/api/agreements/draft', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  executeAgreement(id, actualExecutionDate) {
    return this.request(`/api/agreements/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ actualExecutionDate })
    });
  }

  getAgreementsByStartup(startupId) {
    return this.request(`/api/agreements/by-startup/${startupId}`);
  }

  // Mentors
  getMentors() {
    return this.request('/api/mentors');
  }

  assignMentor(payload) {
    return this.request('/api/mentors/assign', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  recordMentorSession(payload) {
    return this.request('/api/mentors/session', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  getMentorSessions(startupId) {
    return this.request(`/api/mentors/sessions/by-startup/${startupId}`);
  }

  // Milestones & Reviews
  getMilestones(startupId) {
    return this.request(`/api/milestones/by-startup/${startupId}`);
  }

  createMilestone(payload) {
    return this.request('/api/milestones', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  updateMilestone(id, payload, expectedVersion) {
    return this.request(`/api/milestones/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...payload, expectedVersion })
    });
  }

  getReviews(startupId) {
    return this.request(`/api/reviews/by-startup/${startupId}`);
  }

  createReview(payload) {
    return this.request('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Schemes & TANSEED
  getSchemeMasters() {
    return this.request('/api/schemes/masters');
  }

  getSchemeApplications(startupId) {
    return this.request(`/api/schemes/applications/by-startup/${startupId}`);
  }

  createSchemeApplication(payload) {
    return this.request('/api/schemes/applications', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  updateSchemeStage(id, payload) {
    return this.request(`/api/schemes/applications/${id}/stage`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  // Documents & Evidence
  getDocuments(startupId) {
    return this.request(`/api/documents/by-startup/${startupId}`);
  }

  createDocument(payload) {
    return this.request('/api/documents', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  attachEvidence(payload) {
    return this.request('/api/evidence/attach', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  getEvidenceForEntity(entityType, entityId) {
    return this.request(`/api/evidence/by-entity?entityType=${entityType}&entityId=${entityId}`);
  }

  // Audit Logs
  getRecentAuditLogs(limit = 100) {
    return this.request(`/api/audit-logs/recent?limit=${limit}`);
  }

  // System Backup & Restore
  createBackup() {
    return this.request('/api/system/backup/create', { method: 'POST' });
  }

  testRestore(backupPath) {
    return this.request('/api/system/backup/test-restore', {
      method: 'POST',
      body: JSON.stringify({ backupPath })
    });
  }
}

window.aiifApi = new AIIFApiClient();
