/**
 * Verifies a Cloudflare Turnstile token. In production a missing secret fails
 * closed; in development an unset secret skips the check.
 * Failures are logged (reason codes only, never the secret or the token) so they show up in the host's logs.
 */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") console.error("[turnstile] TURNSTILE_SECRET is not set; rejecting the request.");
    return process.env.NODE_ENV !== "production";
  }
  if (!token) {
    console.error("[turnstile] request had no token (is NEXT_PUBLIC_TURNSTILE_SITE_KEY set at build time, and was the widget completed?)");
    return false;
  }
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[]; hostname?: string };
    if (data.success !== true) {
      console.error("[turnstile] verification failed:", (data["error-codes"] ?? []).join(",") || "unknown", "hostname:", data.hostname ?? "n/a");
    }
    return data.success === true;
  } catch (e) {
    console.error("[turnstile] could not reach Cloudflare:", e instanceof Error ? e.message : e);
    return false;
  }
}
