/**
 * Seed script — inserts 5 practice questions with test cases and starter code
 * Run with: npx ts-node seed-questions.ts
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ─── Seed data ────────────────────────────────────────────────

interface Question {
  slug: string;
  title: string;
  problem_statement: string;
  input_format: string;
  output_format: string;
  constraints: string;
  difficulty: 'low' | 'medium' | 'high';
  topic_tags: string[];
  examples: object[];
  time_limit_ms: number;
  test_cases: { input: string; expected_output: string; is_public: boolean; explanation?: string }[];
  starter: { language: string; code: string }[];
}

const questions: Question[] = [
  // ─── 1. Two Sum ─────────────────────────────────────────────
  {
    slug: 'two-sum',
    title: 'Two Sum',
    problem_statement: `Given an array of integers \`nums\` and an integer \`target\`, return the **indices** of the two numbers such that they add up to target.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice.

Return the answer in any order.`,
    input_format: `- First line: integer \`n\` (size of array)
- Second line: \`n\` space-separated integers
- Third line: integer \`target\``,
    output_format: `Two space-separated integers representing the 0-based indices.`,
    constraints: `- 2 ≤ n ≤ 10⁴\n- -10⁹ ≤ nums[i] ≤ 10⁹\n- -10⁹ ≤ target ≤ 10⁹`,
    difficulty: 'low',
    topic_tags: ['arrays', 'hash-map', 'two-pointers'],
    examples: [
      { input: '4\n2 7 11 15\n9', output: '0 1', explanation: 'nums[0] + nums[1] = 2 + 7 = 9' },
      { input: '3\n3 2 4\n6', output: '1 2', explanation: 'nums[1] + nums[2] = 2 + 4 = 6' },
    ],
    time_limit_ms: 2000,
    test_cases: [
      { input: '4\n2 7 11 15\n9',   expected_output: '0 1', is_public: true, explanation: 'Basic example' },
      { input: '3\n3 2 4\n6',       expected_output: '1 2', is_public: true },
      { input: '2\n3 3\n6',         expected_output: '0 1', is_public: false },
      { input: '5\n1 4 5 3 2\n8',   expected_output: '1 2', is_public: false },
      { input: '3\n-1 -2 -3\n-5',   expected_output: '1 2', is_public: false },
    ],
    starter: [
      {
        language: 'python',
        code: `n = int(input())
nums = list(map(int, input().split()))
target = int(input())

# Write your solution here
seen = {}
for i, v in enumerate(nums):
    if target - v in seen:
        print(seen[target - v], i)
        break
    seen[v] = i`,
      },
      {
        language: 'javascript',
        code: `const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n');
const n = parseInt(lines[0]);
const nums = lines[1].split(' ').map(Number);
const target = parseInt(lines[2]);

// Write your solution here
const seen = new Map();
for (let i = 0; i < n; i++) {
  const complement = target - nums[i];
  if (seen.has(complement)) {
    console.log(seen.get(complement), i);
    break;
  }
  seen.set(nums[i], i);
}`,
      },
      {
        language: 'cpp',
        code: `#include <iostream>
#include <vector>
#include <unordered_map>
using namespace std;

int main() {
    int n; cin >> n;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];
    int target; cin >> target;
    
    // Write your solution here
    unordered_map<int,int> seen;
    for (int i = 0; i < n; i++) {
        if (seen.count(target - nums[i])) {
            cout << seen[target - nums[i]] << " " << i;
            return 0;
        }
        seen[nums[i]] = i;
    }
    return 0;
}`,
      },
    ],
  },

  // ─── 2. Palindrome Check ────────────────────────────────────
  {
    slug: 'palindrome-number',
    title: 'Palindrome Number',
    problem_statement: `Given an integer \`x\`, return **true** if \`x\` is a palindrome, and **false** otherwise.

An integer is a palindrome when it reads the same forward and backward. For example, \`121\` is a palindrome while \`123\` is not.`,
    input_format: `A single integer \`x\`.`,
    output_format: `Print \`true\` or \`false\`.`,
    constraints: `- -2³¹ ≤ x ≤ 2³¹ - 1`,
    difficulty: 'low',
    topic_tags: ['math', 'strings'],
    examples: [
      { input: '121',  output: 'true',  explanation: '121 reads as 121 from left to right and right to left.' },
      { input: '-121', output: 'false', explanation: 'From left to right it reads -121. From right to left it reads 121-.' },
      { input: '10',   output: 'false', explanation: 'Reads 01 from right to left.' },
    ],
    time_limit_ms: 1000,
    test_cases: [
      { input: '121',        expected_output: 'true',  is_public: true },
      { input: '-121',       expected_output: 'false', is_public: true },
      { input: '10',         expected_output: 'false', is_public: false },
      { input: '0',          expected_output: 'true',  is_public: false },
      { input: '1221',       expected_output: 'true',  is_public: false },
      { input: '2147483647', expected_output: 'false', is_public: false },
    ],
    starter: [
      {
        language: 'python',
        code: `x = int(input())
s = str(x)
print(str(x).lower() == str(x).lower()[::-1])`,
      },
      {
        language: 'javascript',
        code: `const x = parseInt(require('fs').readFileSync('/dev/stdin','utf8').trim());
const s = String(x);
console.log(s === s.split('').reverse().join(''));`,
      },
      {
        language: 'cpp',
        code: `#include <iostream>
#include <string>
#include <algorithm>
using namespace std;
int main() {
    long long x; cin >> x;
    string s = to_string(x);
    string r = s;
    reverse(r.begin(), r.end());
    cout << (s == r ? "true" : "false");
    return 0;
}`,
      },
    ],
  },

  // ─── 3. Fibonacci ────────────────────────────────────────────
  {
    slug: 'fibonacci-number',
    title: 'Fibonacci Number',
    problem_statement: `The **Fibonacci numbers** form a sequence where each number is the sum of the two preceding ones, starting from 0 and 1.

\`F(0) = 0, F(1) = 1\`
\`F(n) = F(n-1) + F(n-2)\` for n > 1

Given \`n\`, calculate \`F(n)\`.`,
    input_format: `A single integer \`n\`.`,
    output_format: `A single integer — the nth Fibonacci number.`,
    constraints: `- 0 ≤ n ≤ 30`,
    difficulty: 'low',
    topic_tags: ['recursion', 'dynamic-programming', 'math'],
    examples: [
      { input: '2',  output: '1',  explanation: 'F(2) = F(1) + F(0) = 1 + 0 = 1' },
      { input: '3',  output: '2',  explanation: 'F(3) = F(2) + F(1) = 1 + 1 = 2' },
      { input: '4',  output: '3',  explanation: 'F(4) = F(3) + F(2) = 2 + 1 = 3' },
    ],
    time_limit_ms: 1000,
    test_cases: [
      { input: '0',  expected_output: '0',   is_public: true },
      { input: '1',  expected_output: '1',   is_public: true },
      { input: '2',  expected_output: '1',   is_public: false },
      { input: '5',  expected_output: '5',   is_public: false },
      { input: '10', expected_output: '55',  is_public: false },
      { input: '20', expected_output: '6765', is_public: false },
    ],
    starter: [
      {
        language: 'python',
        code: `n = int(input())
a, b = 0, 1
for _ in range(n):
    a, b = b, a + b
print(a)`,
      },
      {
        language: 'javascript',
        code: `const n = parseInt(require('fs').readFileSync('/dev/stdin','utf8').trim());
let a = 0, b = 1;
for (let i = 0; i < n; i++) [a, b] = [b, a + b];
console.log(a);`,
      },
      {
        language: 'cpp',
        code: `#include <iostream>
using namespace std;
int main() {
    int n; cin >> n;
    long long a = 0, b = 1;
    for (int i = 0; i < n; i++) { long long t = a + b; a = b; b = t; }
    cout << a;
    return 0;
}`,
      },
    ],
  },

  // ─── 4. Valid Parentheses ─────────────────────────────────────
  {
    slug: 'valid-parentheses',
    title: 'Valid Parentheses',
    problem_statement: `Given a string \`s\` containing just the characters \`(\`, \`)\`, \`{\`, \`}\`, \`[\` and \`]\`, determine if the input string is **valid**.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.`,
    input_format: `A single string \`s\`.`,
    output_format: `Print \`true\` or \`false\`.`,
    constraints: `- 1 ≤ s.length ≤ 10⁴\n- s consists of parentheses only: \`()[]{}\``,
    difficulty: 'medium',
    topic_tags: ['stack', 'strings'],
    examples: [
      { input: '()',     output: 'true' },
      { input: '()[]{}', output: 'true' },
      { input: '(]',     output: 'false' },
    ],
    time_limit_ms: 1000,
    test_cases: [
      { input: '()',        expected_output: 'true',  is_public: true },
      { input: '()[]{}',   expected_output: 'true',  is_public: true },
      { input: '(]',        expected_output: 'false', is_public: false },
      { input: '([)]',      expected_output: 'false', is_public: false },
      { input: '{[]}',      expected_output: 'true',  is_public: false },
      { input: '',          expected_output: 'true',  is_public: false },
      { input: '(((',       expected_output: 'false', is_public: false },
    ],
    starter: [
      {
        language: 'python',
        code: `s = input()
stack = []
pairs = {')': '(', '}': '{', ']': '['}
for c in s:
    if c in '({[':
        stack.append(c)
    elif not stack or stack[-1] != pairs[c]:
        print('false')
        exit()
    else:
        stack.pop()
print('true' if not stack else 'false')`,
      },
      {
        language: 'javascript',
        code: `const s = require('fs').readFileSync('/dev/stdin','utf8').trim();
const stack = [];
const pairs = { ')': '(', '}': '{', ']': '[' };
for (const c of s) {
  if ('({['.includes(c)) stack.push(c);
  else if (!stack.length || stack[stack.length-1] !== pairs[c]) { console.log('false'); process.exit(); }
  else stack.pop();
}
console.log(stack.length === 0 ? 'true' : 'false');`,
      },
      {
        language: 'cpp',
        code: `#include <iostream>
#include <stack>
#include <unordered_map>
using namespace std;
int main() {
    string s; cin >> s;
    stack<char> st;
    unordered_map<char,char> p = {{')', '('}, {'}', '{'}, {']', '['}};
    for (char c : s) {
        if (c=='(' || c=='{' || c=='[') st.push(c);
        else if (st.empty() || st.top() != p[c]) { cout << "false"; return 0; }
        else st.pop();
    }
    cout << (st.empty() ? "true" : "false");
    return 0;
}`,
      },
    ],
  },

  // ─── 5. Reverse Linked List ──────────────────────────────────
  {
    slug: 'reverse-a-string',
    title: 'Reverse a String',
    problem_statement: `Write a function that reverses a string. The input is given as an array of characters.

You must do this by modifying the input array **in-place** with O(1) extra memory.

For this problem, read the string from stdin and print the reversed string.`,
    input_format: `A single line containing a string.`,
    output_format: `The reversed string on a single line.`,
    constraints: `- 1 ≤ s.length ≤ 10⁵\n- s[i] is a printable ASCII character`,
    difficulty: 'low',
    topic_tags: ['strings', 'two-pointers', 'recursion'],
    examples: [
      { input: 'hello',  output: 'olleh' },
      { input: 'Hannah', output: 'hannaH' },
    ],
    time_limit_ms: 1000,
    test_cases: [
      { input: 'hello',      expected_output: 'olleh',    is_public: true },
      { input: 'Hannah',     expected_output: 'hannaH',   is_public: true },
      { input: 'a',          expected_output: 'a',        is_public: false },
      { input: 'abcde',      expected_output: 'edcba',    is_public: false },
      { input: 'racecar',    expected_output: 'racecar',  is_public: false },
    ],
    starter: [
      {
        language: 'python',
        code: `s = input()
print(s[::-1])`,
      },
      {
        language: 'javascript',
        code: `const s = require('fs').readFileSync('/dev/stdin','utf8').trim();
console.log(s.split('').reverse().join(''));`,
      },
      {
        language: 'cpp',
        code: `#include <iostream>
#include <string>
#include <algorithm>
using namespace std;
int main() {
    string s; getline(cin, s);
    reverse(s.begin(), s.end());
    cout << s;
    return 0;
}`,
      },
    ],
  },
];

// ─── Insert Functions ──────────────────────────────────────────

async function seed() {
  const client = await pool.connect();

  try {
    console.log('🌱 Seeding questions...\n');

    // 1. Ensure a system user exists
    const sysUserId = uuidv4();
    const { rows: existing } = await client.query(
      `SELECT id FROM users WHERE smart_user_id = 'system-seed'`
    );

    let userId: string;
    if (existing.length > 0) {
      userId = existing[0].id;
      console.log('  ℹ️  Using existing seed user:', userId);
    } else {
      const { rows } = await client.query(
        `INSERT INTO users (id, smart_user_id, email, name, role)
         VALUES ($1, 'system-seed', 'seed@platform.local', 'System Seed', 'placement_head')
         ON CONFLICT (smart_user_id) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [sysUserId]
      );
      userId = rows[0].id;
      console.log('  ✅ Created seed user:', userId);
    }

    // 2. Insert each question
    for (const q of questions) {
      // Skip if already seeded
      const { rows: existing } = await client.query(
        `SELECT id FROM question_bank WHERE slug = $1`, [q.slug]
      );
      if (existing.length > 0) {
        console.log(`  ⏭️  Skipping "${q.title}" (already exists)`);
        continue;
      }

      await client.query('BEGIN');

      // question_bank
      const qbId = uuidv4();
      await client.query(
        `INSERT INTO question_bank (id, slug, created_by) VALUES ($1, $2, $3)`,
        [qbId, q.slug, userId]
      );

      // question_versions
      const qvId = uuidv4();
      await client.query(
        `INSERT INTO question_versions (
          id, question_id, version_number, title, problem_statement,
          input_format, output_format, constraints, examples, difficulty,
          topic_tags, time_limit_ms, supported_languages, status, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'published',$14)`,
        [
          qvId, qbId, 1, q.title, q.problem_statement,
          q.input_format, q.output_format, q.constraints,
          JSON.stringify(q.examples), q.difficulty,
          q.topic_tags, q.time_limit_ms,
          ['python', 'javascript', 'cpp'],
          userId,
        ]
      );

      // test_cases
      for (let i = 0; i < q.test_cases.length; i++) {
        const tc = q.test_cases[i];
        await client.query(
          `INSERT INTO test_cases (id, version_id, input, expected_output, is_public, explanation, order_index)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [uuidv4(), qvId, tc.input, tc.expected_output, tc.is_public, tc.explanation || null, i]
        );
      }

      // starter_code
      for (const sc of q.starter) {
        await client.query(
          `INSERT INTO starter_code (id, version_id, language_id, code)
           VALUES ($1,$2,$3,$4)`,
          [uuidv4(), qvId, sc.language, sc.code]
        );
      }

      await client.query('COMMIT');
      console.log(`  ✅ "${q.title}" — ${q.test_cases.length} test cases, ${q.starter.length} languages`);
    }

    console.log('\n✅ Seeding complete!\n');

    // Print summary
    const { rows: counts } = await client.query(
      `SELECT COUNT(*) as q FROM question_bank`
    );
    const { rows: versions } = await client.query(
      `SELECT qv.title, qv.difficulty, qv.status, array_length(qv.topic_tags,1) as tags
       FROM question_versions qv ORDER BY qv.created_at`
    );
    console.log(`📊 Total questions in DB: ${counts[0].q}`);
    console.log('\n Questions:');
    versions.forEach((v, i) =>
      console.log(`  ${i + 1}. [${v.difficulty.toUpperCase()}] ${v.title} (${v.status})`)
    );

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
