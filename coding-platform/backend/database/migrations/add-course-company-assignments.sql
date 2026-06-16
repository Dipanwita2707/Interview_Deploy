-- Migration: Add course/company assignment tables and question_versions columns
-- For coding platform integration with SMART courses

-- Add course_id and course_name to question_versions
ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS course_id VARCHAR(255);
ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS course_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_qv_course_id ON question_versions(course_id);

-- Create user_course_assignments table
CREATE TABLE IF NOT EXISTS user_course_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(255) NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  assigned_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_uca_user ON user_course_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_uca_course ON user_course_assignments(course_id);

-- Create user_company_assignments table
CREATE TABLE IF NOT EXISTS user_company_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  assigned_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, company_name)
);

CREATE INDEX IF NOT EXISTS idx_ucoa_user ON user_company_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ucoa_company ON user_company_assignments(company_name);
