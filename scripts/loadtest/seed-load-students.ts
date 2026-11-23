/**
 * Creates N throwaway students (load0001@example.test ... roll LOAD0001 ...) and assigns them to a test,
 * for load testing. Run against a COPY / staging database, not your real student data.
 * Usage: ALLOW_LOADTEST_SEED=yes npm run loadtest:seed -- <testId> [count=1000]
 * Remove afterwards:  npm run loadtest:seed -- --clean
 */
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";

const db = new PrismaClient();
const pad = (n: number) => String(n).padStart(4, "0");

async function main() {
  // Safety: this writes thousands of fake students. Refuse unless explicitly allowed for this database.
  if (process.env.ALLOW_LOADTEST_SEED !== "yes") {
    throw new Error("Refusing to run. Point DATABASE_URL at a STAGING database, then set ALLOW_LOADTEST_SEED=yes.");
  }
  try {
    console.log(`Database host: ${new URL(process.env.DATABASE_URL ?? "").host}`);
  } catch {
    /* host is only informational */
  }
  const [a, b] = process.argv.slice(2);
  if (a === "--clean") {
    const r = await db.student.deleteMany({ where: { email: { endsWith: "@example.test" }, batch: "LOADTEST" } });
    console.log(`Removed ${r.count} load-test students.`);
    return;
  }
  const testId = a;
  const count = Number(b ?? 1000);
  if (!testId) throw new Error("Usage: npm run loadtest:seed -- <testId> [count]");
  const pepper = process.env.DOB_PEPPER;
  if (!pepper) throw new Error("DOB_PEPPER is not set");
  const dobHash = createHmac("sha256", pepper).update("dob:2005-01-15").digest("hex");
  const test = await db.test.findUnique({ where: { id: testId }, select: { id: true } });
  if (!test) throw new Error("Test not found");

  await db.student.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      email: `load${pad(i + 1)}@example.test`,
      name: `Load Student ${pad(i + 1)}`,
      rollNo: `LOAD${pad(i + 1)}`,
      dobHash,
      batch: "LOADTEST",
    })),
    skipDuplicates: true,
  });
  const students = await db.student.findMany({ where: { batch: "LOADTEST" }, select: { id: true } });
  await db.testAssignment.createMany({ data: students.map((s) => ({ testId, studentId: s.id })), skipDuplicates: true });
  console.log(`Ready: ${students.length} load-test students assigned to test ${testId}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
