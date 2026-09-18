"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ReactLenis, useLenis, type LenisRef } from "lenis/react";

import Navbar from "./navbar";
import { IntroAnimation } from "./intro-animation";
import HeroSection from "./sections/hero-section";
import WorkSection from "./sections/work-section";
import StudioSection from "./sections/studio-section";
import ServicesSection from "./sections/services-section";
import FooterSection from "./sections/footer-section";
import { StillProvider, useStill } from "./hooks/use-still";

const INTRO_KEY = "obscura-intro-seen";

/**
 * useLayoutEffect on the client, a no-op on the server.
 *
 * The intro decision has to land BEFORE the first paint, or the page flashes
 * behind the overlay for a frame. useEffect runs after paint, which is exactly
 * that flash; useLayoutEffect runs before it but warns when React renders on
 * the server. Swapping the hook by environment is the standard way out.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Smooth scroll, driven off one clock.
 *
 * Lenis and GSAP each ship their own rAF loop; left alone they disagree about
 * what time it is, and scroll-linked animation lags the scroll by a frame.
 * GSAP's ticker is the single clock here — it drives Lenis, and ScrollTrigger
 * already listens to GSAP.
 */
function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    function update(time: number) {
      // GSAP's ticker is in seconds; Lenis wants milliseconds.
      lenisRef.current?.lenis?.raf(time * 1000);
    }
    gsap.ticker.add(update);
    return () => gsap.ticker.remove(update);
  }, []);

  return (
    <ReactLenis root options={{ autoRaf: false }} ref={lenisRef}>
      {children}
    </ReactLenis>
  );
}

function Page() {
  const lenis = useLenis();
  const still = useStill();
  // false through SSR and hydration: the server cannot read sessionStorage,
  // and the layout effect below flips it before the browser paints. The page
  // itself renders either way — an entrance animation is not a reason to
  // serve an empty document to a crawler or a visitor on a slow connection.
  const [showIntro, setShowIntro] = useState(false);

  useIsomorphicLayoutEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_KEY) === "true";
    } catch {
      // Blocked storage: treat it as unseen. Playing the intro once per load
      // is a smaller failure than crashing the page.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!seen) setShowIntro(true);
  }, []);

  const intro = showIntro && !still;

  useEffect(() => {
    if (intro) lenis?.stop();
  }, [intro, lenis]);

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
      <WorkSection />
      <StudioSection />
      <ServicesSection />
      <FooterSection />
    </main>
  );
}

export default function ObscuraApp() {
  return (
    <StillProvider>
      <SmoothScroll>
        <Page />
      </SmoothScroll>
    </StillProvider>
  );
}
