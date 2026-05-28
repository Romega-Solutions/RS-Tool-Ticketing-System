'use client';

import { useState, useTransition } from 'react';
import type { QuizQuestion } from '@/lib/lms-quiz';

type Props = {
  quizId:      number;
  passScore:   number;
  maxAttempts: number | null;
  attemptsUsed: number;
  questions:   QuizQuestion[];           // NO correctKeys — server-only
  alreadyPassed: boolean;
  onSubmit:    (quizId: number, answers: Record<string, string[]>) => Promise<{
    score:        number;
    passed:       boolean;
    correctCount: number;
    totalCount:   number;
  }>;
};

export function QuizRunner(props: Props) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean; correctCount: number; totalCount: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const attemptsExhausted =
    !!props.maxAttempts && props.attemptsUsed >= props.maxAttempts;

  function toggle(qid: number, key: string, type: 'multiple_choice' | 'true_false') {
    setAnswers(prev => {
      const cur = prev[String(qid)] ?? [];
      if (type === 'true_false') {
        return { ...prev, [String(qid)]: [key] };
      }
      // multiple_choice: allow multi-select (correctKeys may be multiple)
      const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
      return { ...prev, [String(qid)]: next };
    });
  }

  function submit() {
    setErr(null);
    startTransition(async () => {
      try {
        const r = await props.onSubmit(props.quizId, answers);
        setResult(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Submit failed.');
      }
    });
  }

  function retry() {
    setAnswers({});
    setResult(null);
  }

  if (props.alreadyPassed) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        ✓ You passed this quiz. Lesson auto-marked complete.
      </div>
    );
  }

  if (result?.passed) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="font-semibold text-green-800">Passed — {result.score}%.</p>
        <p className="mt-1 text-sm text-green-700">
          {result.correctCount} of {result.totalCount} correct. Lesson marked complete.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-(--rs-neutral-grey-200) bg-white p-5">
      <header>
        <h3 className="font-serif text-base font-semibold text-(--rs-neutral-grey-900)">
          Quiz
        </h3>
        <p className="mt-1 text-xs text-(--rs-neutral-grey-500)">
          Pass score: {props.passScore}%. Attempts used: {props.attemptsUsed}
          {props.maxAttempts ? ` of ${props.maxAttempts}` : ' (unlimited)'}.
        </p>
      </header>

      {props.questions.map((q, idx) => (
        <div key={q.id} className="space-y-2">
          <p className="text-sm font-medium text-(--rs-neutral-grey-900)">
            {idx + 1}. {q.prompt}
          </p>
          <div className="space-y-1.5">
            {q.choices.map(c => {
              const chosen = (answers[String(q.id)] ?? []).includes(c.key);
              const inputType = q.questionType === 'true_false' ? 'radio' : 'checkbox';
              return (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input
                    type={inputType}
                    name={`q-${q.id}`}
                    checked={chosen}
                    onChange={() => toggle(q.id, c.key, q.questionType)}
                  />
                  <span>{c.text}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {result && !result.passed && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Not yet — {result.score}% ({result.correctCount}/{result.totalCount}). Try again.
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-(--rs-neutral-grey-100) pt-4">
        {result && !result.passed && !attemptsExhausted ? (
          <button type="button" onClick={retry}
            className="rounded-md bg-(--rs-primary-500) text-white text-sm font-semibold px-3 py-2 hover:bg-(--rs-primary-600)">
            Try again
          </button>
        ) : !result && (
          <button type="button" onClick={submit} disabled={pending || attemptsExhausted}
            className="rounded-md bg-(--rs-primary-500) text-white text-sm font-semibold px-3 py-2 hover:bg-(--rs-primary-600) disabled:opacity-50">
            {pending ? 'Submitting…' : 'Submit answers'}
          </button>
        )}
        {attemptsExhausted && (
          <p className="text-sm text-red-700">You&apos;ve used all attempts on this quiz.</p>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}
