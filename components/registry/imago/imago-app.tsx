"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { Header } from "./header";
import Loader from "./loader";
import CornerLetters from "./sections/corner-letters";
import HeroSection from "./sections/hero-section";
import AboutSection from "./sections/about-section";
import TeamSection from "./sections/team-section";
import PortfolioSection from "./sections/portfolio-section";
import Spotlight from "./sections/spotlight";
import Footer from "./sections/footer";
import GotoTop from "./miscellaneous/goto-top";
import { StillProvider } from "./hooks/use-still";

// The 3D scene is the heaviest thing on the page and has nothing to prerender —
// a WebGL context does not exist on the server. Split so the document, the type
// and the copy all arrive without waiting on it.
const ImagoScene = dynamic(() => import("./model/scene"), { ssr: false });
const AttractorsParticle = dynamic(
  () => import("./model/attractors-particle"),
  { ssr: false },
);

/** Ceiling on the loader. A model that never arrives must not hold the page hostage. */
const LOAD_TIMEOUT_MS = 10_000;

function Page() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  const handleLoadProgress = useCallback((progress: number) => {
    setLoadProgress(progress);
  }, []);

  const handleLoadComplete = useCallback(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    // The model is delivered from a CDN. If that request is slow, blocked or
    // pointed at an account that has not been populated yet, the page still has to
    // become usable — the copy underneath is the actual product.
    const timeout = setTimeout(() => setIsLoaded(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <>
      <Loader progress={loadProgress} isComplete={isLoaded} />
      <AttractorsParticle />
      <ImagoScene
        onLoadProgress={handleLoadProgress}
        onLoadComplete={handleLoadComplete}
      />
      <CornerLetters />
      <Header />
      <main
        className={`relative z-10 transition-[opacity,scale,transform] duration-700 ${
          isLoaded ? "scale-100 opacity-100" : "scale-105 opacity-0"
        }`}
      >
        <HeroSection />
        <AboutSection />
        <TeamSection />
        <PortfolioSection />
        <Spotlight />
        <Footer />
      </main>
      {/* Bottom vignette, so the scene never collides with the fold. */}
      <div className="pointer-events-none fixed bottom-0 left-0 z-20 h-40 w-full bg-linear-to-b from-transparent via-transparent to-black" />
      <GotoTop />
    </>
  );
}

export default function ImagoApp() {
  return (
    <StillProvider>
      <Page />
    </StillProvider>
  );
}
