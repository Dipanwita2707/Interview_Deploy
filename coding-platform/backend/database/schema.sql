-- Coding Platform Database Schema
-- PostgreSQL

-- ─── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users (Shadow Users from SMART SSO) ───────────────────────
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  smart_user_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('placement_member', 'placement_head', 'student')),
  organization_id VARCHAR(255),
  program_id VARCHAR(255),
  dream_company VARCHAR(255),
  target_role VARCHAR(255),
  package_slab VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_smart_user_id ON users(smart_user_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ─── Question Bank ─────────────────────────────────────────────
CREATE TABLE question_bank (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_question_bank_slug ON question_bank(slug);

-- ─── Question Versions ─────────────────────────────────────────
CREATE TABLE question_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  title VARCHAR(200) NOT NULL,
  problem_statement TEXT NOT NULL,
  input_format TEXT NOT NULL,
  output_format TEXT NOT NULL,
  constraints TEXT NOT NULL,
  examples JSONB NOT NULL DEFAULT '[]',
  explanations TEXT,
  difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('low', 'medium', 'high')),
  topic_tags TEXT[] NOT NULL DEFAULT '{}',
  source_company VARCHAR(255),
  course_id VARCHAR(255),
  course_name VARCHAR(255),
  role_specificity VARCHAR(255),
  package_slab_specificity VARCHAR(255),
  is_company_specific BOOLEAN NOT NULL DEFAULT false,
  time_limit_ms INTEGER NOT NULL DEFAULT 2000,
  memory_limit_kb INTEGER NOT NULL DEFAULT 262144,
  supported_languages TEXT[] NOT NULL DEFAULT '{python,javascript,java,cpp}',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'archived')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(question_id, version_number)
);

CREATE INDEX idx_qv_question_id ON question_versions(question_id);
CREATE INDEX idx_qv_status ON question_versions(status);
CREATE INDEX idx_qv_difficulty ON question_versions(difficulty);
CREATE INDEX idx_qv_topic_tags ON question_versions USING GIN(topic_tags);
CREATE INDEX idx_qv_source_company ON question_versions(source_company);

-- ─── Test Cases ────────────────────────────────────────────────
CREATE TABLE test_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  input TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  explanation TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_test_cases_version ON test_cases(version_id);

-- ─── Starter Code ──────────────────────────────────────────────
CREATE TABLE starter_code (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  language_id VARCHAR(50) NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(version_id, language_id)
);

CREATE INDEX idx_starter_code_version ON starter_code(version_id);

-- ─── Question Approvals ────────────────────────────────────────
CREATE TABLE question_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL CHECK (action IN ('approved', 'rejected')),
  remarks TEXT,
  performed_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qa_version ON question_approvals(version_id);

-- ─── Question Publish Targets ──────────────────────────────────
CREATE TABLE question_publish_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  pool_type VARCHAR(20) NOT NULL CHECK (pool_type IN ('practice', 'exam')),
  published_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(version_id, pool_type)
);

CREATE INDEX idx_qpt_pool ON question_publish_targets(pool_type);

-- ─── Rule Templates ────────────────────────────────────────────
CREATE TABLE rule_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  target_mode VARCHAR(20) NOT NULL CHECK (target_mode IN ('practice', 'exam')),
  company VARCHAR(255),
  role VARCHAR(255),
  package_slab VARCHAR(255),
  question_count INTEGER NOT NULL DEFAULT 5,
  difficulty_distribution JSONB NOT NULL DEFAULT '{"low":1,"medium":2,"high":2}',
  topic_distribution JSONB,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  allowed_retakes INTEGER NOT NULL DEFAULT 0,
  shuffle_questions BOOLEAN NOT NULL DEFAULT true,
  roadmap_linkage BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rt_mode ON rule_templates(target_mode);
CREATE INDEX idx_rt_company ON rule_templates(company);
CREATE INDEX idx_rt_active ON rule_templates(is_active);

-- ─── Exam Template Questions (dedicated pool per exam template) ─
CREATE TABLE exam_template_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES rule_templates(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, version_id)
);

CREATE INDEX idx_etq_template ON exam_template_questions(template_id);
CREATE INDEX idx_etq_version ON exam_template_questions(version_id);

-- ─── Practice Sessions ─────────────────────────────────────────
CREATE TABLE practice_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  rule_template_id UUID REFERENCES rule_templates(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ps_user ON practice_sessions(user_id);

-- ─── Exam Attempts ─────────────────────────────────────────────
CREATE TABLE exam_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  exam_config_id VARCHAR(255) NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled', 'ready', 'started', 'interrupted', 'submitted', 'evaluated', 'flagged', 'reviewed')),
  duration_minutes INTEGER NOT NULL,
  question_snapshot JSONB NOT NULL,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  review_decision VARCHAR(20),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ea_user ON exam_attempts(user_id);
CREATE INDEX idx_ea_state ON exam_attempts(state);
CREATE INDEX idx_ea_config ON exam_attempts(exam_config_id);

-- ─── Submission Records ────────────────────────────────────────
CREATE TABLE submission_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  question_id UUID NOT NULL REFERENCES question_bank(id),
  version_id UUID NOT NULL REFERENCES question_versions(id),
  session_id UUID NOT NULL,
  session_type VARCHAR(20) NOT NULL CHECK (session_type IN ('practice', 'exam')),
  source_code TEXT NOT NULL,
  language VARCHAR(50) NOT NULL,
  verdict VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (verdict IN ('pending', 'accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit_exceeded', 'memory_limit_exceeded', 'internal_error')),
  passed_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  execution_time_ms DOUBLE PRECISION,
  memory_kb INTEGER,
  compile_output TEXT,
  stderr TEXT,
  evaluated_at TIMESTAMPTZ,
  cyclomatic_complexity INTEGER,
  maintainability_index DOUBLE PRECISION,
  max_nesting_depth INTEGER,
  optimization_warning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sr_user ON submission_records(user_id);
CREATE INDEX idx_sr_session ON submission_records(session_id);
CREATE INDEX idx_sr_question ON submission_records(question_id);
CREATE INDEX idx_sr_verdict ON submission_records(verdict);

-- ─── Submission Test Results ───────────────────────────────────
CREATE TABLE submission_test_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submission_records(id) ON DELETE CASCADE,
  test_case_id UUID NOT NULL REFERENCES test_cases(id),
  passed BOOLEAN NOT NULL DEFAULT false,
  actual_output TEXT,
  execution_time_ms DOUBLE PRECISION,
  memory_kb INTEGER,
  verdict VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_str_submission ON submission_test_results(submission_id);

-- ─── Proctor Sessions ──────────────────────────────────────────
CREATE TABLE proctor_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_attempt_id UUID NOT NULL REFERENCES exam_attempts(id) UNIQUE,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_procs_attempt ON proctor_sessions(exam_attempt_id);

-- ─── Proctor Events ────────────────────────────────────────────
CREATE TABLE proctor_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES proctor_sessions(id) ON DELETE CASCADE,
  incident_type VARCHAR(50) NOT NULL
    CHECK (incident_type IN ('tab_switch', 'focus_loss', 'camera_unavailable', 'microphone_unavailable', 'no_face_detected', 'multiple_faces', 'suspicious_window', 'permission_failure')),
  evidence_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pe_session ON proctor_events(session_id);

-- ─── Roadmap Configs ───────────────────────────────────────────
CREATE TABLE roadmap_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id VARCHAR(255),
  show_in_roadmap BOOLEAN NOT NULL DEFAULT true,
  practice_count INTEGER NOT NULL DEFAULT 5,
  exam_count INTEGER NOT NULL DEFAULT 1,
  target_difficulty VARCHAR(20) DEFAULT 'medium',
  rule_template_id UUID REFERENCES rule_templates(id),
  schedule_start TIMESTAMPTZ,
  schedule_end TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Supported Languages (seed data) ──────────────────────────
CREATE TABLE languages (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  judge0_id INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO languages (id, name, judge0_id) VALUES
  ('python', 'Python 3', 71),
  ('javascript', 'JavaScript (Node.js)', 63),
  ('java', 'Java', 62),
  ('cpp', 'C++ (GCC)', 54),
  ('c', 'C (GCC)', 50),
  ('typescript', 'TypeScript', 74),
  ('go', 'Go', 60),
  ('rust', 'Rust', 73),
  ('ruby', 'Ruby', 72),
  ('csharp', 'C#', 51);

-- ─── User Course Assignments ───────────────────────────────────
-- Maps staff users to courses they can upload questions for
CREATE TABLE user_course_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(255) NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  assigned_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

CREATE INDEX idx_uca_user ON user_course_assignments(user_id);
CREATE INDEX idx_uca_course ON user_course_assignments(course_id);

-- ─── User Company Assignments ──────────────────────────────────
-- Maps staff users to companies they can upload questions for
CREATE TABLE user_company_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  assigned_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, company_name)
);

CREATE INDEX idx_ucoa_user ON user_company_assignments(user_id);
CREATE INDEX idx_ucoa_company ON user_company_assignments(company_name);
