"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Renders the Cloudflare Turnstile widget. Renders nothing when no site key is configured (dev). */
export function Turnstile({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>();

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    const el = ref.current;
    const mount = () => {
      if (!window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(el, {
        sitekey: SITE_KEY,
        callback: onToken,
        "expired-callback": () => onToken(""),
      });
    };
    if (window.turnstile) {
      mount();
    } else if (!document.getElementById("cf-turnstile-script")) {
      const s = document.createElement("script");
      s.id = "cf-turnstile-script";
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = mount;
      document.head.appendChild(s);
    } else {
      document.getElementById("cf-turnstile-script")!.addEventListener("load", mount);
    }
  }, [onToken]);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current) {
      window.turnstile?.reset(widgetId.current);
      onToken("");
    }
  }, [resetKey, onToken]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="my-2" />;
}

export const turnstileEnabled = Boolean(SITE_KEY);
