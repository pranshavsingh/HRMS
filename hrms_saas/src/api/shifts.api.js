import API from "./axios";

export const shiftsApi = {
  // --- Shift Templates ---
  async list(params = {}) {
    const res = await API.get("/v1/shifts", { params });
    return res.data;
  },

  async getById(id) {
    const res = await API.get(`/v1/shifts/${id}`);
    return res.data;
  },

  async create(data) {
    const res = await API.post("/v1/shifts", data);
    return res.data;
  },

  async update(id, data) {
    const res = await API.patch(`/v1/shifts/${id}`, data);
    return res.data;
  },

  async toggleStatus(id, isActive) {
    const res = await API.patch(`/v1/shifts/${id}/status`, { is_active: isActive });
    return res.data;
  },

  async delete(id) {
    const res = await API.delete(`/v1/shifts/${id}`);
    return res.data;
  },

  // --- Shift Versions ---
  async getVersions(shiftId) {
    const res = await API.get(`/v1/shifts/${shiftId}/versions`);
    return res.data;
  },

  async getVersion(shiftId, versionId) {
    const res = await API.get(`/v1/shifts/${shiftId}/versions/${versionId}`);
    return res.data;
  },

  async createDraftVersion(shiftId, data) {
    const res = await API.post(`/v1/shifts/${shiftId}/versions`, data);
    return res.data;
  },

  async updateDraftVersion(shiftId, versionId, data) {
    const res = await API.patch(`/v1/shifts/${shiftId}/versions/${versionId}`, data);
    return res.data;
  },

  async publishVersion(shiftId, versionId) {
    const res = await API.post(`/v1/shifts/${shiftId}/versions/${versionId}/publish`);
    return res.data;
  },

  async archiveVersion(shiftId, versionId) {
    const res = await API.post(`/v1/shifts/${shiftId}/versions/${versionId}/archive`);
    return res.data;
  },

  // --- Shift Breaks ---
  async getBreaks(shiftId, versionId) {
    const res = await API.get(`/v1/shifts/${shiftId}/versions/${versionId}/breaks`);
    return res.data;
  },

  async addBreak(shiftId, versionId, data) {
    const res = await API.post(`/v1/shifts/${shiftId}/versions/${versionId}/breaks`, data);
    return res.data;
  },

  async updateBreak(shiftId, versionId, breakId, data) {
    const res = await API.patch(`/v1/shifts/${shiftId}/versions/${versionId}/breaks/${breakId}`, data);
    return res.data;
  },

  async deleteBreak(shiftId, versionId, breakId) {
    const res = await API.delete(`/v1/shifts/${shiftId}/versions/${versionId}/breaks/${breakId}`);
    return res.data;
  },

  // --- Company Attendance Policies ---
  async listCompanyPolicies() {
    const res = await API.get("/v1/workforce/policies");
    return res.data;
  },

  async createCompanyPolicy(data) {
    const res = await API.post("/v1/workforce/policies", data);
    return res.data;
  },

  async createDraftCompanyPolicyVersion(policyId, data) {
    const res = await API.post(`/v1/workforce/policies/${policyId}/versions`, data);
    return res.data;
  },

  async publishCompanyPolicy(policyId, versionId) {
    const res = await API.post(`/v1/workforce/policies/${policyId}/versions/${versionId}/publish`);
    return res.data;
  },

  // --- Weekly-Off Policies ---
  async listWeeklyOffPolicies() {
    const res = await API.get("/v1/workforce/weekly-off-policies");
    return res.data;
  },

  async createWeeklyOffPolicy(data) {
    const res = await API.post("/v1/workforce/weekly-off-policies", data);
    return res.data;
  },

  async createDraftWeeklyOffPolicyVersion(policyId, data) {
    const res = await API.post(`/v1/workforce/weekly-off-policies/${policyId}/versions`, data);
    return res.data;
  },

  async publishWeeklyOffPolicy(policyId, versionId) {
    const res = await API.post(`/v1/workforce/weekly-off-policies/${policyId}/versions/${versionId}/publish`);
    return res.data;
  },

  // --- Stage 3: Shift Assignments ---
  async listAssignments(params = {}) {
    const res = await API.get("/v1/workforce/assignments", { params });
    return res.data;
  },

  async getAssignment(id) {
    const res = await API.get(`/v1/workforce/assignments/${id}`);
    return res.data;
  },

  async createDraftAssignment(data) {
    const res = await API.post("/v1/workforce/assignments", data);
    return res.data;
  },

  async publishAssignment(id) {
    const res = await API.post(`/v1/workforce/assignments/${id}/publish`);
    return res.data;
  },

  async cancelAssignment(id, reason) {
    const res = await API.post(`/v1/workforce/assignments/${id}/cancel`, { reason });
    return res.data;
  },

  async bulkAssign(data) {
    const res = await API.post("/v1/workforce/assignments/bulk", data);
    return res.data;
  },

  // --- Stage 3: Rotation Patterns ---
  async listRotations(params = {}) {
    const res = await API.get("/v1/workforce/rotations", { params });
    return res.data;
  },

  async getRotation(id) {
    const res = await API.get(`/v1/workforce/rotations/${id}`);
    return res.data;
  },

  async createRotation(data) {
    const res = await API.post("/v1/workforce/rotations", data);
    return res.data;
  },

  async publishRotation(id) {
    const res = await API.post(`/v1/workforce/rotations/${id}/publish`);
    return res.data;
  },

  async enrollRotation(id, data) {
    const res = await API.post(`/v1/workforce/rotations/${id}/enroll`, data);
    return res.data;
  },

  async previewRotation(id, params = {}) {
    const res = await API.get(`/v1/workforce/rotations/${id}/preview`, { params });
    return res.data;
  },

  // --- Stage 3: Roster Management ---
  async listRosters(params = {}) {
    const res = await API.get("/v1/workforce/rosters", { params });
    return res.data;
  },

  async getRoster(id) {
    const res = await API.get(`/v1/workforce/rosters/${id}`);
    return res.data;
  },

  async generateDraftRoster(data) {
    const res = await API.post("/v1/workforce/rosters/generate", data);
    return res.data;
  },

  async getRosterCalendar(params = {}) {
    const res = await API.get("/v1/workforce/rosters/calendar", { params });
    return res.data;
  },

  async publishRoster(id) {
    const res = await API.post(`/v1/workforce/rosters/${id}/publish`);
    return res.data;
  },

  // --- Stage 3: Employee Self-Service Roster ---
  async getMyRoster(params = {}) {
    const res = await API.get("/v1/workforce/rosters/my-roster", { params });
    return res.data;
  }
};

export default shiftsApi;
