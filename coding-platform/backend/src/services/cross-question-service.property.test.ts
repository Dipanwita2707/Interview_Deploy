import * as fc from 'fast-check';
import { CrossQuestionService } from './cross-question-service';
import { query } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { ParsedCvData } from './cv-parser';

/**
 * Property-Based Tests for Cross-Question Service
 * Feature: student-interview-dashboard
 */

// Mock database connection
jest.mock('../database/connection', () => ({
  query: jest.fn(),
  getClient: jest.fn()
}));

// Mock axios
jest.mock('axios');

describe('Cross-Question Service - Property-Based Tests', () => {
  let crossQuestionService: CrossQuestionService;
  const mockQuery = query as jest.MockedFunction<typeof query>;
  const mockAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    crossQuestionService = new CrossQuestionService();
    jest.clearAllMocks();
  });

  /**
   * Property 9: Cross-Question Generation with CV
   * **Validates: Requirements 5.1**
   * 
   * For any interview with both role and CV data provided, the Question_Generator 
   * should generate questions that reference content from both sources.
   */
  describe('Feature: student-interview-dashboard, Property 9: Cross-Question Generation with CV', () => {
    it('should generate questions from both role and CV when both are provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // attemptId
          fc.string({ minLength: 5, maxLength: 50 }), // role
          fc.string({ minLength: 3, maxLength: 30 }), // company
          fc.array(fc.string({ minLength: 2, maxLength: 20 }), { minLength: 1, maxLength: 10 }), // skills
          async (attemptId: string, role: string, company: string, skills: string[]) => {
            const cvData: ParsedCvData = {
              skills,
              experience: [],
              education: [],
              projects: [],
              rawText: ''
            };

            // Mock database query for CV ID
            mockQuery.mockResolvedValueOnce({
              rows: [{ cv_id: uuidv4() }],
              rowCount: 1,
              command: 'SELECT',
              oid: 0,
              fields: []
            });

            // Mock AI response with questions from both sources
            const mockQuestions = [
              {
                question_text: `Tell me about your experience with ${skills[0]}`,
                expected_answer: 'Answer based on CV',
                generated_from: 'cv',
                metadata: { source: 'cv_skills' }
              },
              {
                question_text: `How would you approach ${role} responsibilities?`,
                expected_answer: 'Answer based on role',
                generated_from: 'role',
                metadata: { source: 'role_description' }
              },
              {
                question_text: `Combine your ${skills[0]} skills with ${role} duties`,
                expected_answer: 'Answer combining both',
                generated_from: 'both',
                metadata: { source: 'role_and_cv' }
              },
              {
                question_text: 'Additional question',
                expected_answer: 'Additional answer',
                generated_from: 'both',
                metadata: {}
              }
            ];

            mockAxios.post.mockResolvedValueOnce({
              data: { questions: mockQuestions },
              status: 200,
              statusText: 'OK',
              headers: {},
              config: {} as any
            });

            // Mock database query for question_bank
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 0,
              command: 'SELECT',
              oid: 0,
              fields: []
            });

            // Mock database inserts
            for (const q of mockQuestions) {
              mockQuery.mockResolvedValueOnce({
                rows: [{
                  id: uuidv4(),
                  exam_attempt_id: attemptId,
                  cv_id: uuidv4(),
                  question_text: q.question_text,
                  expected_answer: q.expected_answer,
                  student_answer: null,
                  generated_from: q.generated_from,
                  generation_metadata: q.metadata,
                  answered_at: null,
                  created_at: new Date(),
                  updated_at: new Date()
                }],
                rowCount: 1,
                command: 'INSERT',
                oid: 0,
                fields: []
              });
            }

            // Mock update query
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 1,
              command: 'UPDATE',
              oid: 0,
              fields: []
            });

            const questions = await crossQuestionService.generateQuestions({
              attemptId,
              role,
              company,
              cvData
            });

            // Property: At least one question should be from CV or both
            const hasCvBasedQuestion = questions.some(
              q => q.generatedFrom === 'cv' || q.generatedFrom === 'both'
            );
            expect(hasCvBasedQuestion).toBe(true);

            // Property: At least one question should be from role or both
            const hasRoleBasedQuestion = questions.some(
              q => q.generatedFrom === 'role' || q.generatedFrom === 'both'
            );
            expect(hasRoleBasedQuestion).toBe(true);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 10: Cross-Question Count Constraint
   * **Validates: Requirements 5.2**
   * 
   * For any question generation request, the Question_Generator should return 
   * between 3 and 5 questions (inclusive).
   */
  describe('Feature: student-interview-dashboard, Property 10: Cross-Question Count Constraint', () => {
    it('should always generate between 3 and 5 questions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // attemptId
          fc.string({ minLength: 5, maxLength: 50 }), // role
          fc.option(fc.string({ minLength: 3, maxLength: 30 }), { nil: null }), // company
          fc.integer({ min: 3, max: 5 }), // questionCount
          async (attemptId: string, role: string, company: string | null, questionCount: number) => {
            // Mock database query for CV ID
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 0,
              command: 'SELECT',
              oid: 0,
              fields: []
            });

            // Mock AI response with specified number of questions
            const mockQuestions = Array.from({ length: questionCount }, (_, i) => ({
              question_text: `Question ${i + 1} for ${role}`,
              expected_answer: `Answer ${i + 1}`,
              generated_from: 'role' as const,
              metadata: { index: i }
            }));

            mockAxios.post.mockResolvedValueOnce({
              data: { questions: mockQuestions },
              status: 200,
              statusText: 'OK',
              headers: {},
              config: {} as any
            });

            // Mock database query for question_bank
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 0,
              command: 'SELECT',
              oid: 0,
              fields: []
            });

            // Mock database inserts
            for (const q of mockQuestions) {
              mockQuery.mockResolvedValueOnce({
                rows: [{
                  id: uuidv4(),
                  exam_attempt_id: attemptId,
                  cv_id: null,
                  question_text: q.question_text,
                  expected_answer: q.expected_answer,
                  student_answer: null,
                  generated_from: q.generated_from,
                  generation_metadata: q.metadata,
                  answered_at: null,
                  created_at: new Date(),
                  updated_at: new Date()
                }],
                rowCount: 1,
                command: 'INSERT',
                oid: 0,
                fields: []
              });
            }

            // Mock update query
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 1,
              command: 'UPDATE',
              oid: 0,
              fields: []
            });

            const questions = await crossQuestionService.generateQuestions({
              attemptId,
              role,
              company,
              cvData: null
            });

            // Property: Question count must be between 3 and 5
            expect(questions.length).toBeGreaterThanOrEqual(3);
            expect(questions.length).toBeLessThanOrEqual(5);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 11: Cross-Question Fallback
   * **Validates: Requirements 5.4**
   * 
   * For any interview with role but no CV data, the Question_Generator should 
   * still generate questions based solely on the role.
   */
  describe('Feature: student-interview-dashboard, Property 11: Cross-Question Fallback', () => {
    it('should generate role-based questions when CV data is not provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // attemptId
          fc.string({ minLength: 5, maxLength: 50 }), // role
          fc.option(fc.string({ minLength: 3, maxLength: 30 }), { nil: null }), // company
          async (attemptId: string, role: string, company: string | null) => {
            // Mock database query for CV ID (no CV)
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 0,
              command: 'SELECT',
              oid: 0,
              fields: []
            });

            // Mock AI response with role-only questions
            const mockQuestions = [
              {
                question_text: `What are the key responsibilities of a ${role}?`,
                expected_answer: 'Answer about role responsibilities',
                generated_from: 'role',
                metadata: { source: 'role_only' }
              },
              {
                question_text: `Describe your approach to ${role} challenges`,
                expected_answer: 'Answer about approach',
                generated_from: 'role',
                metadata: { source: 'role_only' }
              },
              {
                question_text: `What skills are essential for ${role}?`,
                expected_answer: 'Answer about skills',
                generated_from: 'role',
                metadata: { source: 'role_only' }
              },
              {
                question_text: `How do you prioritize tasks as a ${role}?`,
                expected_answer: 'Answer about prioritization',
                generated_from: 'role',
                metadata: { source: 'role_only' }
              }
            ];

            mockAxios.post.mockResolvedValueOnce({
              data: { questions: mockQuestions },
              status: 200,
              statusText: 'OK',
              headers: {},
              config: {} as any
            });

            // Mock database query for question_bank
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 0,
              command: 'SELECT',
              oid: 0,
              fields: []
            });

            // Mock database inserts
            for (const q of mockQuestions) {
              mockQuery.mockResolvedValueOnce({
                rows: [{
                  id: uuidv4(),
                  exam_attempt_id: attemptId,
                  cv_id: null,
                  question_text: q.question_text,
                  expected_answer: q.expected_answer,
                  student_answer: null,
                  generated_from: q.generated_from,
                  generation_metadata: q.metadata,
                  answered_at: null,
                  created_at: new Date(),
                  updated_at: new Date()
                }],
                rowCount: 1,
                command: 'INSERT',
                oid: 0,
                fields: []
              });
            }

            // Mock update query
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 1,
              command: 'UPDATE',
              oid: 0,
              fields: []
            });

            const questions = await crossQuestionService.generateQuestions({
              attemptId,
              role,
              company,
              cvData: null
            });

            // Property: Should generate questions even without CV
            expect(questions.length).toBeGreaterThanOrEqual(3);
            expect(questions.length).toBeLessThanOrEqual(5);

            // Property: All questions should be role-based (not CV-based)
            const allRoleBased = questions.every(
              q => q.generatedFrom === 'role'
            );
            expect(allRoleBased).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 12: Cross-Question Uniqueness
   * **Validates: Requirements 5.5**
   * 
   * For any generated cross-questions, none should match existing questions in 
   * the question_bank table (based on text similarity threshold of 90%).
   */
  describe('Feature: student-interview-dashboard, Property 12: Cross-Question Uniqueness', () => {
    it('should filter out questions too similar to existing question bank', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // attemptId
          fc.string({ minLength: 5, maxLength: 50 }), // role
          fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 5 }), // existing questions
          async (attemptId: string, role: string, existingQuestions: string[]) => {
            // Mock database query for CV ID
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 0,
              command: 'SELECT',
              oid: 0,
              fields: []
            });

            // Mock AI response with some questions similar to existing ones
            const mockQuestions = [
              {
                question_text: 'Completely unique question about the role',
                expected_answer: 'Unique answer',
                generated_from: 'role',
                metadata: {}
              },
              {
                question_text: 'Another unique question',
                expected_answer: 'Another answer',
                generated_from: 'role',
                metadata: {}
              },
              {
                question_text: 'Yet another unique question',
                expected_answer: 'Yet another answer',
                generated_from: 'role',
                metadata: {}
              },
              {
                question_text: 'One more unique question',
                expected_answer: 'One more answer',
                generated_from: 'role',
                metadata: {}
              }
            ];

            mockAxios.post.mockResolvedValueOnce({
              data: { questions: mockQuestions },
              status: 200,
              statusText: 'OK',
              headers: {},
              config: {} as any
            });

            // Mock database query for question_bank with existing questions
            mockQuery.mockResolvedValueOnce({
              rows: existingQuestions.map(q => ({ title: q })),
              rowCount: existingQuestions.length,
              command: 'SELECT',
              oid: 0,
              fields: []
            });

            // Mock database inserts (only for unique questions)
            for (const q of mockQuestions) {
              mockQuery.mockResolvedValueOnce({
                rows: [{
                  id: uuidv4(),
                  exam_attempt_id: attemptId,
                  cv_id: null,
                  question_text: q.question_text,
                  expected_answer: q.expected_answer,
                  student_answer: null,
                  generated_from: q.generated_from,
                  generation_metadata: q.metadata,
                  answered_at: null,
                  created_at: new Date(),
                  updated_at: new Date()
                }],
                rowCount: 1,
                command: 'INSERT',
                oid: 0,
                fields: []
              });
            }

            // Mock update query
            mockQuery.mockResolvedValueOnce({
              rows: [],
              rowCount: 1,
              command: 'UPDATE',
              oid: 0,
              fields: []
            });

            const questions = await crossQuestionService.generateQuestions({
              attemptId,
              role,
              company: null,
              cvData: null
            });

            // Property: All generated questions should be unique
            const questionTexts = questions.map(q => q.questionText.toLowerCase());
            const uniqueTexts = new Set(questionTexts);
            expect(questionTexts.length).toBe(uniqueTexts.size);

            // Property: No question should be too similar to existing questions
            for (const question of questions) {
              for (const existing of existingQuestions) {
                const similarity = calculateSimilarity(
                  question.questionText.toLowerCase(),
                  existing.toLowerCase()
                );
                expect(similarity).toBeLessThan(0.9);
              }
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});

/**
 * Helper function to calculate text similarity
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {
    return 1.0;
  }

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
