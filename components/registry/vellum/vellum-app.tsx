"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ReactLenis, useLenis, type LenisRef } from "lenis/react";
import { cancelFrame, frame } from "motion/react";

import Navbar from "./navbar";
import HeroSection from "./sections/hero-section";
import StatsSection from "./sections/stats-section";
import VenuesSection from "./sections/venues-section";
import ProjectsSection from "./sections/projects-section";
import ProcessSection from "./sections/process-section";
import ModelsSection from "./sections/models-section";
import FooterSection from "./sections/footer-section";
import SiteMask from "./miscellaneous/site-mask";
import SiteLines from "./miscellaneous/site-lines";
import GotoTop from "./miscellaneous/goto-top";
import { IntroAnimation } from "./intro-animation";
import { StillProvider, useStill } from "./hooks/use-still";

const INTRO_KEY = "vellum-intro-seen";

/**
 * useLayoutEffect on the client, a no-op on the server.
 *
 * The intro decision has to land BEFORE the first paint, or the page flashes
 * behind the overlay for a frame. useEffect runs after paint, which is exactly
 * that flash; useLayoutEffect runs before it but warns when React renders on the
 * server. Swapping the hook by environment is the standard way out, and it is
 * what lets the page below render its real content during SSR instead of
 * returning null and shipping an empty document.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Smooth scroll, driven off one clock.
 *
 * Lenis, GSAP and Motion each ship their own rAF loop. Left alone they run three
 * loops per frame and disagree about what time it is, which shows up as scroll-
 * linked animation lagging the scroll by a frame. Both foreign tickers are
 * pointed at Lenis instead, so everything advances from the same timestamp.
 */
function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    function update(data: { timestamp: number }) {
      lenisRef.current?.lenis?.raf(data.timestamp);
    }
    frame.update(update, true);
    return () => cancelFrame(update);
  }, []);

  useEffect(() => {
    function update(time: number) {
      // GSAP's ticker is in seconds; Lenis wants milliseconds.
      lenisRef.current?.lenis?.raf(time * 1000);
    }
    gsap.ticker.add(update);
    return () => gsap.ticker.remove(update);
  }, []);

  return (
    <ReactLenis root ref={lenisRef}>
      {children}
    </ReactLenis>
  );
}

function Page() {
  const lenis = useLenis();
  const still = useStill();
  // false through SSR and hydration: the server cannot read sessionStorage, and
  // the layout effect below flips it before the browser paints. The page itself
  // renders either way — an entrance animation is not a reason to serve an empty
  // document to a crawler or to a visitor on a slow connection.
  const [showIntro, setShowIntro] = useState(false);

  useIsomorphicLayoutEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_KEY) === "true";
    } catch {
      // Blocked storage: treat it as unseen. Playing the intro once per load is
      // a smaller failure than crashing the page.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!seen) setShowIntro(true);
  }, []);

  // An entrance animation is the one thing reduced motion should skip outright:
  // there is nothing to reveal underneath it that the visitor has not already
  // asked to see immediately.
  const intro = showIntro && !still;

  return (
    <main className="relative min-h-screen" suppressHydrationWarning>
      {intro && (
        <IntroAnimation
          onComplete={() => {
            lenis?.start();
            try {
              sessionStorage.setItem(INTRO_KEY, "true");
            } catch {
              // See above — the animation still finished.
            }
            setShowIntro(false);
          }}
        />
      )}
      <Navbar />
      <HeroSection />
      <StatsSection />
      <VenuesSection />
      <ProjectsSection />
      <ProcessSection />
      <ModelsSection />
      <FooterSection />
      <SiteMask />
      <SiteLines />
      <GotoTop />
      {/* Portal target for the project card overlays. */}
      <div id="modal-root" />
    </main>
  );
}

export default function VellumApp() {
  return (
    <StillProvider>
      <SmoothScroll>
        <Page />
      </SmoothScroll>
    </StillProvider>
  );
}
