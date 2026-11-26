import type { z } from "zod";
import { HttpError, assertSameOrigin } from "./auth";

/**
 * Client address used as the key for per-IP rate limits. Only a header set by the hosting proxy may be
 * trusted: a visitor can send any other one. Railway documents X-Real-IP, which is the default; set
 * CLIENT_IP_HEADER when a different proxy supplies the address in another header. Without that header,
 * fall back to the LAST X-Forwarded-For entry (the one added by the nearest proxy); earlier entries
 * can be supplied by the visitor.
 */
export function clientIp(req: Request): string {
  const header = process.env.CLIENT_IP_HEADER?.trim() || "x-real-ip";
  const trusted = req.headers.get(header)?.trim();
  if (trusted) return trusted;
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",").pop()?.trim() || "unknown";
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
