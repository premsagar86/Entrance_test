"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Hash, Mail } from "lucide-react";
import { postJson } from "@/lib/client-api";
import { Turnstile, turnstileEnabled } from "@/components/Turnstile";
import { ErrorText, Segmented, SubmitButton } from "@/components/ui";
import { FloatField } from "@/components/auth/FloatField";

const stg = (i: number) => ({ "--i": i }) as CSSProperties;

export function StudentLoginForm({ active }: { active: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"rollNo" | "dob">("rollNo");
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (turnstileEnabled && !token) return fail("Please complete the verification.");
    setBusy(true);
    const res = await postJson("/api/auth/student/login", {
      email: email.trim(),
      ...(mode === "dob" ? { dob: secret } : { rollNo: secret.trim() }),
      ...(token ? { turnstile: token } : {}),
    });
    setBusy(false);
    if (res.ok) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    fail(res.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : res.data.error ?? "Login failed.");
    setResetKey((k) => k + 1);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="stg" style={stg(0)}>
        <FloatField label="Email" icon={Mail} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="stg space-y-2" style={stg(1)}>
        <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">Verify with</span>
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setSecret("");
          }}
          options={[
            { value: "rollNo", label: "Roll number" },
            { value: "dob", label: "Date of birth" },
          ]}
        />
      </div>
      <div className="stg" style={stg(2)}>
        {mode === "dob" ? (
          <FloatField key="dob" label="Date of birth" alwaysFloat type="date" required value={secret} onChange={(e) => setSecret(e.target.value)} />
        ) : (
          <FloatField key="roll" label="Roll number" icon={Hash} type="text" autoComplete="off" maxLength={40} required value={secret} onChange={(e) => setSecret(e.target.value)} />
        )}
      </div>
      {active && <Turnstile onToken={onToken} resetKey={resetKey} />}
      {error && (
        <div key={errKey} className="anim-shake">
          <ErrorText message={error} />
        </div>
      )}
      <div className="stg" style={stg(3)}>
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </div>
      <p className="stg text-center text-xs text-slate-500" style={stg(4)}>
        Can&apos;t sign in? Contact your institute to check your registered details.
      </p>
    </form>
  );
}
