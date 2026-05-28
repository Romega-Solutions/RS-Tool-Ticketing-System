// Pure helpers shared by the quiz UI and the server-side grading action.
// Keeping these out of /lib/lms.ts so the bundle for the quiz routes stays
// small and easy to test in isolation.

export type QuestionType = 'multiple_choice' | 'true_false';

export type QuizChoice = { key: string; text: string };

export type QuizQuestion = {
  id:            number;
  prompt:        string;
  questionType:  QuestionType;
  choices:       QuizChoice[];
  // correctKeys is server-only; the client never receives it.
};

export type QuizQuestionWithAnswers = QuizQuestion & {
  correctKeys: string[];
};

// Grade an attempt server-side. All-or-nothing per question: a question is
// worth 1 point only if the chosen keys exactly equal the correct keys.
export function gradeQuiz(args: {
  questions: QuizQuestionWithAnswers[];
  answers:   Record<string, string[]>;   // questionId → chosen keys
  passScore: number;                     // 0–100
}): { score: number; passed: boolean; correctCount: number; totalCount: number } {
  const total = args.questions.length;
  if (total === 0) {
    return { score: 0, passed: false, correctCount: 0, totalCount: 0 };
  }

  let correct = 0;
  for (const q of args.questions) {
    const chosen = (args.answers[String(q.id)] ?? []).slice().sort();
    const expected = q.correctKeys.slice().sort();
    if (chosen.length === expected.length && chosen.every((k, i) => k === expected[i])) {
      correct += 1;
    }
  }
  const score = Math.round((correct / total) * 100);
  return {
    score,
    passed:       score >= args.passScore,
    correctCount: correct,
    totalCount:   total,
  };
}

// `RS-LMS-2026-000123` style serial — pad sequence to 6 digits.
export function formatCertificateSerial(year: number, sequence: number): string {
  return `RS-LMS-${year}-${String(sequence).padStart(6, '0')}`;
}
