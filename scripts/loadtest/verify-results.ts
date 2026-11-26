/**
 * Checks the DATA after a k6 run: every load-test student has a SUBMITTED attempt, every saved answer is the
 * one scripts/loadtest/k6-exam.js sends, and stored scores and per-answer results match a fresh scoring.
 * Run against the STAGING database used by the load test (read-only).
 * Usage: npm run loadtest:verify -- <testId> [count=1000]
 */
import { PrismaClient } from "@prisma/client";
import { scoreAttempt } from "../../src/lib/scoring";

const db = new PrismaClient();

// Must match expectedOption() in k6-exam.js.
const expectedOption = (student: number, questionIndex: number, optionCount: number) => (student + questionIndex) % optionCount;

async function main() {
  const [testId, countArg] = process.argv.slice(2);
  const count = Number(countArg ?? 1000);
  if (!testId || !Number.isInteger(count) || count < 1) throw new Error("Usage: npm run loadtest:verify -- <testId> [count]");
  try {
    console.log(`Database host: ${new URL(process.env.DATABASE_URL ?? "").host}`);
  } catch {
    /* host is only informational */
  }

  const test = await db.test.findUnique({ where: { id: testId }, select: { negativeMarking: true } });
  if (!test) throw new Error("Test not found");
  // Same order as the start route, so indexes match what k6 received.
  const questions = await db.question.findMany({
    where: { testId },
    orderBy: { order: "asc" },
    select: { id: true, options: true, correctOption: true, marks: true },
  });
  const byId = new Map(questions.map((q, index) => [q.id, { index, options: Array.isArray(q.options) ? q.options.length : 0 }]));

  const attempts = await db.attempt.findMany({
    where: { testId, student: { batch: "LOADTEST" } },
    select: {
      status: true,
      score: true,
      student: { select: { rollNo: true } },
      answers: { select: { questionId: true, selectedOption: true, isCorrect: true } },
    },
  });

  const problems: string[] = [];
  const seen = new Set<number>();
  let answerCount = 0;
  for (const a of attempts) {
    const n = Number(a.student.rollNo?.replace("LOAD", ""));
    if (n < 1 || n > count) continue;
    seen.add(n);
    const who = a.student.rollNo;
    if (a.status !== "SUBMITTED") problems.push(`${who}: status ${a.status}`);
    if (a.answers.length === 0) problems.push(`${who}: no saved answers`);
    answerCount += a.answers.length;

    const result = scoreAttempt(questions, new Map(a.answers.map((x) => [x.questionId, x.selectedOption])), test.negativeMarking);
    for (const x of a.answers) {
      const q = byId.get(x.questionId);
      if (!q || x.selectedOption !== expectedOption(n, q.index, q.options)) problems.push(`${who}: wrong saved answer for ${x.questionId}`);
      if (x.isCorrect !== result.outcomes.get(x.questionId)) problems.push(`${who}: wrong isCorrect for ${x.questionId}`);
    }
    if (a.score !== Math.round(result.score)) problems.push(`${who}: stored score ${a.score}, expected ${Math.round(result.score)}`);
  }
  if (seen.size !== count) problems.push(`expected ${count} attempts, found ${seen.size}`);

  console.log(`Checked ${seen.size} attempts and ${answerCount} saved answers.`);
  if (problems.length) {
    console.error(`FAILED: ${problems.length} problem(s). First 20:\n${problems.slice(0, 20).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("PASSED: all attempts submitted, saved answers and scores are correct.");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
