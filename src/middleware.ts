import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // Nonces don't cover style="" attributes (used for CSS custom properties); allow only those.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  // Coarse guard only; every handler re-checks the session.
  const p = req.nextUrl.pathname;
  const needsAdmin = p.startsWith("/admin") && p !== "/admin/login";
  const needsStudent = /^\/(dashboard|test|result|results|profile|announcements|help)(\/|$)/.test(p);
  if (needsAdmin && !req.cookies.has("at_admin")) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  if (needsStudent && !req.cookies.has("at_student")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
