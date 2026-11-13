import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, assertSameOrigin, handleError, requireAdmin } from "@/lib/auth";
import { parseJson, parseParam } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { planAnswerKey } from "@/lib/answer-key";
import { MAX_UPLOAD_BYTES, UploadError, validateUpload } from "@/lib/upload/validate";
import { extractText } from "@/lib/parsers/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const idSchema = z.string().min(1).max(40);
const applySchema = z.strictObject({
  entries: z.array(z.strictObject({ n: z.number().int().min(1).max(500), option: z.number().int().min(0).max(5) })).min(1).max(500),
});

async function loadDraft(testId: string) {
  const test = await db.test.findUnique({
    where: { id: testId },
    select: { status: true, questions: { orderBy: { order: "asc" }, select: { id: true, options: true, correctOption: true } } },
  });
  if (!test) throw new HttpError(404, "Test not found");
  if (test.status !== "DRAFT") throw new HttpError(409, "Test is published; answer keys are locked");
  return test;
}

/** Applies a parsed answer key. Question number N means the Nth question in the order the admin sees. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const testId = parseParam(idSchema, params.id);
    const { entries } = await parseJson(req, applySchema);
    const test = await loadDraft(testId);

    const plan = planAnswerKey(entries, test.questions.map((q) => ({ options: q.options as unknown[], correctOption: q.correctOption })));
    if (plan.assign.length > 0) {
      await db.$transaction(plan.assign.map((a) => db.question.update({ where: { id: test.questions[a.n - 1].id }, data: { correctOption: a.option } })));
    }
    await audit(`admin:${admin.userId}`, "test.answer_key", { testId, applied: plan.assign.length });
    return NextResponse.json({
      applied: plan.assign.length,
      invalidOption: plan.invalidOption.map((x) => x.n),
      unknownQuestion: plan.unknownQuestion,
      missing: plan.missing,
    });
  } catch (e) {
    return handleError(e);
  }
}

/** Reads the text out of an uploaded answer-key document so the admin can review it before applying. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const testId = parseParam(idSchema, params.id);
    await loadDraft(testId);

    const limit = await hit(`doc:key:${admin.userId}`, { limit: 30, windowMs: 60 * 60_000 });
    if (!limit.allowed) throw new HttpError(429, "Too many uploads. Try again later.");

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, "File is larger than 4 MB");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file provided");
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "File is larger than 4 MB");

    const buf = Buffer.from(await file.arrayBuffer());
    let kind;
    try {
      kind = validateUpload(file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 150) || "upload", buf);
    } catch (e) {
      if (e instanceof UploadError) throw new HttpError(400, e.message);
      throw e;
    }
    const text = await extractText(kind, buf);
    if (text === null) throw new HttpError(400, "Images can't be read here. Upload a PDF, Word, Excel, CSV or text file.");
    return NextResponse.json({ text: text.slice(0, 20_000) });
  } catch (e) {
    return handleError(e);
  }
}
