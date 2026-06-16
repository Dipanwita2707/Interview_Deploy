ALTER TABLE submission_records 
ADD COLUMN IF NOT EXISTS cyclomatic_complexity INTEGER,
ADD COLUMN IF NOT EXISTS maintainability_index DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS max_nesting_depth INTEGER,
ADD COLUMN IF NOT EXISTS optimization_warning TEXT;
