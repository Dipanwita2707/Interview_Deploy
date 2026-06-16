import { pool } from './src/database/connection';

async function run() {
  console.log('Altering submission_records table to add code complexity columns...');
  try {
    await pool.query(`
      ALTER TABLE submission_records ADD COLUMN IF NOT EXISTS cyclomatic_complexity INTEGER;
      ALTER TABLE submission_records ADD COLUMN IF NOT EXISTS maintainability_index DOUBLE PRECISION;
      ALTER TABLE submission_records ADD COLUMN IF NOT EXISTS max_nesting_depth INTEGER;
      ALTER TABLE submission_records ADD COLUMN IF NOT EXISTS optimization_warning TEXT;
    `);
    console.log('Successfully added complexity columns to submission_records!');
  } catch (err: any) {
    console.error('Error altering table:', err.message);
  } finally {
    await pool.end();
  }
}

run();
