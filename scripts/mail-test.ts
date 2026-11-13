/**
 * Sends one real test email through Brevo so you can confirm delivery.
 * Usage: npm run mail:test -- you@example.com
 */
import { sendMail } from "../src/lib/mail";

async function main() {
  const to = process.argv[2];
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error("Usage: npm run mail:test -- you@example.com");
    process.exit(1);
  }
  console.log(`MAIL_FROM=${process.env.MAIL_FROM ? "set" : "MISSING"}  BREVO_API_KEY=${process.env.BREVO_API_KEY ? "set" : "MISSING"}`);
  const r = await sendMail(to, "Aptitude platform: test email", "If you can read this, email delivery works.");
  if (r.provider === "console") {
    console.log("NOT SENT: Brevo is not configured (need BREVO_API_KEY and MAIL_FROM).");
    process.exit(2);
  }
  console.log(`Accepted by ${r.provider}. messageId=${r.messageId ?? "n/a"}. Check the inbox (and spam).`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(3);
});
