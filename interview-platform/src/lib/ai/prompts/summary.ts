import { getLanguageKey, LANGUAGE_DISPLAY_NAME } from "@/lib/i18n";
import type { LLMContentPart, LLMMessage } from "../types";

export interface WhiteboardDrawingInput {
  label: string;
  imageDataUrl?: string | null;
}

export interface CodeSnippetInput {
  label: string;
  code: string;
  language: string;
}

export function buildSummaryPrompt(
  interviewTitle: string,
  messages: { role: string; content: string }[],
  objective?: string | null,
  assessmentCriteria?: { name: string; description: string }[] | null,
  questions?: { text: string; order: number; type?: string }[] | null,
  language?: string | null,
  whiteboardDrawings?: WhiteboardDrawingInput[] | null,
  codeSnippets?: CodeSnippetInput[] | null
): LLMMessage[] {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Participant" : "Interviewer"}: ${m.content}`)
    .join("\n\n");

  const objectiveSection = objective
    ? `\nInterview Objective: "${objective}"`
    : "";

  // ── Questions section ──────────────────────────────────────────
  const questionsSection =
    questions && questions.length > 0
      ? `\n\nInterview Questions:\n${questions.map((q, i) => `${i + 1}. ${q.type ? `[${q.type}] ` : ""}${q.text}`).join("\n")}`
      : "";

  // ── Whiteboard drawings section (text context) ─────────────────
  const hasDrawings = whiteboardDrawings && whiteboardDrawings.length > 0;
  const whiteboardSection = hasDrawings
    ? `\n\nWhiteboard Drawings (created by the participant during the interview):\n${whiteboardDrawings.map((d, i) => `${i + 1}. "${d.label}"`).join("\n")}`
    : "";

  // ── Code snippets section ─────────────────────────────────────
  const hasCode = codeSnippets && codeSnippets.length > 0;
  const codeSection = hasCode
    ? `\n\nCode Snippets (written by the participant during the interview):\n${codeSnippets.map((s, i) => `--- Snippet ${i + 1}: "${s.label}" (${s.language}) ---\n${s.code}\n--- End of Snippet ${i + 1} ---`).join("\n\n")}`
    : "";

  // ── Assessment criteria section ────────────────────────────────
  const criteriaSection =
    assessmentCriteria && assessmentCriteria.length > 0
      ? `\nAssessment Criteria:\n${assessmentCriteria.map((c) => `- ${c.name}: ${c.description}`).join("\n")}`
      : "";

  const criteriaEvalInstruction =
    assessmentCriteria && assessmentCriteria.length > 0
      ? `7. Evaluate the participant against EACH assessment criterion with a score (1-10) and reasoning\n`
      : "";

  const criteriaJsonField =
    assessmentCriteria && assessmentCriteria.length > 0
      ? `,
  "criteriaEvaluations": [
    {
      "name": "criterion name",
      "score": 1-10,
      "reasoning": "detailed explanation tied to transcript evidence",
      "evidence": ["specific participant statement, paraphrase, or quote supporting the score"],
      "strengths": ["criterion-specific strength"],
      "risks": ["criterion-specific concern or missing evidence"]
    }
  ]`
      : "";

  // ── Research questions section ────────────────────────────────
  const researchQuestions = questions?.filter((q) => q.type === "RESEARCH") ?? [];
  const hasResearchQuestions = researchQuestions.length > 0;

  const toneInstruction = `${hasResearchQuestions ? "9" : "8"}. Analyze the participant's communication tone and confidence throughout the interview by examining speech patterns in the transcript: filler words ("um", "uh", "like", "嗯", "那个"), hedging language ("I think maybe", "I'm not sure but", "可能", "大概"), response lengths, directness vs evasiveness, and enthusiasm markers. Produce a per-question tone assessment.\n`;

  const researchInstruction = hasResearchQuestions
    ? `${hasResearchQuestions ? "10" : "9"}. For each RESEARCH-type question, produce a detailed research finding: a comprehensive, specific summary of ALL information the participant shared on that topic, organized into key sub-topics with supporting details, data points, examples, and direct quotes. This should read like a thorough research brief — be as specific and detailed as possible.\n`
    : "";

  const researchJsonField = hasResearchQuestions
    ? `,
  "researchFindings": [
    {
      "question": "the research question text",
      "summary": "comprehensive 2-4 paragraph summary of all information extracted, organized by sub-topics",
      "keyTopics": [
        { "topic": "topic name", "details": "specific details, data points, examples, and quotes from the participant" }
      ],
      "dataPoints": ["specific fact, number, or data point mentioned by the participant"]
    }
  ]`
    : "";

  // ── Per-question evaluation section ────────────────────────────
  const questionEvalInstruction =
    questions && questions.length > 0
      ? `6. For EACH interview question, evaluate the participant's response: how well they addressed the question, key strengths, areas for improvement, and a score (1-10)\n`
      : "";

  const questionEvalJsonField =
    questions && questions.length > 0
      ? `,
  "questionEvaluations": [
    {
      "question": "the interview question text",
      "score": 8,
      "answerSummary": "what the participant actually said in 3-6 sentences",
      "evaluation": "detailed evaluation of response quality, specificity, correctness, and completeness",
      "scoreRationale": "why this score was assigned; mention evidence quality and missing pieces",
      "evidence": ["specific participant statement, quote, example, or behavior from the transcript"],
      "highlights": ["specific strength or notable point"],
      "improvements": ["area where the response could be improved"],
      "depth": "low" | "medium" | "high",
      "relevance": "low" | "medium" | "high",
      "clarity": "low" | "medium" | "high"
    }
  ]`
      : "";

  // ── Language instruction ───────────────────────────────────────
  const langKey = getLanguageKey(language ?? undefined);
  const languageInstruction = language
    ? `\n\nIMPORTANT: Write the ENTIRE report (all text fields including summary, evaluations, insights, themes) in ${LANGUAGE_DISPLAY_NAME[langKey]}. Do NOT mix languages.`
    : "";

  const whiteboardInstruction = hasDrawings
    ? "\n- The participant created whiteboard drawings during the interview to visually illustrate their ideas. The drawing images are attached below. Analyze the visual content of each drawing and incorporate your observations into the report — describe what was drawn, how it relates to the discussion, and whether it demonstrates clear thinking or effective communication."
    : "";

  const codeInstruction = hasCode
    ? "\n- The participant wrote code snippets during the interview. Evaluate the code quality, correctness, readability, and problem-solving approach. Consider whether the code demonstrates strong algorithmic thinking, proper use of data structures, good coding practices, and effective handling of edge cases. Incorporate your code evaluation into the report."
    : "";

  const systemPrompt = `You are an expert interview analyst producing a rigorous assessment report for a hiring or evaluation team. Evaluate and summarize the following interview transcript. Focus on the participant's responses — their depth, relevance, evidence quality, correctness, communication, and consistency.

Interview: "${interviewTitle}"${objectiveSection}${criteriaSection}${questionsSection}${whiteboardSection}${codeSection}

Transcript:
${transcript}

Your analysis should:
1. Produce an executive-level assessment with a clear recommendation
2. Summarize the key points from the participant's answers with enough detail that a reviewer can understand what was said without rereading the transcript
3. Evaluate how well the participant addressed each topic
4. Identify recurring themes, notable insights, risks, and missing evidence
5. Assess the overall sentiment, engagement level, communication quality, and confidence
6. Highlight particularly strong or weak responses using transcript evidence${whiteboardInstruction}${codeInstruction}
${questionEvalInstruction}${criteriaEvalInstruction}${toneInstruction}${researchInstruction}${languageInstruction}
7. Build a skill map and personalized roadmap like a placement-readiness report: identify 5-8 skills, classify each as strength/solid/gap/critical, and provide a prioritized plan with measurable practice tasks.

Scoring rules:
- Score only from evidence in the transcript, whiteboard, or code. Do not reward generic claims without examples.
- Use 9-10 only for exceptional, specific, well-supported answers.
- Use 7-8 for solid answers with useful detail and minor gaps.
- Use 5-6 for partially correct or shallow answers.
- Use 1-4 for vague, incorrect, evasive, or missing answers.
- If there is not enough evidence, say so explicitly and score conservatively.
- Every score must include a concrete rationale and at least one evidence item when evidence exists.

Provide a structured analysis as VALID JSON ONLY (use only standard ASCII double-quotes, never Unicode smart quotes like \u201C \u201D):
{
  "executiveSummary": {
    "overallVerdict": "strong_yes" | "yes" | "lean_yes" | "mixed" | "lean_no" | "no",
    "score": 1-10,
    "headline": "one concise assessment headline",
    "rationale": "clear 1-2 paragraph recommendation rationale",
    "confidence": "low" | "medium" | "high"
  },
  "summary": "4-6 paragraph detailed evaluation of the participant's responses, covering what they said, quality of evidence, strengths, gaps, and overall performance",
  "themes": ["theme1", "theme2", ...],
  "sentiment": {
    "overall": "positive" | "neutral" | "negative",
    "details": "detailed analysis of participant's engagement and attitude"
  },
  "scoreBreakdown": [
    { "name": "dimension name", "score": 1-10, "reasoning": "specific rationale", "evidence": ["supporting detail"] }
  ],
  "skillMap": [
    {
      "skill": "skill name",
      "level": 0-100,
      "employerDemand": "low" | "moderate" | "high" | "critical",
      "status": "strength" | "solid" | "gap" | "critical",
      "evidence": "specific evidence from answers, code, or missing response"
    }
  ],
  "keyInsights": ["specific insight with evidence or implication", ...],
  "strengths": ["specific strength with evidence", ...],
  "risks": ["specific risk, weakness, inconsistency, or missing evidence", ...],
  "followUpQuestions": ["recommended human follow-up question", ...],
  "roadmap": {
    "title": "personalized roadmap title",
    "summary": "short explanation of the highest-priority path to improvement",
    "items": [
      {
        "priority": 1,
        "title": "roadmap focus area",
        "diagnosis": "why this matters based on the assessment",
        "goal": "clear measurable target",
        "timeframe": "suggested duration and cadence",
        "practiceTask": "one concrete thing to do next"
      }
    ],
    "startHere": "single immediate action the participant should do now"
  },
  "notableQuotes": ["direct quote from participant 1", "direct quote 2"],
  "toneAnalysis": {
    "overall": "confident" | "neutral" | "hesitant",
    "details": "detailed overall communication style assessment",
    "segments": [
      { "question": "Q1 question text", "tone": "confident" | "enthusiastic" | "neutral" | "hesitant" | "uncertain", "confidence": "high" | "medium" | "low", "notes": "specific observations about speech patterns, filler words, directness" }
    ]
  }${questionEvalJsonField}${criteriaJsonField}${researchJsonField}
}`;

  const result: LLMMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // ── Attach whiteboard images as a multimodal user message ──────
  if (hasDrawings) {
    const drawingsWithImages = whiteboardDrawings.filter((d) => d.imageDataUrl);
    if (drawingsWithImages.length > 0) {
      const parts: LLMContentPart[] = [
        {
          type: "text",
          text: `Here are the whiteboard drawings created by the participant during the interview. Please analyze their visual content:\n${drawingsWithImages.map((d, i) => `Drawing ${i + 1}: "${d.label}"`).join("\n")}`,
        },
        ...drawingsWithImages.map(
          (d) =>
            ({
              type: "image_url",
              image_url: { url: d.imageDataUrl! },
            }) as LLMContentPart
        ),
      ];
      result.push({ role: "user", content: parts });
    }
  }

  return result;
}
