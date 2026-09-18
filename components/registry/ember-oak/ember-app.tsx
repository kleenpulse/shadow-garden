"use client";

import { ReactLenis } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

import Navbar from "./navbar";
import Hero from "./sections/hero-section";
import Cocktails from "./sections/cocktails-section";
import About from "./sections/about-section";
import Art from "./sections/art-section";
import Menu from "./sections/menu-section";
import Contact from "./sections/contact-section";
import { StillProvider } from "./hooks/use-still";

// Registered once, at the composition root, rather than in each section that
// happens to use them. Repeated registerPlugin calls are harmless but they make it
// look as though the plugins are optional per section, which they are not.
gsap.registerPlugin(ScrollTrigger, SplitText);

export default function EmberApp() {
  return (
    <StillProvider>
      <ReactLenis root />
      <main>
        <Navbar />
        <Hero />
        <Cocktails />
        <About />
        <Art />
        <Menu />
        <Contact />
      </main>
    </StillProvider>
  );
}
