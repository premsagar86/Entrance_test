import type { z } from "zod";
import { HttpError, assertSameOrigin } from "./auth";

export function clientIp(req: Request): string {
  // Caddy sets X-Forwarded-For; take the left-most (client) address.
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "unknown";
}

/** Same-origin check + size-capped, strictly validated JSON body. */
export async function parseJson<T extends z.ZodType>(
  req: Request,
  schema: T,
  maxBytes = 64 * 1024,
): Promise<z.infer<T>> {
  assertSameOrigin(req);
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Payload too large");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, "Invalid input");
  return r.data;
}

export function parseParam<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(400, "Invalid input");
  return r.data;
}
