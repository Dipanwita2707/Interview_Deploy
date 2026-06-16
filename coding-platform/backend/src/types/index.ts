import { Request } from 'express';

// ─── Coding Platform Roles ──────────────────────────────────────
export enum CodingRole {
  PLACEMENT_MEMBER = 'placement_member',
  PLACEMENT_HEAD = 'placement_head',
  STUDENT = 'student',
}

// ─── JWT Payload for coding platform sessions ──────────────────
export interface CodingJwtPayload {
  userId: string;
  shadowUserId: string;
  email: string;
  role: CodingRole;
  organizationId?: string;
  iat?: number;
  exp?: number;
}

// ─── SMART SSO Token (incoming from SMART) ─────────────────────
export interface SmartSsoPayload {
  userId: string;
  email: string;
  name: string;
  userLevel: number; // 1=SuperAdmin, 2=Admin, 3=Coordinator, 4=Mentor, 5=Student
  organizationId?: string;
  schemaName?: string;
  // Student-specific context
  programId?: string;
  dreamCompany?: string;
  targetRole?: string;
  packageSlab?: string;
}

// ─── Extended Express Request ──────────────────────────────────
export interface AuthRequest extends Request {
  user?: CodingJwtPayload;
}

// ─── Shadow User ───────────────────────────────────────────────
export interface ShadowUser {
  id: string;
  smartUserId: string;
  email: string;
  name: string;
  role: CodingRole;
  organizationId?: string;
  programId?: string;
  dreamCompany?: string;
  targetRole?: string;
  packageSlab?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Question ──────────────────────────────────────────────────
export enum QuestionDifficulty {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum QuestionStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum PoolType {
  PRACTICE = 'practice',
  EXAM = 'exam',
}

export interface QuestionInput {
  title: string;
  slug: string;
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: object[];
  explanations?: string;
  difficulty: QuestionDifficulty;
  topicTags: string[];
  sourceCompany?: string;
  courseId?: string;
  courseName?: string;
  roleSpecificity?: string;
  packageSlabSpecificity?: string;
  isCompanySpecific: boolean;
  timeLimitMs?: number;
  memoryLimitKb?: number;
  supportedLanguages: string[];
}

// ─── Test Case ─────────────────────────────────────────────────
export interface TestCaseInput {
  input: string;
  expectedOutput: string;
  isPublic: boolean;
  explanation?: string;
  orderIndex: number;
}

// ─── Starter Code ──────────────────────────────────────────────
export interface StarterCodeInput {
  languageId: string;
  code: string;
}

// ─── Submission ────────────────────────────────────────────────
export enum Verdict {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  WRONG_ANSWER = 'wrong_answer',
  COMPILE_ERROR = 'compile_error',
  RUNTIME_ERROR = 'runtime_error',
  TIME_LIMIT_EXCEEDED = 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  INTERNAL_ERROR = 'internal_error',
}

// ─── Exam States ───────────────────────────────────────────────
export enum ExamState {
  SCHEDULED = 'scheduled',
  READY = 'ready',
  STARTED = 'started',
  INTERRUPTED = 'interrupted',
  SUBMITTED = 'submitted',
  EVALUATED = 'evaluated',
  FLAGGED = 'flagged',
  REVIEWED = 'reviewed',
}

// ─── Proctor Incident Types ────────────────────────────────────
export enum ProctorIncidentType {
  TAB_SWITCH = 'tab_switch',
  FOCUS_LOSS = 'focus_loss',
  CAMERA_UNAVAILABLE = 'camera_unavailable',
  MICROPHONE_UNAVAILABLE = 'microphone_unavailable',
  NO_FACE_DETECTED = 'no_face_detected',
  MULTIPLE_FACES = 'multiple_faces',
  SUSPICIOUS_WINDOW = 'suspicious_window',
  PERMISSION_FAILURE = 'permission_failure',
  DEVTOOLS_OPEN = 'devtools_open',
}

// ─── Rule Template ─────────────────────────────────────────────
export interface RuleTemplateInput {
  name: string;
  targetMode: PoolType;
  company?: string;
  role?: string;
  packageSlab?: string;
  questionCount: number;
  difficultyDistribution: { low: number; medium: number; high: number };
  topicDistribution?: Record<string, number>;
  durationMinutes: number;
  allowedRetakes: number;
  shuffleQuestions: boolean;
  roadmapLinkage: boolean;
  effectiveFrom?: Date;
  effectiveTo?: Date;
}

// ─── API Response Envelope ─────────────────────────────────────
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
}
