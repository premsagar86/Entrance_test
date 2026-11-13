export interface MailResult {
  provider: "brevo" | "resend" | "console";
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

async function sendViaResend(key: string, from: string, to: string, subject: string, text: string): Promise<MailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend send failed (${res.status})`);
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { provider: "resend", messageId: data.id };
}

/**
 * Sends a plain-text email and reports which provider accepted it.
 * Provider order: Brevo, then Resend. MAIL_FROM must be a sender verified with the provider.
 * In development with nothing configured the message is printed to the server console
 * and the result says provider "console" so callers can tell no real email went out.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<MailResult> {
  const from = process.env.MAIL_FROM;
  const brevo = process.env.BREVO_API_KEY;
  const resend = process.env.RESEND_API_KEY;

  if (from && brevo) return sendViaBrevo(brevo, from, to, subject, text);
  if (from && resend) return sendViaResend(resend, from, to, subject, text);

  if (process.env.NODE_ENV === "production") throw new Error("Mail is not configured");
  if (brevo || resend) console.warn("[mail] A provider key is set but MAIL_FROM is missing; printing instead of sending.");
  console.log(`[dev mail] to=${to} subject=${subject}\n${text}`);
  return { provider: "console" };
}
