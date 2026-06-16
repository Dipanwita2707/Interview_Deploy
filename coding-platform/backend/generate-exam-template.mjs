/**
 * Exam Creation Excel Template Generator
 * Run: node generate-exam-template.mjs
 * Output: Exam_Creation_Template.xlsx
 *
 * The "Questions" sheet is kept flat (header row first) so that the bulk
 * import parser (which calls sheet_to_json with the first row as headers)
 * correctly reads the column names.
 */

import XLSX from "xlsx";

// ─── Sheet 1: Questions (FLAT — header row MUST be row 1) ────────────────────
// The backend import parser reads: title, difficulty, time_limit_minutes,
// topic_tags, problem_statement, input_format, output_format, constraints,
// sample_input, sample_output, explanation
const questionRows = [
  // Header row — must stay as row 1
  [
    "title",
    "difficulty",
    "time_limit_minutes",
    "topic_tags",
    "problem_statement",
    "input_format",
    "output_format",
    "constraints",
    "sample_input",
    "sample_output",
    "explanation",
  ],
  // Example row 1
  [
    "Two Sum",
    "easy",
    2,
    "arrays, hash-map",
    "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
    "First line: array size n\nSecond line: n space-separated integers\nThird line: target integer",
    "Two 0-based indices separated by space",
    "2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\nExactly one valid answer exists.",
    "[2,7,11,15]\n9",
    "0 1",
    "nums[0] + nums[1] = 2 + 7 = 9",
  ],
  // Example row 2
  [
    "Reverse a String",
    "easy",
    1,
    "strings, two-pointers",
    "Write a function that reverses a string. The input string is given as an array of characters.",
    "A single string s",
    "The reversed string",
    "1 <= s.length <= 10^5\ns consists of printable ASCII characters.",
    "hello",
    "olleh",
    "Use two pointers from each end and swap towards the middle.",
  ],
  // Example row 3
  [
    "Longest Substring Without Repeating Characters",
    "medium",
    3,
    "strings, sliding-window, hash-map",
    "Given a string s, find the length of the longest substring without repeating characters.",
    "A single string s",
    "An integer — the length of the longest substring",
    "0 <= s.length <= 5 * 10^4\ns consists of English letters, digits, symbols and spaces.",
    "abcabcbb",
    "3",
    "The answer is 'abc', with length 3.",
  ],
];

// Column widths matching header names
const questionColWidths = [30, 12, 20, 30, 60, 35, 35, 35, 25, 20, 40];

// ─── Sheet 2: Instructions ────────────────────────────────────────────────────
const instructionRows = [
  ["FIELD", "REQUIRED?", "ALLOWED VALUES / FORMAT", "NOTES"],
  ["title", "✅ Required", "Any text", "Display title of the question"],
  ["difficulty", "✅ Required", "easy | medium | hard  (or low | medium | high)", "Case-insensitive"],
  ["time_limit_minutes", "Optional", "Decimal number, e.g. 2 or 1.5", "Defaults to 2 minutes if blank"],
  ["topic_tags", "Optional", "Comma-separated, e.g. arrays, hash-map", "Used for filtering in question pool"],
  ["problem_statement", "✅ Required", "Full problem description text", "Shown to student in the exam"],
  ["input_format", "Optional", "Text describing the input format", ""],
  ["output_format", "Optional", "Text describing the expected output format", ""],
  ["constraints", "Optional", "Text, e.g. 2 <= n <= 10^4", "Shown below problem statement"],
  ["sample_input", "Optional", "Exact stdin input for the example", "Shown as Example input in problem"],
  ["sample_output", "Optional", "Exact expected output for the example", "Shown as Example output in problem"],
  ["explanation", "Optional", "Step-by-step walkthrough for the example", "Shown below sample I/O"],
  ["", "", "", ""],
  ["IMPORTANT NOTES", "", "", ""],
  ["• Row 1 of the Questions sheet must be the header row (already set)", "", "", ""],
  ["• Do NOT add instruction rows above the header in the Questions sheet", "", "", ""],
  ["• Each data row after the header becomes one question in the exam", "", "", ""],
  ["• Rows with empty 'title' are automatically skipped", "", "", ""],
  ["• difficulty accepts: easy/low → Easy, medium/med → Medium, hard/high → Hard", "", "", ""],
];

// ─── Build flat worksheet (header first) ─────────────────────────────────────
function buildFlatSheet(rows, colWidths) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  return ws;
}

// ─── Build instructions sheet ────────────────────────────────────────────────
function buildInstructionSheet(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [28, 14, 42, 45].map((w) => ({ wch: w }));
  return ws;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

// Sheet 1: Questions — flat, header row first (required by the import parser)
XLSX.utils.book_append_sheet(
  wb,
  buildFlatSheet(questionRows, questionColWidths),
  "Questions"
);

// Sheet 2: Instructions — field reference guide
XLSX.utils.book_append_sheet(
  wb,
  buildInstructionSheet(instructionRows),
  "Instructions"
);

const outputPath = "Exam_Creation_Template.xlsx";
XLSX.writeFile(wb, outputPath);
console.log(`✅  Excel template created: ${outputPath}`);
console.log(`\nSheets:`);
console.log(`  Questions     — Fill your questions here (header row 1, data from row 2)`);
console.log(`  Instructions  — Field reference: required fields, allowed values, notes`);
