import axios from 'axios';
import type { ApiResponse } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('coding_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Unwrap ApiResponse envelope
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('coding_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// ─── Auth ───
export const authApi = {
  devLogin: (email: string, password: string) =>
    api.post<ApiResponse<{ token: string; user: unknown }>>('/auth/dev-login', { email, password }),

  ssoExchange: (smartToken: string) =>
    api.post<ApiResponse<{ token: string; user: unknown }>>('/auth/sso/exchange', {
      token: smartToken,
    }),

  getMe: () => api.get<ApiResponse>('/auth/me'),
};

// ─── Questions ───
export const questionApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<ApiResponse>('/questions', { params }),

  getById: (id: string) =>
    api.get<ApiResponse>(`/questions/${id}`),

  getByVersionId: (versionId: string) =>
    api.get<ApiResponse>(`/questions/version/${versionId}`),

  create: (data: Record<string, unknown>) =>
    api.post<ApiResponse>('/questions', data),

  updateDraft: (versionId: string, data: Record<string, unknown>) =>
    api.put<ApiResponse>(`/questions/${versionId}/draft`, data),

  addTestCases: (versionId: string, testCases: unknown[]) =>
    api.post<ApiResponse>(`/questions/${versionId}/test-cases`, { testCases: testCases }),

  addStarterCode: (versionId: string, starterCode: unknown[]) =>
    api.post<ApiResponse>(`/questions/${versionId}/starter-code`, { starterCodes: starterCode }),

  approve: (versionId: string) =>
    api.post<ApiResponse>(`/questions/${versionId}/approve`),

  reject: (versionId: string, reason: string) =>
    api.post<ApiResponse>(`/questions/${versionId}/reject`, { reason }),

  publish: (versionId: string, poolTypes: string[]) =>
    api.post<ApiResponse>(`/questions/${versionId}/publish`, { pools: poolTypes }),
};

// ─── Practice ───
export const practiceApi = {
  getPool: (params?: Record<string, string | number>) =>
    api.get<ApiResponse>('/practice/pool', { params }),

  getPersonalized: () =>
    api.get<ApiResponse>('/practice/personalized'),

  createSession: () =>
    api.post<ApiResponse>('/practice/sessions', {}),

  getSession: (sessionId: string) =>
    api.get<ApiResponse>(`/practice/sessions/${sessionId}`),

  submitCode: (data: {
    sessionId: string;
    questionId: string;
    versionId: string;
    language: string;
    sourceCode: string;
  }) =>
    api.post<ApiResponse>('/practice/submissions', data),

  getSubmission: (submissionId: string) =>
    api.get<ApiResponse>(`/practice/submissions/${submissionId}`),

  getActivity: () =>
    api.get<ApiResponse>('/practice/activity'),

  getByCourse: () =>
    api.get<ApiResponse>('/practice/by-course'),

  getByCompany: () =>
    api.get<ApiResponse>('/practice/by-company'),
};

// ─── Exam ───
export const examApi = {
  // Student-facing
  getPool: () =>
    api.get<ApiResponse>('/exam/pool'),

  /** Get pending/active attempts (ready, started, interrupted) for this student */
  getMyAttempts: () =>
    api.get<ApiResponse>('/exam/my-attempts'),

  /** Get completed exam attempts and grading results for this student */
  getCompletedAttempts: () =>
    api.get<ApiResponse>('/exam/completed-attempts'),

  createSession: (ruleTemplateId: string) =>
    api.post<ApiResponse>('/exam/sessions', { ruleTemplateId }),

  startExam: (attemptId: string) =>
    api.post<ApiResponse>(`/exam/${attemptId}/start`),

  submitCode: (attemptId: string, data: {
    questionId: string;
    versionId: string;
    language: string;
    sourceCode: string;
  }) =>
    api.post<ApiResponse>(`/exam/${attemptId}/submissions`, data),
  getSubmission: (attemptId: string, submissionId: string) =>
    api.get<ApiResponse>(`/exam/${attemptId}/submissions/${submissionId}`),

  submitExam: (attemptId: string) =>
    api.post<ApiResponse>(`/exam/${attemptId}/submit`),

  getAttempt: (attemptId: string) =>
    api.get<ApiResponse>(`/exam/${attemptId}`),

  // Returns the aural-oss session URL for re-entry (max 5 times)
  getInterviewLink: (attemptId: string) =>
    api.get<ApiResponse>(`/exam/${attemptId}/interview-link`),

  reportIncident: (
    attemptId: string,
    incidentType: string,
    metadata?: Record<string, unknown>,
  ) =>
    api.post<ApiResponse>(`/exam/${attemptId}/proctor-incident`, {
      incidentType,
      metadata,
    }),
};

// ─── Admin Exam Sessions Panel ───
export const adminExamSessionsApi = {
  /** List all exam attempts with student info, submission stats and aural-oss links */
  list: (params?: {
    page?: number;
    limit?: number;
    company?: string;
    course?: string;
    state?: string;
    date?: string;
    templateId?: string;
    withAuralDetail?: boolean;
  }) => api.get<ApiResponse>('/admin/exam-sessions', { params }),

  /** Full detail for one attempt: submissions + live aural-oss session data */
  getDetail: (attemptId: string, withAuralDetail = true) =>
    api.get<ApiResponse>(`/admin/exam-sessions/${attemptId}`, {
      params: { withAuralDetail },
    }),

  /** Reset the 5-attempt interview re-entry counter for a student */
  resetReentry: (attemptId: string) =>
    api.post<ApiResponse>(`/admin/exam-sessions/${attemptId}/reset-reentry`),
};

// ─── Admin Exam Management ───
export const adminExamApi = {
  /** List all exam templates with stats */
  listTemplates: () =>
    api.get<ApiResponse>('/exam/templates'),

  /** Create a new exam template */
  createTemplate: (data: Record<string, unknown>) =>
    api.post<ApiResponse>('/exam/templates', data),

  /** Get a single template with all attempts + invitations */
  getTemplate: (templateId: string) =>
    api.get<ApiResponse>(`/exam/templates/${templateId}`),

  /** Invite specific users to an exam */
  inviteUsers: (
    templateId: string,
    userIds: string[],
    expiresAt?: string,
    note?: string,
  ) =>
    api.post<ApiResponse>(`/exam/templates/${templateId}/invite`, {
      userIds,
      expiresAt,
      note,
    }),

  /** Cancel a user invitation */
  cancelInvite: (templateId: string, userId: string) =>
    api.delete<ApiResponse>(`/exam/templates/${templateId}/invite/${userId}`),

  /** Search students for invite dropdown */
  searchStudents: (search?: string) =>
    api.get<ApiResponse>('/exam/students', { params: search ? { search } : {} }),

  /** Bulk-invite students from an Excel / CSV file */
  inviteByExcel: (templateId: string, file: File, expiresAt?: string, note?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (expiresAt) form.append('expiresAt', expiresAt);
    if (note) form.append('note', note);
    return api.post<ApiResponse>(`/exam/templates/${templateId}/invite-excel`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Download Excel template for bulk question import */
  downloadImportTemplate: (templateId: string) =>
    api.get(`/exam/templates/${templateId}/question-pool/import-template`, { responseType: 'blob' }),

  /** Bulk-import new questions from Excel into this exam's pool */
  importQuestionsExcel: (templateId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ApiResponse>(`/exam/templates/${templateId}/question-pool/import-excel`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Get student's pending/active exam attempts */
  getMyAttempts: () =>
    api.get<ApiResponse>('/exam/my-attempts'),

  /** Get template pool: questions already added + coverage info */
  getQuestionPool: (templateId: string) =>
    api.get<ApiResponse>(`/exam/templates/${templateId}/question-pool`, {
      params: { _t: Date.now() },
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    }),

  /** Search published questions NOT yet in template pool */
  searchPoolCandidates: (templateId: string, q?: string, difficulty?: string) =>
    api.get<ApiResponse>(`/exam/templates/${templateId}/question-pool/search`, {
      params: { q, difficulty },
    }),

  /** Add a published question to the template's dedicated pool */
  addQuestionToPool: (templateId: string, versionId: string) =>
    api.post<ApiResponse>(`/exam/templates/${templateId}/question-pool`, { versionId }),

  /** Remove a question from the template pool */
  removeQuestionFromPool: (templateId: string, versionId: string) =>
    api.delete<ApiResponse>(`/exam/templates/${templateId}/question-pool/${versionId}`),

  /** List staff assigned to this template */
  getTemplateStaff: (templateId: string) =>
    api.get<ApiResponse>(`/exam/templates/${templateId}/staff`),

  /** Assign a staff member to this template (placement_head only) */
  assignStaff: (templateId: string, userId: string) =>
    api.post<ApiResponse>(`/exam/templates/${templateId}/staff`, { userId }),

  /** Remove a staff assignment (placement_head only) */
  removeStaff: (templateId: string, userId: string) =>
    api.delete<ApiResponse>(`/exam/templates/${templateId}/staff/${userId}`),

  /** Admin: manually create an exam attempt for a student */
  launchForStudent: (templateId: string, userId: string) =>
    api.post<ApiResponse>(`/exam/templates/${templateId}/launch-for/${userId}`),
};

// ─── Students / Roadmap ───
export const studentApi = {
  getRoadmapSummary: (userId: string) =>
    api.get<ApiResponse>(`/students/${userId}/roadmap-summary`),

  getPerformanceSummary: (userId: string) =>
    api.get<ApiResponse>(`/students/${userId}/performance-summary`),
};

// ─── Rules ───
export const ruleApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<ApiResponse>('/rules', { params }),

  create: (data: Record<string, unknown>) =>
    api.post<ApiResponse>('/rules', data),
};

// ─── Admin Users ───
export const adminUserApi = {
  listStaff: () =>
    api.get<ApiResponse>('/admin/users'),

  assignCourse: (userId: string, courseId: string, courseName: string) =>
    api.post<ApiResponse>('/admin/users/assign-course', { userId, courseId, courseName }),

  removeCourseAssignment: (assignmentId: string) =>
    api.delete<ApiResponse>(`/admin/users/course-assignment/${assignmentId}`),

  assignCompany: (userId: string, companyName: string) =>
    api.post<ApiResponse>('/admin/users/assign-company', { userId, companyName }),

  removeCompanyAssignment: (assignmentId: string) =>
    api.delete<ApiResponse>(`/admin/users/company-assignment/${assignmentId}`),

  getMyAssignments: () =>
    api.get<ApiResponse>('/admin/users/my-assignments'),
};

// ─── Analytics (staff + head only) ───
export const analyticsApi = {
  /** Questions with submission counts — scoped for placement_member, full for head */
  getQuestionAnalytics: () =>
    api.get<ApiResponse>('/analytics/questions'),

  /** Submissions for a specific question version */
  getQuestionSubmissions: (versionId: string) =>
    api.get<ApiResponse>(`/analytics/questions/${versionId}/submissions`),

  /** Student-wise submission summary */
  getStudentAnalytics: () =>
    api.get<ApiResponse>('/analytics/students'),

  /** Dashboard overview card stats */
  getOverview: () =>
    api.get<ApiResponse>('/analytics/overview'),
};

// ─── Catalog (courses + companies from SMART system) ───
export const catalogApi = {
  /** Returns { courses: [{id, name, code, course_type}], companies: ["Infosys", …] } */
  get: () => api.get<ApiResponse>('/catalog'),
};

export default api;
