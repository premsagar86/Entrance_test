export interface MailResult {
  provider: "brevo" | "console";
  messageId?: string;
}

/** Parses "Name <addr@x.com>" or a bare address. */
function parseSender(from: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: from.trim() };
}

async function sendViaBrevo(key: string, from: string, to: string, subject: string, text: string): Promise<MailResult> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: parseSender(from), to: [{ email: to }], subject, textContent: text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Brevo returns a JSON body with a "message" (e.g. unverified sender). Keep it for server logs only.
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}) ${detail.slice(0, 200)}`);
  }
  const data = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { provider: "brevo", messageId: data.messageId };
}

/**
 * Sends a plain-text email through the Brevo API. Needs BREVO_API_KEY and MAIL_FROM
 * (MAIL_FROM must be a sender verified in Brevo).
 * In development with nothing configured the message is printed to the server console
 * and the result says provider "console" so callers can tell no real email went out.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<MailResult> {
  const from = process.env.MAIL_FROM;
  const key = process.env.BREVO_API_KEY;

  if (from && key) return sendViaBrevo(key, from, to, subject, text);

  if (process.env.NODE_ENV === "production") throw new Error("Mail is not configured");
  if (key) console.warn("[mail] BREVO_API_KEY is set but MAIL_FROM is missing; printing instead of sending.");
  console.log(`[dev mail] to=${to} subject=${subject}\n${text}`);
  return { provider: "console" };
}
