import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Aptitude Test Platform",
  description: "Online aptitude tests for students",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading request headers makes pages dynamic so Next applies the per-request CSP nonce.
  headers();
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased bg-slate-50 text-slate-900 min-h-screen`}>{children}</body>
    </html>
  );
}
