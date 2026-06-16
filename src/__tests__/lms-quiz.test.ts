import { describe, it, expect } from 'vitest';
import { gradeQuiz, formatCertificateSerial, computeQuizGate, type QuizQuestionWithAnswers } from '@/lib/lms-quiz';

function mcQuestion(id: number, correctKeys: string[]): QuizQuestionWithAnswers {
  return {
    id,
    prompt: `Q${id}`,
    questionType: 'multiple_choice',
    choices: [
      { key: 'a', text: 'A' }, { key: 'b', text: 'B' },
      { key: 'c', text: 'C' }, { key: 'd', text: 'D' },
    ],
    correctKeys,
    multiSelect: correctKeys.length > 1,
  };
}

function tfQuestion(id: number, correctKey: 'true' | 'false'): QuizQuestionWithAnswers {
  return {
    id,
    prompt: `TF${id}`,
    questionType: 'true_false',
    choices: [{ key: 'true', text: 'True' }, { key: 'false', text: 'False' }],
    correctKeys: [correctKey],
    multiSelect: false,
  };
}

describe('gradeQuiz — single-answer MC', () => {
  const questions = [mcQuestion(1, ['a']), mcQuestion(2, ['b']), mcQuestion(3, ['c'])];

  it('100% when every question is correct', () => {
    const r = gradeQuiz({ questions, answers: { '1': ['a'], '2': ['b'], '3': ['c'] }, passScore: 70 });
    expect(r).toEqual({ score: 100, passed: true, correctCount: 3, totalCount: 3 });
  });

  it('partial — 2/3 = 67%, fails at passScore=70', () => {
    const r = gradeQuiz({ questions, answers: { '1': ['a'], '2': ['b'], '3': ['d'] }, passScore: 70 });
    expect(r.correctCount).toBe(2);
    expect(r.score).toBe(67);
    expect(r.passed).toBe(false);
  });

  it('passes at passScore=60 with 2/3', () => {
    const r = gradeQuiz({ questions, answers: { '1': ['a'], '2': ['b'], '3': ['d'] }, passScore: 60 });
    expect(r.passed).toBe(true);
  });

  it('counts a missing answer as wrong (no exception)', () => {
    const r = gradeQuiz({ questions, answers: { '1': ['a'] }, passScore: 50 });
    expect(r.correctCount).toBe(1);
  });
});

describe('gradeQuiz — multi-answer MC', () => {
  const q = mcQuestion(1, ['a', 'c']);

  it('correct when chosen keys match the full set (any order)', () => {
    expect(gradeQuiz({ questions: [q], answers: { '1': ['c', 'a'] }, passScore: 50 }).correctCount).toBe(1);
    expect(gradeQuiz({ questions: [q], answers: { '1': ['a', 'c'] }, passScore: 50 }).correctCount).toBe(1);
  });

  it('wrong when missing one of the correct keys', () => {
    expect(gradeQuiz({ questions: [q], answers: { '1': ['a'] }, passScore: 50 }).correctCount).toBe(0);
  });

  it('wrong when including an extra wrong key', () => {
    expect(gradeQuiz({ questions: [q], answers: { '1': ['a', 'c', 'b'] }, passScore: 50 }).correctCount).toBe(0);
  });
});

describe('gradeQuiz — true/false', () => {
  it('matches the single chosen key', () => {
    const r = gradeQuiz({
      questions: [tfQuestion(1, 'true'), tfQuestion(2, 'false')],
      answers:   { '1': ['true'], '2': ['false'] },
      passScore: 70,
    });
    expect(r).toEqual({ score: 100, passed: true, correctCount: 2, totalCount: 2 });
  });

  it('wrong when the opposite is chosen', () => {
    const r = gradeQuiz({
      questions: [tfQuestion(1, 'true')],
      answers:   { '1': ['false'] },
      passScore: 50,
    });
    expect(r.correctCount).toBe(0);
    expect(r.passed).toBe(false);
  });
});

describe('gradeQuiz — edge cases', () => {
  it('empty quiz returns 0/0 and fails', () => {
    const r = gradeQuiz({ questions: [], answers: {}, passScore: 0 });
    expect(r).toEqual({ score: 0, passed: false, correctCount: 0, totalCount: 0 });
  });

  it('passes exactly at threshold', () => {
    const r = gradeQuiz({
      questions: [mcQuestion(1, ['a']), mcQuestion(2, ['b'])],
      answers:   { '1': ['a'], '2': ['z'] },
      passScore: 50,
    });
    expect(r.score).toBe(50);
    expect(r.passed).toBe(true);
  });
});

describe('computeQuizGate — sequential progression', () => {
  const preceding = [
    { id: 1, title: 'Welcome' },
    { id: 2, title: 'Policy doc' },
    { id: 3, title: 'Safety video' },
  ];

  it('unlocked when there are no preceding lessons (quiz is first)', () => {
    const g = computeQuizGate({ precedingLessons: [], completedLessonIds: [] });
    expect(g).toEqual({ locked: false, remaining: [], nextLessonId: null });
  });

  it('unlocked when every preceding lesson is complete', () => {
    const g = computeQuizGate({ precedingLessons: preceding, completedLessonIds: [1, 2, 3] });
    expect(g.locked).toBe(false);
    expect(g.remaining).toEqual([]);
    expect(g.nextLessonId).toBeNull();
  });

  it('locked when nothing is complete — remaining is the full ordered list', () => {
    const g = computeQuizGate({ precedingLessons: preceding, completedLessonIds: [] });
    expect(g.locked).toBe(true);
    expect(g.remaining.map(l => l.id)).toEqual([1, 2, 3]);
    expect(g.nextLessonId).toBe(1);
  });

  it('locked when partially complete — nextLessonId is the first gap (order preserved)', () => {
    const g = computeQuizGate({ precedingLessons: preceding, completedLessonIds: [1, 3] });
    expect(g.locked).toBe(true);
    expect(g.remaining.map(l => l.id)).toEqual([2]);
    expect(g.nextLessonId).toBe(2);
  });

  it('ignores completions for unrelated lessons', () => {
    const g = computeQuizGate({ precedingLessons: preceding, completedLessonIds: [99, 100] });
    expect(g.locked).toBe(true);
    expect(g.remaining.map(l => l.id)).toEqual([1, 2, 3]);
  });
});

describe('formatCertificateSerial', () => {
  it('zero-pads the sequence to 6 digits', () => {
    expect(formatCertificateSerial(2026, 1)).toBe('RS-LMS-2026-000001');
    expect(formatCertificateSerial(2026, 123)).toBe('RS-LMS-2026-000123');
    expect(formatCertificateSerial(2026, 999999)).toBe('RS-LMS-2026-999999');
  });

  it('does not truncate sequences longer than 6 digits', () => {
    expect(formatCertificateSerial(2026, 1234567)).toBe('RS-LMS-2026-1234567');
  });
});
