// ─── Enums ───
export enum CodingRole {
  PLACEMENT_MEMBER = 'placement_member',
  PLACEMENT_HEAD = 'placement_head',
  STUDENT = 'student',
}

export enum QuestionDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
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

export enum Verdict {
  ACCEPTED = 'accepted',
  WRONG_ANSWER = 'wrong_answer',
  COMPILE_ERROR = 'compile_error',
  RUNTIME_ERROR = 'runtime_error',
  TIME_LIMIT_EXCEEDED = 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  PENDING = 'pending',
}

export enum ExamState {
  CREATED = 'created',
  READY = 'ready',
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
  AUTO_SUBMITTED = 'auto_submitted',
  UNDER_REVIEW = 'under_review',
  REVIEWED = 'reviewed',
  FLAGGED = 'flagged',
}

// ─── Interfaces ───
export interface User {
  id: string;
  smart_user_id: string;
  email: string;
  name: string;
  role: CodingRole;
  department?: string;
  batch_year?: number;
  smart_metadata?: Record<string, unknown>;
}

export interface Question {
  id: string;
  question_id?: string;  // alias returned by version endpoint
  slug: string;
  title: string;
  description: string;
  difficulty: QuestionDifficulty;
  topic_tags: string[];
  status: QuestionStatus;
  user_status?: 'solved' | 'attempted' | 'not_started';
  time_limit_ms: number;
  memory_limit_kb: number;
  constraints?: string;
  input_format?: string;
  output_format?: string;
  examples?: QuestionExample[];
  version_number: number;
  version_id: string;
  created_by: string;
  created_at: string;
  starter_code?: StarterCode[];
  test_cases?: TestCase[];
}

export interface QuestionExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface TestCase {
  id: string;
  input: string;
  expected_output: string;
  is_sample: boolean;
  points: number;
}

export interface StarterCode {
  id: string;
  language_id: number;
  language_name: string;
  code: string;
}

export interface Submission {
  id: string;
  question_version_id: string;
  user_id: string;
  language_id: number;
  source_code: string;
  verdict: Verdict;
  score: number;
  passed_count?: number;
  total_count?: number;
  execution_time_ms?: number;
  memory_used_kb?: number;
  test_results?: TestResult[];
  created_at: string;
}

export interface TestResult {
  test_case_id: string;
  passed: boolean;
  verdict: Verdict;
  execution_time_ms?: number;
  memory_used_kb?: number;
  actual_output?: string;
}

export interface PracticeSession {
  id: string;
  user_id: string;
  question_version_id: string;
  question?: Question;
  started_at: string;
  completed_at?: string;
  best_score: number;
}

export interface ExamAttempt {
  id: string;
  user_id: string;
  state: ExamState;
  rule_template_id: string;
  started_at?: string;
  submitted_at?: string;
  time_limit_minutes: number;
  total_score: number;
  max_score: number;
  questions?: Question[];
  submissions?: Submission[];
}

export interface RoadmapSummary {
  user_id: string;
  practice_stats: {
    total_solved: number;
    easy_solved: number;
    medium_solved: number;
    hard_solved: number;
    total_submissions: number;
    acceptance_rate: number;
  };
  exam_stats: {
    total_attempts: number;
    average_score: number;
    best_score: number;
  };
  recent_performance: {
    band: 'green' | 'yellow' | 'red';
    trend: 'improving' | 'stable' | 'declining';
  };
}

export interface PerformanceSummary {
  language_usage: Array<{ language: string; count: number; percentage: number }>;
  difficulty_breakdown: Array<{
    difficulty: QuestionDifficulty;
    attempted: number;
    solved: number;
    success_rate: number;
  }>;
  topic_breakdown: Array<{
    topic: string;
    attempted: number;
    solved: number;
    success_rate: number;
  }>;
  daily_activity: Record<string, { total: number; accepted: number }>;
  exam_breakdown: Array<{
    attempt_id: string;
    state: string;
    exam_name: string;
    company: string | null;
    role: string | null;
    started_at: string | null;
    submitted_at: string | null;
    duration_minutes: number;
    total_questions: number;
    questions_attempted: number;
    questions_solved: number;
    score_pct: number;
    primary_language: string | null;
    difficulties: string[];
    topics: string[];
  }>;
}

export interface Language {
  id: number;
  name: string;
  judge0_id: number;
  is_active: boolean;
}

export interface RuleTemplate {
  id: string;
  name: string;
  department?: string;
  batch_year?: number;
  pool_type: PoolType;
  easy_count: number;
  medium_count: number;
  hard_count: number;
  time_limit_minutes: number;
  topic_tags?: string[];
  is_default: boolean;
  is_active: boolean;
}

// ─── API Response Types ───
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface QuestionFilters extends PaginationParams {
  difficulty?: QuestionDifficulty;
  status?: QuestionStatus;
  topic?: string;
  search?: string;
}

// ─── Course & Company Assignments ───
export interface CourseAssignment {
  id: string;
  course_id: string;
  course_name: string;
}

export interface CompanyAssignment {
  id: string;
  company_name: string;
}

export interface StaffUser {
  id: string;
  smart_user_id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  course_assignments: CourseAssignment[];
  company_assignments: CompanyAssignment[];
}

export interface PracticeCourseGroup {
  course_id: string;
  course_name: string;
  question_count: number;
  easy_count: number;
  medium_count: number;
  hard_count: number;
}

export interface PracticeCompanyGroup {
  company_name: string;
  question_count: number;
  easy_count: number;
  medium_count: number;
  hard_count: number;
}
