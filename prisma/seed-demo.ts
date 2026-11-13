/**
 * Creates demo data so the student flow can be tried without uploading anything.
 * Safe to re-run. Remove later by deleting the student "demo@example.com" and the test "Demo aptitude test".
 * Student login: email demo@example.com + roll number DEMO001 (or DOB 2005-01-15).
 */
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";

const db = new PrismaClient();

async function main() {
  const pepper = process.env.DOB_PEPPER;
  if (!pepper) throw new Error("DOB_PEPPER is not set");
  const dobHash = createHmac("sha256", pepper).update("dob:2005-01-15").digest("hex"); // same scheme as src/lib/crypto.ts

  const student = await db.student.upsert({
    where: { email: "demo@example.com" },
    update: { dobHash },
    create: { email: "demo@example.com", name: "Demo Student", rollNo: "DEMO001", dobHash, batch: "Demo" },
  });

  const existing = await db.test.findFirst({ where: { title: "Demo aptitude test" } });
  const test =
    existing ??
    (await db.test.create({
      data: { title: "Demo aptitude test", durationMin: 10, status: "PUBLISHED", totalMarks: 5, showAnswers: true },
    }));

  if (!existing) {
    const qs: [string, string[], number][] = [
      ["What is 12 x 12?", ["124", "144", "154", "164"], 1],
      ["Which number comes next: 2, 4, 8, 16, ?", ["24", "30", "32", "36"], 2],
      ["A train travels 60 km in 1.5 hours. Its speed is:", ["30 km/h", "40 km/h", "45 km/h", "50 km/h"], 1],
      ["Choose the odd one out.", ["Apple", "Mango", "Carrot", "Banana"], 2],
      ["If x + 7 = 19, then x =", ["10", "11", "12", "13"], 2],
    ];
    await db.question.createMany({
      data: qs.map(([text, options, correctOption], i) => ({ testId: test.id, text, options, correctOption, order: i + 1, marks: 1 })),
    });
  }
  // Re-running resets the demo student's attempt so the flow can be tried again.
  await db.attempt.deleteMany({ where: { studentId: student.id, testId: test.id } });
  await db.testAssignment.upsert({
    where: { testId_studentId: { testId: test.id, studentId: student.id } },
    update: {},
    create: { testId: test.id, studentId: student.id },
  });
  console.log("Demo ready. Student login: demo@example.com / roll number DEMO001");
}

main().finally(() => db.$disconnect());
