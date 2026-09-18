"use client";

import { LenisProvider } from "./lenis-provider";
import Splash from "./miscellaneous/splash";
import SmoothCursor from "./miscellaneous/smooth-cursor";
import GotoTop from "./miscellaneous/goto-top";
import Navbar from "./navigation/navbar";
import HeroSection from "./sections/hero";
import AboutSection from "./sections/about-section";
import HowToBuySection from "./sections/how-to-buy-section";
import FooterSection from "./sections/footer-section";
import { StillProvider } from "./hooks/use-still";

// The page, assembled.
//
// The source rendered `<HeroSection />` and stopped — one screen, with a navbar
// linking to anchors that did not exist and two fully-written datasets
// (HOW_TO_BUY, SOCIALS) that nothing displayed. The three sections under the hero
// are new, and they are what those links and that data were always for.

export default function JinlongApp() {
  return (
    <StillProvider>
      <LenisProvider>
        <Splash />
        <Navbar />

        <main className="relative w-full">
          <HeroSection />
          <AboutSection />
          <HowToBuySection />
          <FooterSection />
        </main>

        <SmoothCursor />
        <GotoTop />
      </LenisProvider>
    </StillProvider>
  );
}
