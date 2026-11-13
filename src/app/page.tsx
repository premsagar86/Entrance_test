import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { Navbar, type Viewer } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Audience, Banner, Faq, Features, FinalCta, Footer, Highlights, HowItWorks } from "@/components/landing/Sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aptitude: online aptitude tests, timed and scored instantly",
  description: "Run fair, timed aptitude tests with server-enforced timers, autosave and instant results. Sign in as a student or administrator.",
};

export default async function Home() {
  const viewer: Viewer = (await getSession("ADMIN")) ? "ADMIN" : (await getSession("STUDENT")) ? "STUDENT" : null;
  return (
    <div className="landing lp-bg min-h-screen">
      <Navbar viewer={viewer} />
      <main>
        <Hero viewer={viewer} />
        <Banner viewer={viewer} />
        <Highlights />
        <HowItWorks />
        <Features />
        <Audience viewer={viewer} />
        <Faq />
        <FinalCta viewer={viewer} />
      </main>
      <Footer />
    </div>
  );
}
