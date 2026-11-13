import { db } from "./db";

export const PASS_PERCENT = 40;

export interface ResultRow {
  rank: number;
  attemptId: string;
  studentId: string;
  name: string;
  email: string;
  rollNo: string | null;
  batch: string | null;
  score: number;
  totalMarks: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  status: "SUBMITTED" | "EXPIRED";
  submittedAt: string | null;
  timeTakenSec: number | null;
}

export interface PersonRow {
  studentId: string;
  name: string;
  email: string;
  rollNo: string | null;
  batch: string | null;
  attemptId?: string;
}

export interface QuestionStat {
  order: number;
  text: string;
  correctPct: number;
  wrongPct: number;
  skippedPct: number;
}

export interface TestResults {
  test: { id: string; title: string; status: string; totalMarks: number; questionCount: number; holdResults: boolean; resultsReleasedAt: string | null };
  rows: ResultRow[];
  notStarted: PersonRow[];
  inProgress: PersonRow[];
  stats: { attempts: number; average: number; median: number; highest: number; lowest: number; passRate: number; passPercent: number } | null;
  distribution: number[]; // 10 buckets of 10 percentage points
  questionStats: QuestionStat[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Loads everything the results screen and the CSV export need, with competition ranking by score. */
export async function loadTestResults(testId: string): Promise<TestResults | null> {
  const test = await db.test.findUnique({
    where: { id: testId },
    include: { questions: { orderBy: { order: "asc" }, select: { id: true, text: true, marks: true, order: true } } },
  });
  if (!test) return null;

  const totalMarks = test.questions.reduce((s, q) => s + q.marks, 0);
  const qCount = test.questions.length;

  const [attempts, assignments, counts, perQuestion] = await Promise.all([
    db.attempt.findMany({
      where: { testId },
      include: { student: { select: { id: true, name: true, email: true, rollNo: true, batch: true } } },
    }),
    db.testAssignment.findMany({ where: { testId }, include: { student: { select: { id: true, name: true, email: true, rollNo: true, batch: true } } } }),
    db.answer.groupBy({ by: ["attemptId", "isCorrect"], where: { attempt: { testId } }, _count: { _all: true } }),
    db.answer.groupBy({ by: ["questionId", "isCorrect"], where: { attempt: { testId, status: { not: "IN_PROGRESS" } } }, _count: { _all: true } }),
  ]);

  const tally = new Map<string, { correct: number; wrong: number }>();
  for (const c of counts) {
    const t = tally.get(c.attemptId) ?? { correct: 0, wrong: 0 };
    if (c.isCorrect === true) t.correct += c._count._all;
    else if (c.isCorrect === false) t.wrong += c._count._all;
    tally.set(c.attemptId, t);
  }

  const finished = attempts.filter((a) => a.status !== "IN_PROGRESS");
  const unsorted = finished.map((a) => {
    const t = tally.get(a.id) ?? { correct: 0, wrong: 0 };
    const score = a.score ?? 0;
    return {
      attemptId: a.id,
      studentId: a.student.id,
      name: a.student.name,
      email: a.student.email,
      rollNo: a.student.rollNo,
      batch: a.student.batch,
      score,
      totalMarks,
      percentage: totalMarks > 0 ? round1((score / totalMarks) * 100) : 0,
      correct: t.correct,
      wrong: t.wrong,
      skipped: Math.max(0, qCount - t.correct - t.wrong),
      status: a.status as "SUBMITTED" | "EXPIRED",
      submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
      timeTakenSec: a.submittedAt ? Math.max(0, Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000)) : null,
    };
  });
  // Higher score first; on equal scores the faster finisher is listed first.
  unsorted.sort((x, y) => y.score - x.score || (x.timeTakenSec ?? Infinity) - (y.timeTakenSec ?? Infinity) || x.name.localeCompare(y.name));
  // Equal scores share a rank (1, 2, 2, 4).
  const rows: ResultRow[] = unsorted.map((r, i) => ({ ...r, rank: i > 0 && unsorted[i - 1].score === r.score ? 0 : i + 1 }));
  for (let i = 0; i < rows.length; i++) if (rows[i].rank === 0) rows[i].rank = rows[i - 1].rank;

  const attemptedIds = new Set(attempts.map((a) => a.studentId));
  const notStarted: PersonRow[] = assignments.filter((a) => !attemptedIds.has(a.studentId)).map((a) => ({ studentId: a.student.id, name: a.student.name, email: a.student.email, rollNo: a.student.rollNo, batch: a.student.batch }));
  const inProgress: PersonRow[] = attempts.filter((a) => a.status === "IN_PROGRESS").map((a) => ({ studentId: a.student.id, name: a.student.name, email: a.student.email, rollNo: a.student.rollNo, batch: a.student.batch, attemptId: a.id }));

  let stats: TestResults["stats"] = null;
  const distribution = Array<number>(10).fill(0);
  if (rows.length) {
    const scores = rows.map((r) => r.score).sort((a, b) => a - b);
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;
    const passed = rows.filter((r) => r.percentage >= PASS_PERCENT).length;
    stats = {
      attempts: rows.length,
      average: round1(scores.reduce((s, n) => s + n, 0) / scores.length),
      median: round1(median),
      highest: scores[scores.length - 1],
      lowest: scores[0],
      passRate: round1((passed / rows.length) * 100),
      passPercent: PASS_PERCENT,
    };
    for (const r of rows) distribution[Math.min(9, Math.floor(r.percentage / 10))]++;
  }

  const byQ = new Map<string, { correct: number; wrong: number }>();
  for (const c of perQuestion) {
    const t = byQ.get(c.questionId) ?? { correct: 0, wrong: 0 };
    if (c.isCorrect === true) t.correct += c._count._all;
    else if (c.isCorrect === false) t.wrong += c._count._all;
    byQ.set(c.questionId, t);
  }
  const n = finished.length;
  const questionStats: QuestionStat[] = test.questions.map((q) => {
    const t = byQ.get(q.id) ?? { correct: 0, wrong: 0 };
    const pct = (v: number) => (n > 0 ? round1((v / n) * 100) : 0);
    return { order: q.order, text: q.text.length > 140 ? `${q.text.slice(0, 140)}...` : q.text, correctPct: pct(t.correct), wrongPct: pct(t.wrong), skippedPct: n > 0 ? round1(100 - pct(t.correct) - pct(t.wrong)) : 0 };
  });

  return {
    test: { id: test.id, title: test.title, status: test.status, totalMarks, questionCount: qCount, holdResults: test.holdResults, resultsReleasedAt: test.resultsReleasedAt ? test.resultsReleasedAt.toISOString() : null },
    rows,
    notStarted,
    inProgress,
    stats,
    distribution,
    questionStats,
  };
}
