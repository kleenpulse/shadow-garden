"use client";

import { ReactLenis } from "lenis/react";

import Navbar from "./navbar";
import Hero from "./sections/hero-section";
import About from "./sections/about-section";
import Features from "./sections/features-section";
import Realm from "./sections/realm-section";
import Contact from "./sections/contact-section";
import Footer from "./sections/footer-section";
import { StillProvider } from "./hooks/use-still";

// The page, assembled.
//
// Every surface that used to be a video file is a shader now. There are nine of
// them and they cost nothing to download; what they cost is GPU time, which is why
// gfx/field-canvas.tsx stops each one the moment it leaves the viewport.

export default function NoctisApp() {
  return (
    <StillProvider>
      <ReactLenis root>
        <main className="relative min-h-screen w-screen overflow-x-hidden">
          <Navbar />
          <Hero />
          <About />
          <Features />
          <Realm />
          <Contact />
          <Footer />
        </main>
      </ReactLenis>
    </StillProvider>
  );
}
