"use client";

import { Suspense } from "react";

import VoltlineProvider from "./lib/voltline-context";
import LenisProvider from "./miscellaneous/lenis-provider";
import SplashScreen from "./miscellaneous/splash-screen";
import SendMessageModal from "./modal/send-message-modal";
import Navbar from "./navigation/navbar";
import GotoTop from "./navigation/goto-top";
import Hero from "./sections/hero-section";
import MidSections from "./sections/mid-sections";
import Waitlist from "./sections/waitlist-section";
import FAQs from "./sections/faqs-section";
import Contact from "./sections/contact-section";
import Footer from "./sections/footer-section";
import { StillProvider } from "./hooks/use-still";

// The page, assembled.
//
// The source spread this across a root layout, a route-group layout and a page —
// three files because it was an eight-route marketing site. A template is one
// route, so the composition lives in one place where a buyer can see the whole
// order of sections at a glance and reorder it.

export default function VoltlineApp() {
  return (
    <StillProvider>
      <VoltlineProvider>
        <Suspense fallback={<SplashScreen />}>
          <LenisProvider>
            {/* Success confirmation for the waitlist form, portalled above the page. */}
            <SendMessageModal
              isWaitlist
              message="You have been added to the waitlist."
            />

            <section className="relative mx-auto w-full max-w-[1440px] min-[1440px]:border min-[1440px]:border-l-[var(--soft-border)] min-[1440px]:border-r-[var(--soft-border)]">
              <Navbar />

              <main className="relative w-full bg-[var(--surface-white)]">
                <Hero />
                <MidSections />
                <Waitlist />
                <section className="mx-auto w-full max-w-[1440px] px-4 min-[500px]:px-8 lg:px-16">
                  <FAQs />
                </section>
              </main>

              <Contact />
              <Footer />
              <GotoTop />
            </section>
          </LenisProvider>
        </Suspense>
      </VoltlineProvider>
    </StillProvider>
  );
}
