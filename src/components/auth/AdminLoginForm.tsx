"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Mail, Phone } from "lucide-react";
import { errorMessage, postJson } from "@/lib/client-api";
import { Turnstile, turnstileEnabled } from "@/components/Turnstile";
import { ErrorText, InfoText, OtpInput, SubmitButton } from "@/components/ui";
import { FloatField } from "@/components/auth/FloatField";

type Delivery = "sent" | "console" | "failed" | "throttled" | "no-match";
interface OtpRequestResult {
  maskedEmail: string;
  resendAfterSec: number;
  delivery?: Delivery; // only returned outside production
  signedIn?: boolean; // dev-only: server skipped the OTP and already created the session
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const stg = (i: number) => ({ "--i": i }) as CSSProperties;

export function AdminLoginForm({ active, onStepChange }: { active: boolean; onStepChange: (step: "details" | "otp") => void }) {
  const router = useRouter();
  const [step, setStepState] = useState<"details" | "otp">("details");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState("");
  const [errKey, setErrKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<OtpRequestResult | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const onToken = useCallback((t: string) => setToken(t), []);

  const setStep = (s: "details" | "otp") => {
    setStepState(s);
    onStepChange(s);
  };
  const fail = (msg: string) => {
    setError(msg);
    setErrKey((k) => k + 1);
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    const cleanPhone = phone.replace(/[\s\-().]/g, "");
    if (!EMAIL_RE.test(email.trim())) return fail("Enter a valid email address.");
    if (!/^\+?\d{8,15}$/.test(cleanPhone)) {
      return fail("Enter a valid phone number: 8 to 15 digits, with or without a + country code.");
    }
    if (turnstileEnabled && !token) return fail("Please complete the verification.");
    setBusy(true);
    const res = await postJson<OtpRequestResult>("/api/auth/admin/otp/request", {
      email: email.trim(),
      phone: cleanPhone,
      ...(token ? { turnstile: token } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      fail(errorMessage(res, "Could not send the code."));
      setResetKey((k) => k + 1);
      return;
    }
    if (res.data.signedIn) {
      router.replace("/admin");
      router.refresh();
      return;
    }
    setSent(res.data);
    setCooldown(res.data.resendAfterSec ?? 30);
    setOtp("");
    setStep("otp");
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length !== 6) return fail("Enter all 6 digits.");
    setBusy(true);
    const res = await postJson("/api/auth/admin/otp/verify", { email: email.trim(), otp });
    setBusy(false);
    if (res.ok) {
      router.replace("/admin");
      router.refresh();
      return;
    }
    setOtp("");
    fail(res.status === 401 ? "That code is wrong or has expired. Check the latest email, or request a new code." : errorMessage(res, "Verification failed."));
  }

  const errorBlock = error && (
    <div key={errKey} className="anim-shake">
      <ErrorText message={error} />
    </div>
  );

  return step === "details" ? (
    <form onSubmit={requestOtp} className="space-y-5" noValidate>
      <div className="stg" style={stg(0)}>
        <FloatField label="Email" icon={Mail} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="stg" style={stg(1)}>
        <FloatField label="Phone" icon={Phone} type="tel" hint="Enter it exactly as registered for this admin." required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {active && <Turnstile onToken={onToken} resetKey={resetKey} />}
      {errorBlock}
      <div className="stg" style={stg(2)}>
        <SubmitButton busy={busy}>Send code</SubmitButton>
      </div>
    </form>
  ) : (
    <form onSubmit={verifyOtp} className="space-y-5" noValidate>
      <div className="anim-slide-in">
        <DeliveryNotice info={sent} />
      </div>
      <div key={errKey} className={error ? "anim-shake" : ""}>
        <OtpInput value={otp} onChange={setOtp} />
      </div>
      {error && <ErrorText message={error} />}
      <SubmitButton busy={busy}>Verify and sign in</SubmitButton>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setStep("details");
            setOtp("");
            setError("");
          }}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Change details
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || busy}
          onClick={() => requestOtp()}
          className="font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

function DeliveryNotice({ info }: { info: OtpRequestResult | null }) {
  if (!info) return null;
  const to = info.maskedEmail;
  // Outside production the server tells us what really happened; in production it never reveals this.
  if (info.delivery === "console") {
    return (
      <Warn title="Email is not configured, so nothing was emailed.">
        The code was printed in the server terminal (where <code>npm run dev</code> runs). Add <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>MAIL_FROM</code> to <code>.env</code> to send real emails.
      </Warn>
    );
  }
  if (info.delivery === "failed") {
    return (
      <Warn title="The email could not be sent.">
        The SMTP server rejected the request. Check the <code>SMTP_*</code> settings and that <code>MAIL_FROM</code> is an allowed sender. See the server terminal for the exact error.
      </Warn>
    );
  }
  if (info.delivery === "throttled") {
    return <InfoText message="A code was sent moments ago. Please use that one, or wait before requesting another." />;
  }
  if (info.delivery === "no-match") {
    return <Warn title="No email was sent.">These details do not match an admin account. Go back and check the email and phone.</Warn>;
  }
  return <InfoText message={`If the details match an admin account, a code was sent to ${to}. It expires in 5 minutes. Check spam if you do not see it.`} />;
}

function Warn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-xs">{children}</p>
      </div>
    </div>
  );
}
