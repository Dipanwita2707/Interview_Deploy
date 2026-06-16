const BASE = "http://localhost:5001";
const AURAL = "http://localhost:3000";

async function api(method, path, body, token, base) {
  base = base || BASE;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(base + path, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch (e) { return { status: res.status, data: text }; }
}

function log(step, r, showFull) {
  const ok = r.status < 300;
  console.log("\n" + (ok ? "✅" : "❌") + " " + step + " [" + r.status + "]");
  const str = JSON.stringify(r.data, null, 2);
  console.log(showFull ? str : str.slice(0, 800));
  return ok;
}

function bail(msg) { console.error("\n🛑 ABORT: " + msg); process.exit(1); }

let adminToken, studentToken, templateId, attemptId, submissionId;
let useQId, useVId;

// STEP 1: Login
let r = await api("POST", "/api/auth/dev-login", { email: "admin@platform.local", password: "Admin@123" });
log("Admin login", r);
if (!r.data?.data?.token) bail("no admin token");
adminToken = r.data.data.token;

r = await api("POST", "/api/auth/dev-login", { email: "student@platform.local", password: "Student@123" });
log("Student login", r);
if (!r.data?.data?.token) bail("no student token");
studentToken = r.data.data.token;
const studentId = r.data.data.user.id;
console.log("  Student ID: " + studentId);

// STEP 2: Create exam template
r = await api("POST", "/api/exam/templates", {
  name: "Pipeline Test " + Date.now(),
  company: "TestCo",
  role: "SWE",
  questionCount: 1,
  difficultyDistribution: { low: 1, medium: 0, high: 0 },
  durationMinutes: 60,
  allowedRetakes: 0,
  shuffleQuestions: false,
  isDefault: false
}, adminToken);
log("Create template", r);
templateId = r.data?.data?.templateId || r.data?.data?.id;
if (!templateId) bail("no templateId");
console.log("  Template ID: " + templateId);

// STEP 3: Find a question from the pool search
console.log("\n=== STEP 3: Find question in bank ===");
r = await api("GET", "/api/exam/templates/" + templateId + "/question-pool/search?q=&limit=10", null, adminToken);
log("Search bank", r);
let pool = r.data?.data || [];
if (!Array.isArray(pool)) pool = [];
console.log("  Bank questions found: " + pool.length);
if (pool.length === 0) bail("No questions in bank — add via admin UI at localhost:3001");

const bankQ = pool[0];
useQId = bankQ.questionId || bankQ.id || bankQ.question_id;
useVId = bankQ.versionId  || bankQ.version_id || bankQ.currentVersionId;
console.log("  Using: \"" + bankQ.title + "\" qId=" + useQId + " vId=" + useVId);

// STEP 4: Add to exam pool
console.log("\n=== STEP 4: Add to exam pool ===");
r = await api("POST", "/api/exam/templates/" + templateId + "/question-pool", {
  questions: [{ questionId: useQId, versionId: useVId, marks: 50, order: 1 }]
}, adminToken);
log("Add to pool", r, true);

// STEP 5: Launch for student
console.log("\n=== STEP 5: Launch exam for student ===");
r = await api("POST", "/api/exam/templates/" + templateId + "/launch-for/" + studentId, {}, adminToken);
log("Launch exam", r, true);
attemptId = r.data?.data?.attemptId || r.data?.data?.id;
if (!attemptId) bail("no attemptId");
console.log("  Attempt ID: " + attemptId);

// STEP 6: Student starts exam
console.log("\n=== STEP 6: Start exam ===");
r = await api("POST", "/api/exam/" + attemptId + "/start", {}, studentToken);
log("Start exam", r, true);

// STEP 7: Get exam detail with questions
console.log("\n=== STEP 7: Get exam detail ===");
r = await api("GET", "/api/exam/" + attemptId, null, studentToken);
log("Get attempt", r);
const questions = r.data?.data?.attempt?.questions || [];
console.log("  Questions resolved: " + questions.length);
questions.forEach(function(q, i) {
  console.log("    [" + i + "] \"" + q.title + "\" vId=" + q.version_id);
});
if (questions.length === 0) bail("No questions — pool/snapshot mismatch");

useQId = questions[0].question_id;
useVId = questions[0].version_id;
console.log("  Submitting for: \"" + questions[0].title + "\"");

// STEP 8: Submit code
console.log("\n=== STEP 8: Submit code ===");
const src = "def twoSum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i";
r = await api("POST", "/api/exam/" + attemptId + "/submissions", {
  questionId: useQId,
  versionId: useVId,
  sourceCode: src,
  language: "python"
}, studentToken);
log("Submit code", r, true);
submissionId = r.data?.data?.id || r.data?.data?.submissionId;
if (!submissionId) bail("no submissionId");

console.log("\n[waiting 5s for judge...]");
await new Promise(function(res) { setTimeout(res, 5000); });

r = await api("GET", "/api/exam/" + attemptId + "/submissions/" + submissionId, null, studentToken);
log("Submission verdict", r, true);

// STEP 9: Submit exam
console.log("\n=== STEP 9: Submit exam (triggers aural bridge) ===");
r = await api("POST", "/api/exam/" + attemptId + "/submit", {}, studentToken);
log("Submit exam", r, true);
const interviewUrl = r.data?.data?.interviewSessionUrl;
console.log("\n🎯 Interview URL: " + (interviewUrl || "NOT GENERATED"));

if (!interviewUrl) {
  console.log("Bridge not configured — check AURAL_OSS_BRIDGE_URL + AURAL_OSS_SERVICE_KEY in backend .env");
  process.exit(0);
}

const tokenMatch = interviewUrl.match(/\/invite\/([^/]+)\//);
const inviteToken = tokenMatch ? tokenMatch[1] : null;
console.log("  Invite token: " + inviteToken);

// STEP 10: Refresh metadata via interview-link
console.log("\n=== STEP 10: Interview link (triggers metadata refresh) ===");
r = await api("GET", "/api/exam/" + attemptId + "/interview-link", null, studentToken);
log("Interview link + refresh", r, true);

// STEP 11: Verify aural-oss metadata
if (inviteToken) {
  console.log("\n=== STEP 11: Check aural-oss participantMetadata ===");
  const tRPCInput = encodeURIComponent(JSON.stringify({ json: { token: inviteToken } }));
  r = await api("GET", "/api/trpc/candidate.getByToken?input=" + tRPCInput, null, null, AURAL);
  log("Aural getByToken", r);
  const meta = r.data?.result?.data?.json?.session?.participantMetadata;
  console.log("\n📦 participantMetadata:\n" + JSON.stringify(meta, null, 2)?.slice(0, 1500));
  const summary = meta?.submissionSummary || [];
  console.log("\n📊 submissionSummary entries: " + summary.length);
  summary.forEach(function(s, i) {
    console.log("  [" + i + "] \"" + s.questionTitle + "\" verdict=" + s.verdict + " score=" + s.score + " lang=" + s.language);
    const ex = s.submittedAnswerExcerpt;
    console.log("       excerpt: " + (ex ? "\"" + ex.slice(0, 100) + "\"" : "EMPTY ❌"));
  });
}

console.log("\n=== PIPELINE DONE ===");
