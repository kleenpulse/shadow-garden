"use client";

import { LenisProvider } from "./lenis-provider";
import SmoothCursor from "./miscellaneous/smooth-cursor";
import GotoTop from "./miscellaneous/goto-top";
import HomeNavbar from "./navigations/nav-bar";
import HeroSection from "./sections/hero";
import { Features } from "./sections/features";
import { About } from "./sections/about";
import { HowItWorks } from "./sections/how-it-works";
import { Metrics } from "./sections/metrics";
import { Integration } from "./sections/integration";
import FAQs from "./sections/faqs";
import Footer from "./sections/footer";
import { StillProvider } from "./hooks/use-still";

export default function SignalApp() {
  return (
    <StillProvider>
      <LenisProvider>
        <SmoothCursor />
        <HomeNavbar />

        <HeroSection />
        <Features />
        <About />
        <HowItWorks />
        <Metrics />

        {/* The lower half of the page rides one continuous gradient, so these three
            sections share a wrapper rather than each painting their own ground. */}
        <section className="flex w-full flex-col bg-linear-to-t from-[#01014e] from-0% via-[var(--primary)] via-10% to-[var(--secondary)]">
          <Integration />
          <FAQs />
          <Footer />
        </section>

        <GotoTop />
      </LenisProvider>
    </StillProvider>
  );
}
