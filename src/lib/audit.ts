import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** Never pass secrets or full PII in meta. */
export async function audit(actor: string, action: string, meta?: Prisma.InputJsonValue) {
  try {
    await db.auditLog.create({ data: { actor, action, meta } });
  } catch {
    // Auditing must not break the request, but surface it in server logs.
    console.error("audit write failed", action);
  }
}
