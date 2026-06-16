const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const questions = [
  {
    slug: 'binary-search',
    title: 'Binary Search',
    difficulty: 'medium',
    statement: 'Given a sorted array of n integers and a target value, determine if the target exists in the array. Return the index of the target if found, else return -1.',
    input_format: 'First line: n and target. Second line: n space-separated sorted integers.',
    output_format: 'Single integer: index of target or -1.',
    constraints: '1 <= n <= 10^5\n-10^9 <= nums[i] <= 10^9',
    examples: JSON.stringify([{ input: '5 3\n1 2 3 4 5', output: '2' }]),
    topic_tags: ['binary search', 'arrays'],
  },
  {
    slug: 'merge-sorted-arrays',
    title: 'Merge Two Sorted Arrays',
    difficulty: 'medium',
    statement: 'Given two sorted arrays, merge them into a single sorted array.',
    input_format: 'First line: n m. Second line: n integers. Third line: m integers.',
    output_format: 'Space-separated merged sorted array.',
    constraints: '1 <= n, m <= 10^4',
    examples: JSON.stringify([{ input: '3 3\n1 3 5\n2 4 6', output: '1 2 3 4 5 6' }]),
    topic_tags: ['arrays', 'sorting', 'two pointers'],
  },
  {
    slug: 'longest-common-subsequence',
    title: 'Longest Common Subsequence',
    difficulty: 'high',
    statement: 'Given two strings, find the length of their longest common subsequence.',
    input_format: 'Two lines, each with a string.',
    output_format: 'Single integer: length of LCS.',
    constraints: '1 <= len(s) <= 1000',
    examples: JSON.stringify([{ input: 'abcde\nace', output: '3' }]),
    topic_tags: ['dynamic programming', 'strings'],
  },
  {
    slug: 'median-of-two-sorted-arrays',
    title: 'Median of Two Sorted Arrays',
    difficulty: 'high',
    statement: 'Given two sorted arrays nums1 and nums2, return the median of the two sorted arrays.',
    input_format: 'First line: n m. Second line: n integers. Third line: m integers.',
    output_format: 'The median value (float rounded to 1 decimal).',
    constraints: '0 <= n, m <= 1000',
    examples: JSON.stringify([{ input: '2 2\n1 3\n2 4', output: '2.5' }]),
    topic_tags: ['binary search', 'arrays', 'divide and conquer'],
  },
  {
    slug: 'word-break',
    title: 'Word Break',
    difficulty: 'high',
    statement: 'Given a string s and a dictionary of strings wordDict, return true if s can be segmented into a space-separated sequence of dictionary words.',
    input_format: 'First line: string s. Second line: space-separated words.',
    output_format: 'true or false',
    constraints: '1 <= len(s) <= 300',
    examples: JSON.stringify([{ input: 'leetcode\nleet code', output: 'true' }]),
    topic_tags: ['dynamic programming', 'strings', 'backtracking'],
  },
];

async function run() {
  const { rows: [admin] } = await pool.query("SELECT id FROM users WHERE role = 'placement_head' LIMIT 1");
  if (!admin) { console.error('No placement_head user found'); process.exit(1); }
  const adminId = admin.id;

  for (const q of questions) {
    // Upsert question_bank
    await pool.query(
      `INSERT INTO question_bank (id, slug, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (slug) DO NOTHING`,
      [uuidv4(), q.slug, adminId]
    );
    const { rows: [bank] } = await pool.query('SELECT id FROM question_bank WHERE slug = $1', [q.slug]);
    const bankId = bank.id;

    // Check existing version
    const { rows: ev } = await pool.query(
      'SELECT id FROM question_versions WHERE question_id = $1 AND version_number = 1', [bankId]
    );
    let versionId = ev[0]?.id;

    if (!versionId) {
      const { rows: [v] } = await pool.query(
        `INSERT INTO question_versions
           (id, question_id, version_number, title, problem_statement,
            input_format, output_format, constraints, examples,
            difficulty, status, topic_tags, time_limit_ms, memory_limit_kb,
            created_by, created_at, updated_at)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,'published',$10,2000,256000,$11,NOW(),NOW())
         RETURNING id`,
        [uuidv4(), bankId, q.title, q.statement, q.input_format, q.output_format,
         q.constraints, q.examples, q.difficulty, q.topic_tags, adminId]
      );
      versionId = v.id;
    }

    for (const ptype of ['exam', 'practice']) {
      await pool.query(
        `INSERT INTO question_publish_targets (id, version_id, pool_type, published_by, created_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, NOW()) ON CONFLICT (version_id, pool_type) DO NOTHING`,
        [versionId, ptype, adminId]
      );
    }
    console.log('OK:', q.difficulty.padEnd(7), q.title);
  }
  pool.end();
  console.log('\nDone.');
}

run().catch(e => { console.error('FAILED:', e.message); pool.end(); process.exit(1); });
