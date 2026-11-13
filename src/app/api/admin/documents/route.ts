import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { HttpError, assertSameOrigin, handleError, requireAdmin } from "@/lib/auth";
import { hit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { saveFile } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, MIME, UploadError, validateUpload } from "@/lib/upload/validate";
import { ParseError, parseDocument } from "@/lib/parsers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
    const items = await db.document.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, filename: true, status: true, createdAt: true, tests: { select: { id: true, status: true, _count: { select: { questions: true } } } } },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin();

    const limit = await hit(`doc:upload:${admin.userId}`, { limit: 20, windowMs: 60 * 60_000 });
    if (!limit.allowed) throw new HttpError(429, "Too many uploads. Try again later.");

    // Reject oversized bodies before buffering them.
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, "File is larger than 4 MB");

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file provided");
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "File is larger than 4 MB");

    const filename = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 150) || "upload";
    const buf = Buffer.from(await file.arrayBuffer());

    let kind;
    try {
      kind = validateUpload(filename, buf);
    } catch (e) {
      if (e instanceof UploadError) throw new HttpError(400, e.message);
      throw e;
    }

    const key = await saveFile(buf, kind);
    const doc = await db.document.create({
      data: { filename, path: key, mime: MIME[kind], status: "PARSING", uploadedBy: admin.userId },
      select: { id: true },
    });

    try {
      const { questions, method } = await parseDocument(kind, buf);
      const title = filename.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled test";
      const test = await db.$transaction(async (tx) => {
        const t = await tx.test.create({
          data: { title, durationMin: 60, documentId: doc.id },
          select: { id: true },
        });
        await tx.question.createMany({
          data: questions.map((q, i) => ({
            testId: t.id,
            text: q.text,
            options: q.options,
            correctOption: q.correctOption,
            order: i + 1,
            explanation: q.explanation,
            confidence: q.confidence,
          })),
        });
        await tx.document.update({ where: { id: doc.id }, data: { status: "PARSED" } });
        return t;
      });
      const missingKeys = questions.filter((q) => q.correctOption === null).length;
      const lowConfidence = questions.filter((q) => q.confidence < 0.6).length;
      await audit(`admin:${admin.userId}`, "document.upload", { documentId: doc.id, kind, method, questions: questions.length });
      return NextResponse.json(
        { documentId: doc.id, testId: test.id, method, questions: questions.length, missingKeys, lowConfidence },
        { status: 201 },
      );
    } catch (e) {
      await db.document.update({ where: { id: doc.id }, data: { status: "FAILED" } });
      await audit(`admin:${admin.userId}`, "document.parse_failed", { documentId: doc.id, kind });
      if (e instanceof ParseError) {
        return NextResponse.json({ error: e.message, documentId: doc.id }, { status: 422 });
      }
      console.error("parse failed", e);
      return NextResponse.json({ error: "Could not read this document.", documentId: doc.id }, { status: 422 });
    }
  } catch (e) {
    return handleError(e);
  }
}
