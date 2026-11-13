"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { errorMessage, postJson } from "@/lib/client-api";
import { Turnstile, turnstileEnabled } from "@/components/Turnstile";
import { ErrorText, SubmitButton } from "@/components/ui";
import { FloatField } from "@/components/auth/FloatField";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const stg = (i: number) => ({ "--i": i }) as CSSProperties;

export function AdminLoginForm({ active }: { active: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState("");
  const [errKey, setErrKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((t: string) => setToken(t), []);

  const fail = (msg: string) => {
    setError(msg);
    setErrKey((k) => k + 1);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleanPhone = phone.replace(/[\s\-().]/g, "");
    if (!EMAIL_RE.test(email.trim())) return fail("Enter a valid email address.");
    if (!/^\+?\d{8,15}$/.test(cleanPhone)) {
      return fail("Enter a valid phone number: 8 to 15 digits, with or without a + country code.");
    }
    if (turnstileEnabled && !token) return fail("Please complete the verification.");
    setBusy(true);
    const res = await postJson("/api/auth/admin/login", {
      email: email.trim(),
      phone: cleanPhone,
      ...(token ? { turnstile: token } : {}),
    });
    setBusy(false);
    if (res.ok) {
      router.replace("/admin");
      router.refresh();
      return;
    }
    fail(res.status === 401 ? "Invalid email or phone number." : errorMessage(res, "Sign in failed."));
    setResetKey((k) => k + 1);
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="stg" style={stg(0)}>
        <FloatField label="Email" icon={Mail} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="stg" style={stg(1)}>
        <FloatField secret label="Phone number" autoComplete="current-password" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {active && <Turnstile onToken={onToken} resetKey={resetKey} />}
      {error && (
        <div key={errKey} className="anim-shake">
          <ErrorText message={error} />
        </div>
      )}
      <div className="stg" style={stg(2)}>
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </div>
    </form>
  );
}
