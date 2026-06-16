import { query } from '../database/connection';
import { cacheGet, cacheSet, cacheDel } from '../database/redis';
import { config } from '../config';

// ─── Bust the roadmap cache for a user (call after verdict finalized) ──
export async function bustRoadmapCache(userId: string) {
  await cacheDel(`roadmap:summary:${userId}`);
  await cacheDel(`roadmap:perf:${userId}`);
}

// ─── Get Roadmap Summary for a Student ─────────────────────────
export async function getRoadmapSummary(userId: string) {
  const cacheKey = `roadmap:summary:${userId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  // ── Combined stats: both practice + exam submissions ───────────
  const practiceResult = await query(
    `SELECT
       COUNT(DISTINCT sr.id) FILTER (WHERE sr.verdict != 'pending')                           AS total_submissions,
       COUNT(DISTINCT CASE WHEN sr.verdict = 'accepted' THEN sr.question_id END)               AS total_solved,
       COUNT(DISTINCT CASE WHEN sr.verdict = 'accepted'
         AND qv.difficulty IN ('low','easy')   THEN sr.question_id END)                        AS easy_solved,
       COUNT(DISTINCT CASE WHEN sr.verdict = 'accepted'
         AND qv.difficulty = 'medium'          THEN sr.question_id END)                        AS medium_solved,
       COUNT(DISTINCT CASE WHEN sr.verdict = 'accepted'
         AND qv.difficulty IN ('high','hard')  THEN sr.question_id END)                        AS hard_solved,
       COUNT(DISTINCT CASE WHEN sr.verdict = 'accepted' THEN sr.id END)                        AS accepted_count
     FROM submission_records sr
     LEFT JOIN question_versions qv ON qv.id = sr.version_id
     WHERE sr.user_id = $1`,
    [userId],
  );

  // ── Exam stats: only count completed/evaluated/flagged/reviewed attempts ──
  const examResult = await query(
    `SELECT
       COUNT(DISTINCT ea.id)                          AS total_attempts,
       COALESCE(MAX(agg.exam_score), 0)               AS best_score,
       COALESCE(AVG(agg.exam_score), 0)               AS average_score
     FROM exam_attempts ea
     LEFT JOIN LATERAL (
       SELECT COALESCE(ROUND(AVG(max_q_score)), 0) AS exam_score
       FROM (
         SELECT COALESCE(MAX(sr.score), 0) AS max_q_score
         FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
         LEFT JOIN submission_records sr 
           ON sr.session_id = ea.id
           AND sr.session_type = 'exam'
           AND sr.version_id = v_id::uuid
           AND sr.verdict != 'pending'
         GROUP BY v_id
       ) q_scores
     ) agg ON true
     WHERE ea.user_id = $1
       AND ea.state IN ('submitted','evaluated','flagged','reviewed')`,
    [userId],
  );

  // ── Performance trend: last 10 non-pending submissions across all types ──
  const trendResult = await query(
    `SELECT
       AVG(score) FILTER (WHERE rn <= 5)  AS recent_avg,
       AVG(score) FILTER (WHERE rn > 5)   AS prev_avg
     FROM (
       SELECT score,
              ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
       FROM submission_records
       WHERE user_id = $1
         AND verdict != 'pending'
       LIMIT 10
     ) sub`,
    [userId],
  );

  const p = practiceResult.rows[0];
  const e = examResult.rows[0];
  const t = trendResult.rows[0];

  const totalSubmissions = parseInt(p.total_submissions || '0');
  const acceptedCount    = parseInt(p.accepted_count    || '0');
  const acceptanceRate   = totalSubmissions > 0
    ? Math.round((acceptedCount / totalSubmissions) * 100)
    : 0;

  // Band based on exam scores (if any exams taken) or acceptance rate
  const totalExams = parseInt(e.total_attempts || '0');
  const avgScore   = Math.round(parseFloat(e.average_score || '0'));
  let bandMetric   = acceptanceRate;
  if (totalExams > 0) {
    // Weight: 60% exam avg, 40% acceptance rate
    bandMetric = Math.round(avgScore * 0.6 + acceptanceRate * 0.4);
  }

  const band: 'green' | 'yellow' | 'red' =
    bandMetric >= 70 ? 'green' :
    bandMetric >= 40 ? 'yellow' : 'red';

  // Trend
  const recentAvg = parseFloat(t?.recent_avg || '0');
  const prevAvg   = parseFloat(t?.prev_avg   || '0');
  const trend: 'improving' | 'stable' | 'declining' =
    recentAvg > prevAvg + 5 ? 'improving' :
    recentAvg < prevAvg - 5 ? 'declining' : 'stable';

  const summary = {
    user_id: userId,
    practice_stats: {
      total_solved:      parseInt(p.total_solved   || '0'),
      easy_solved:       parseInt(p.easy_solved    || '0'),
      medium_solved:     parseInt(p.medium_solved  || '0'),
      hard_solved:       parseInt(p.hard_solved    || '0'),
      total_submissions: totalSubmissions,
      acceptance_rate:   acceptanceRate,
    },
    exam_stats: {
      total_attempts: totalExams,
      average_score:  avgScore,
      best_score:     Math.round(parseFloat(e.best_score || '0')),
    },
    recent_performance: { band, trend },
  };

  await cacheSet(cacheKey, JSON.stringify(summary), config.cache.studentContextTTL);
  return summary;
}

// ─── Get Performance Summary for a Student ─────────────────────
export async function getPerformanceSummary(userId: string) {
  const cacheKey = `roadmap:perf:${userId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  // Language usage (all submissions)
  const langResult = await query(
    `SELECT language,
            COUNT(*)   AS count,
            AVG(score) AS avg_score
     FROM submission_records
     WHERE user_id = $1 AND verdict != 'pending'
     GROUP BY language
     ORDER BY count DESC`,
    [userId],
  );

  // Topic breakdown (all submissions)
  const topicResult = await query(
    `SELECT UNNEST(qv.topic_tags)                                            AS topic,
            COUNT(DISTINCT sr.id)                                            AS attempted,
            COUNT(DISTINCT sr.id) FILTER (WHERE sr.verdict = 'accepted')     AS solved
     FROM submission_records sr
     JOIN question_versions qv ON qv.id = sr.version_id
     WHERE sr.user_id = $1 AND sr.verdict != 'pending'
     GROUP BY topic
     ORDER BY attempted DESC
     LIMIT 20`,
    [userId],
  );

  // ── Daily activity heatmap: submissions per day for the last 365 days ──
  const activityResult = await query(
    `SELECT DATE(sr.created_at AT TIME ZONE 'Asia/Kolkata') AS day,
            COUNT(*)                                         AS total,
            COUNT(*) FILTER (WHERE sr.verdict = 'accepted') AS accepted
     FROM submission_records sr
     WHERE sr.user_id = $1
       AND sr.created_at >= NOW() - INTERVAL '365 days'
       AND sr.verdict != 'pending'
     GROUP BY day
     ORDER BY day`,
    [userId],
  );

  // ── Per-exam breakdown ──────────────────────────────────────────
  const examBreakdownResult = await query(
    `SELECT
       ea.id                                                                       AS attempt_id,
       ea.state,
       ea.started_at,
       ea.submitted_at,
       ea.duration_minutes,
       rt.name                                                                     AS exam_name,
       rt.company,
       rt.role,
       COALESCE(jsonb_array_length(ea.question_snapshot), rt.question_count, 0)    AS total_questions,
       COALESCE((
         SELECT COUNT(DISTINCT sr2.question_id)
         FROM submission_records sr2
         WHERE sr2.session_id = ea.id
           AND sr2.session_type = 'exam'
           AND sr2.verdict != 'pending'
       ), 0)                                                                       AS questions_attempted,
       COALESCE((
         SELECT COUNT(DISTINCT sr2.question_id)
         FROM submission_records sr2
         WHERE sr2.session_id = ea.id
           AND sr2.session_type = 'exam'
           AND sr2.verdict = 'accepted'
       ), 0)                                                                       AS questions_solved,
       COALESCE((
         SELECT ROUND(AVG(max_q_score))
         FROM (
           SELECT COALESCE(MAX(sr2.score), 0) AS max_q_score
           FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
           LEFT JOIN submission_records sr2 
             ON sr2.session_id = ea.id
             AND sr2.session_type = 'exam'
             AND sr2.version_id = v_id::uuid
             AND sr2.verdict != 'pending'
           GROUP BY v_id
         ) q_scores
       ), 0)                                                                       AS score_pct,
       (
         SELECT sr2.language
         FROM submission_records sr2
         WHERE sr2.session_id = ea.id AND sr2.session_type = 'exam'
         ORDER BY sr2.created_at DESC
         LIMIT 1
       )                                                                           AS primary_language,
       COALESCE((
         SELECT ARRAY_AGG(DISTINCT qv.difficulty) FILTER (WHERE qv.difficulty IS NOT NULL)
         FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
         JOIN question_versions qv ON qv.id = v_id::uuid
       ), '{}'::text[])                                                           AS difficulties,
       COALESCE((
         SELECT ARRAY_AGG(DISTINCT tag) FILTER (WHERE tag IS NOT NULL)
         FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
         JOIN question_versions qv ON qv.id = v_id::uuid
         LEFT JOIN LATERAL UNNEST(qv.topic_tags) AS tag ON true
       ), '{}'::text[])                                                           AS topics
     FROM exam_attempts ea
     LEFT JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
     WHERE ea.user_id = $1
       AND ea.state IN ('submitted','evaluated','flagged','reviewed')
     GROUP BY ea.id, ea.state, ea.started_at, ea.submitted_at, ea.duration_minutes,
              rt.name, rt.company, rt.role, rt.question_count, ea.question_snapshot
     ORDER BY ea.submitted_at DESC NULLS LAST
     LIMIT 50`,
    [userId],
  );

  const totalLang = langResult.rows.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sum: number, r: any) => sum + parseInt(r.count), 0,
  );

  // Build 365-day activity map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activityMap: Record<string, { total: number; accepted: number }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activityResult.rows.forEach((r: any) => {
    const dateStr = typeof r.day === 'string'
      ? r.day.slice(0, 10)
      : new Date(r.day).toISOString().slice(0, 10);
    activityMap[dateStr] = {
      total:    parseInt(r.total),
      accepted: parseInt(r.accepted),
    };
  });

  const result = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    language_usage: langResult.rows.map((r: any) => ({
      language:   r.language,
      count:      parseInt(r.count),
      percentage: totalLang > 0
        ? Math.round((parseInt(r.count) / totalLang) * 100)
        : 0,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topic_breakdown: topicResult.rows.map((r: any) => {
      const attempted = parseInt(r.attempted);
      const solved    = parseInt(r.solved);
      return {
        topic: r.topic,
        attempted,
        solved,
        success_rate: attempted > 0 ? Math.round((solved / attempted) * 100) : 0,
      };
    }),
    daily_activity: activityMap,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exam_breakdown: examBreakdownResult.rows.map((r: any) => ({
      attempt_id:          r.attempt_id,
      state:               r.state,
      exam_name:           r.exam_name ?? 'Exam',
      company:             r.company ?? null,
      role:                r.role ?? null,
      started_at:          r.started_at,
      submitted_at:        r.submitted_at,
      duration_minutes:    parseInt(r.duration_minutes || '0'),
      total_questions:     parseInt(r.total_questions || '0'),
      questions_attempted: parseInt(r.questions_attempted || '0'),
      questions_solved:    parseInt(r.questions_solved || '0'),
      score_pct:           parseInt(r.score_pct || '0'),
      primary_language:    r.primary_language ?? null,
      difficulties:        r.difficulties ?? [],
      topics:              (r.topics ?? []).slice(0, 5),
    })),
  };

  await cacheSet(cacheKey, JSON.stringify(result), config.cache.studentContextTTL);
  return result;
}
