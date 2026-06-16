import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { config } from '../config';
import { query, getClient } from '../database/connection';
import { getSubmissionQueue } from '../database/queue';
import { Verdict } from '../types';
import { AppError } from '../utils/app-error';
import { runLocally } from './local-executor';
import { bustRoadmapCache } from './roadmap-service';
import { analyzeCode } from '../utils/ast-analyzer';

// ─── Judge0 Language ID Mapping ────────────────────────────────
const LANGUAGE_MAP: Record<string, number> = {
  python: 71,      // Python 3
  javascript: 63,  // Node.js
  java: 62,        // Java
  cpp: 54,         // C++ (GCC)
  c: 50,           // C (GCC)
  typescript: 74,  // TypeScript
  go: 60,          // Go
  rust: 73,        // Rust
  ruby: 72,        // Ruby
  csharp: 51,      // C#
};

// Check if Judge0 is reachable (cached for 30s)
let judge0Available: boolean | null = null;
let judge0CheckTime = 0;

async function isJudge0Available(): Promise<boolean> {
  const now = Date.now();
  if (judge0Available !== null && now - judge0CheckTime < 30000) {
    return judge0Available;
  }
  try {
    await axios.get(`${config.judge0.url}/languages`, { timeout: 3000 });
    judge0Available = true;
    console.log('[EXECUTOR] Judge0 is available at', config.judge0.url);
  } catch {
    judge0Available = false;
    console.log('[EXECUTOR] Judge0 not reachable — using local executor');
  }
  judge0CheckTime = now;
  return judge0Available;
}

// ─── Create Submission Record ──────────────────────────────────
export async function createSubmission(params: {
  userId: string;
  questionId: string;
  versionId: string;
  sessionId: string;
  sessionType: 'practice' | 'exam';
  sourceCode: string;
  language: string;
}) {
  const submissionId = uuidv4();

  await query(
    `INSERT INTO submission_records (
      id, user_id, question_id, version_id, session_id, session_type,
      source_code, language, verdict, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      submissionId, params.userId, params.questionId, params.versionId,
      params.sessionId, params.sessionType, params.sourceCode,
      params.language, Verdict.PENDING,
    ]
  );

  // Enqueue for Judge0 processing (or evaluate directly if Redis/queue unavailable)
  const submissionQueue = getSubmissionQueue();
  if (submissionQueue) {
    await submissionQueue.add('evaluate', {
      submissionId,
      sourceCode: params.sourceCode,
      language: params.language,
      versionId: params.versionId,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  } else {
    // No Redis — evaluate synchronously in background
    setImmediate(() => {
      evaluateSubmission(submissionId, params.sourceCode, params.language, params.versionId)
        .catch((err: Error) => console.error('[SUBMISSION] Direct eval failed:', err.message));
    });
  }

  return { id: submissionId, submissionId, verdict: Verdict.PENDING };
}

// ─── Submit Code to Judge0 CE (self-hosted) ───────────────────
export async function submitToJudge0(params: {
  sourceCode: string;
  language: string;
  stdin: string;
  expectedOutput: string;
  timeLimitSeconds?: number;
  memoryLimitKb?: number;
}) {
  const languageId = LANGUAGE_MAP[params.language];
  if (!languageId) {
    throw AppError.badRequest(`Unsupported language: ${params.language}`);
  }

  const payload = {
    source_code: Buffer.from(params.sourceCode).toString('base64'),
    language_id: languageId,
    stdin: Buffer.from(params.stdin).toString('base64'),
    expected_output: Buffer.from(params.expectedOutput).toString('base64'),
    cpu_time_limit: params.timeLimitSeconds ?? 2,
    memory_limit: params.memoryLimitKb ?? 262144,
    base64_encoded: true,
  };

  // POST to Judge0 CE — submit and wait for result
  const response = await axios.post(
    `${config.judge0.url}/submissions?base64_encoded=true&wait=true`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );

  return response.data;
}

// ─── Map Judge0 Status to Verdict ──────────────────────────────
export function mapJudge0Verdict(statusId: number): Verdict {
  switch (statusId) {
    case 1: return Verdict.PENDING;          // In Queue
    case 2: return Verdict.PENDING;          // Processing
    case 3: return Verdict.ACCEPTED;         // Accepted
    case 4: return Verdict.WRONG_ANSWER;     // Wrong Answer
    case 5: return Verdict.TIME_LIMIT_EXCEEDED;
    case 6: return Verdict.COMPILE_ERROR;
    case 7:
    case 8:
    case 9:
    case 10:
    case 11:
    case 12: return Verdict.RUNTIME_ERROR;
    case 13: return Verdict.INTERNAL_ERROR;
    case 14: return Verdict.INTERNAL_ERROR;
    default: return Verdict.INTERNAL_ERROR;
  }
}

// ─── Evaluate Submission Against All Test Cases ────────────────
export async function evaluateSubmission(submissionId: string, sourceCode: string, language: string, versionId: string) {
  // Fetch all test cases for this version
  const testCasesResult = await query(
    'SELECT * FROM test_cases WHERE version_id = $1 ORDER BY order_index',
    [versionId]
  );
  const testCases = testCasesResult.rows;

  if (testCases.length === 0) {
    await updateSubmissionVerdict(submissionId, Verdict.INTERNAL_ERROR, 0, 0, 0, 0, 0);
    return;
  }

  let passedCount = 0;
  let totalScore = 0;
  let lastVerdict = Verdict.ACCEPTED;
  let maxTimeMs = 0;   // all time tracking in milliseconds
  let maxMemory = 0;
  let compileOutput = '';
  let lastStderr = '';

  // Check executor once before the loop (cached 30s)
  let useJudge0 = await isJudge0Available();
  console.log(`[EXECUTOR] Running ${testCases.length} test case(s) via ${useJudge0 ? 'Judge0' : 'local executor'}`);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const tc of testCases) {
      try {
        let verdict: Verdict = Verdict.INTERNAL_ERROR;
        let timeMs = 0;
        let memoryKb = 0;
        let actualOutput: string | null = null;
        let runViaLocal = !useJudge0;

        if (useJudge0) {
          try {
            // ── Judge0 path ──────────────────────────────────────
            const result = await submitToJudge0({
              sourceCode, language,
              stdin: tc.input,
              expectedOutput: tc.expected_output,
            });

            console.log('[EXECUTOR] Judge0 raw response:', result);

            if (result.status?.id === 13 || result.status?.id === 14) {
              console.warn('[EXECUTOR] Judge0 returned an internal error. Dynamically falling back to the local executor.');
              runViaLocal = true;
              useJudge0 = false; // Disable Judge0 for subsequent test cases in this evaluation
            } else {
              verdict = mapJudge0Verdict(result.status?.id ?? 13);
              timeMs = parseFloat(result.time || '0') * 1000;
              memoryKb = parseInt(result.memory || '0', 10);
              actualOutput = result.stdout
                ? Buffer.from(result.stdout, 'base64').toString()
                : null;
              if (result.compile_output) {
                compileOutput = Buffer.from(result.compile_output, 'base64').toString();
              }
              if (result.stderr) {
                lastStderr = Buffer.from(result.stderr, 'base64').toString();
              }
            }
          } catch (err) {
            console.error('[EXECUTOR] Judge0 submission failed. Falling back to local executor.', err);
            runViaLocal = true;
            useJudge0 = false;
          }
        }

        if (runViaLocal) {
          // ── Local executor path (Mac dev / no Judge0) ────────
          const local = await runLocally({
            sourceCode, language,
            stdin: tc.input,
            expectedOutput: tc.expected_output,
            timeLimitMs: (tc.time_limit_seconds ?? 2) * 1000,
          });

          verdict = local.verdict;
          timeMs = local.timeMs;
          memoryKb = 0;                      // local exec doesn't measure memory
          actualOutput = local.stdout || null;
          if (local.verdict === Verdict.COMPILE_ERROR) {
            compileOutput = local.stderr;
          } else if (local.stderr) {
            lastStderr = local.stderr;
          }
        }

        const passed = verdict === Verdict.ACCEPTED;
        if (passed) passedCount++;
        if (verdict !== Verdict.ACCEPTED && lastVerdict === Verdict.ACCEPTED) {
          lastVerdict = verdict;
        }
        maxTimeMs = Math.max(maxTimeMs, timeMs);
        maxMemory = Math.max(maxMemory, memoryKb);

        // Store per-test-case result
        await client.query(
          `INSERT INTO submission_test_results (
            id, submission_id, test_case_id, passed, actual_output,
            execution_time_ms, memory_kb, verdict, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [uuidv4(), submissionId, tc.id, passed, actualOutput, timeMs, memoryKb, verdict]
        );
      } catch (err) {
        // Single test case failure — mark as internal error
        console.error('[EXECUTOR] Test case execution failed:', err);
        await client.query(
          `INSERT INTO submission_test_results (
            id, submission_id, test_case_id, passed, verdict, created_at
          ) VALUES ($1, $2, $3, false, $4, NOW())`,
          [uuidv4(), submissionId, tc.id, Verdict.INTERNAL_ERROR]
        );
        lastVerdict = Verdict.INTERNAL_ERROR;
      }
    }

    // Calculate score
    totalScore = Math.round((passedCount / testCases.length) * 100);

    // Run Tree-Sitter AST Code Complexity Analysis
    const analysis = analyzeCode(sourceCode, language);

    // Update submission record (times already in ms)
    await client.query(
      `UPDATE submission_records SET
        verdict = $1, passed_count = $2, total_count = $3,
        score = $4, execution_time_ms = $5, memory_kb = $6,
        compile_output = $7, stderr = $8,
        cyclomatic_complexity = $9, maintainability_index = $10,
        max_nesting_depth = $11, optimization_warning = $12,
        evaluated_at = NOW()
       WHERE id = $13`,
      [
        lastVerdict, passedCount, testCases.length, totalScore, maxTimeMs, maxMemory,
        compileOutput, lastStderr,
        analysis.cyclomaticComplexity, analysis.maintainabilityIndex,
        analysis.maxNestingDepth, analysis.optimizationWarning,
        submissionId
      ]
    );

    await client.query('COMMIT');

    // Invalidate the roadmap/progress cache so the next page load is fresh
    const userRow = await query(
      `SELECT user_id FROM submission_records WHERE id = $1`, [submissionId]
    );
    if (userRow.rows[0]?.user_id) {
      bustRoadmapCache(userRow.rows[0].user_id).catch(() => {/* non-fatal */});
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Update submission verdict directly ────────────────────────
async function updateSubmissionVerdict(
  submissionId: string, verdict: Verdict,
  passedCount: number, totalCount: number,
  score: number, timeMs: number, memoryKb: number
) {
  await query(
    `UPDATE submission_records SET
      verdict = $1, passed_count = $2, total_count = $3,
      score = $4, execution_time_ms = $5, memory_kb = $6, evaluated_at = NOW()
     WHERE id = $7`,
    [verdict, passedCount, totalCount, score, timeMs, memoryKb, submissionId]
  );
}

// ─── Get Submission by ID ──────────────────────────────────────
export async function getSubmission(submissionId: string) {
  const result = await query(
    `SELECT sr.*,
       (SELECT json_agg(str.* ORDER BY str.created_at)
        FROM submission_test_results str WHERE str.submission_id = sr.id) AS test_results
     FROM submission_records sr WHERE sr.id = $1`,
    [submissionId]
  );
  if (result.rows.length === 0) throw AppError.notFound('Submission');
  return result.rows[0];
}

// ─── Derive Weak Topics for an Exam Attempt ────────────────────
// Returns the top failing topic tags based on non-accepted submissions.
// Also returns a submission summary used by the aural-oss bridge.
export async function getExamWeakTopics(attemptId: string, userId: string): Promise<{
  weakTopics: string[];
  submissionSummary: Array<{
    questionTitle: string;
    verdict: string;
    score: number;
    topics: string[];
    language?: string;
    submittedAnswerExcerpt?: string;
  }>;
  overallScore: number;
}> {
  // 1. Fetch the question snapshot to know all the questions in the exam and get the total question count
  const attemptRes = await query(
    `SELECT question_snapshot FROM exam_attempts WHERE id = $1`,
    [attemptId]
  );
  
  let versionIds: string[] = [];
  if (attemptRes.rows.length > 0) {
    const snapshot = attemptRes.rows[0].question_snapshot;
    versionIds = typeof snapshot === 'string' ? JSON.parse(snapshot) : (snapshot ?? []);
  }
  const totalQuestions = versionIds.length;

  // 2. Pull all submissions for this exam attempt with their question topic tags
  const result = await query(
    `SELECT
       sr.verdict,
       sr.score,
       sr.language,
       LEFT(sr.source_code, 1800) AS source_code_excerpt,
       qv.id            AS version_id,
       qv.title         AS question_title,
       qv.topic_tags    AS topics
     FROM submission_records sr
     JOIN question_versions qv ON qv.id = sr.version_id
     WHERE sr.session_id = $1
       AND sr.user_id   = $2
       AND sr.session_type = 'exam'
     ORDER BY sr.created_at DESC`,
    [attemptId, userId]
  );

  const rows = result.rows as Array<{
    verdict: string;
    score: number;
    language: string;
    source_code_excerpt: string;
    version_id: string;
    question_title: string;
    topics: string[];
  }>;

  // Deduplicate to latest submission per question (already ordered desc)
  const seen = new Set<string>();
  const latest: typeof rows = [];
  for (const row of rows) {
    if (!seen.has(row.question_title)) {
      seen.add(row.question_title);
      latest.push(row);
    }
  }

  // Count weak topic frequency (non-accepted)
  const topicFreq: Record<string, number> = {};
  for (const row of latest) {
    if (row.verdict !== 'accepted') {
      for (const tag of (row.topics ?? [])) {
        topicFreq[tag] = (topicFreq[tag] ?? 0) + 1;
      }
    }
  }

  const weakTopics = Object.entries(topicFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // Compute maximum score achieved for each question in the snapshot
  const maxScoresByVersion: Record<string, number> = {};
  for (const row of rows) {
    const vId = row.version_id;
    if (maxScoresByVersion[vId] === undefined || row.score > maxScoresByVersion[vId]) {
      maxScoresByVersion[vId] = row.score ?? 0;
    }
  }

  let totalScoreSum = 0;
  for (const vId of versionIds) {
    totalScoreSum += maxScoresByVersion[vId] ?? 0;
  }

  const overallScore = totalQuestions > 0 ? Math.round(totalScoreSum / totalQuestions) : 0;

  const submissionSummary = latest.map((r) => ({
    questionTitle: r.question_title,
    verdict: r.verdict,
    score: r.score ?? 0,
    topics: r.topics ?? [],
    language: r.language,
    submittedAnswerExcerpt: r.source_code_excerpt ?? "",
  }));

  return { weakTopics, submissionSummary, overallScore };
}

// ─── Get Submissions for a Session ─────────────────────────────
export async function getSessionSubmissions(sessionId: string, userId: string) {
  const result = await query(
    `SELECT id, question_id, language, verdict, passed_count, total_count, score, created_at, evaluated_at
     FROM submission_records
     WHERE session_id = $1 AND user_id = $2
     ORDER BY created_at DESC`,
    [sessionId, userId]
  );
  return result.rows;
}
