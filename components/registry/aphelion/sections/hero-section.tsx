"use client";

import { useRef } from "react";
import gsap from "gsap";

import HeroCanvas from "../gfx/hero-canvas";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { HERO } from "../lib/constants";
import SplitText from "../miscellaneous/split-text";

// Full-viewport aurora with the claim of the whole site set over it. The
// canvas is presentation only (aria-hidden); everything a reader or crawler
// needs is real text in this file's DOM.

export default function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;
      gsap.fromTo(
        ".word",
        { yPercent: 110, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 1.1,
          stagger: 0.08,
          ease: "power4.out",
          delay: 0.15,
        },
      );
      gsap.fromTo(
        "[data-hero-fade]",
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          stagger: 0.12,
          ease: "power2.out",
          delay: 0.7,
        },
      );
    },
    { scope: ref, dependencies: [still] },
  );

  return (
    <section
      ref={ref}
      id="top"
      className="relative flex h-[100dvh] min-h-[640px] flex-col justify-end overflow-hidden"
    >
      <HeroCanvas />

      <div className="relative z-10 mx-auto w-full max-w-[90rem] px-6 pb-28 md:px-10">
        <p
          data-hero-fade
          className="mb-6 text-xs tracking-[0.3em] text-[var(--accent)] uppercase"
        >
          {HERO.eyebrow}
        </p>
        <h1 className="max-w-4xl font-[family-name:var(--font-display)] text-5xl leading-[1.02] text-[var(--foreground)] md:text-8xl">
          <span className="inline-block overflow-hidden pb-2 align-bottom">
            <SplitText>{HERO.title}</SplitText>
          </span>
        </h1>
        <p
          data-hero-fade
          className="mt-8 max-w-md text-base leading-relaxed text-[var(--muted-foreground)]"
        >
          {HERO.subtitle}
        </p>
      </div>

      <div className="relative z-10 border-t border-[var(--border)]">
        <div className="mx-auto grid w-full max-w-[90rem] grid-cols-2 gap-px px-6 py-6 md:grid-cols-4 md:px-10">
          {HERO.stats.map((stat) => (
            <div key={stat.label} data-hero-fade className="pr-6">
              <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--foreground)]">
                {stat.value}
              </p>
              <p className="mt-1 text-xs tracking-wide text-[var(--muted-foreground)] uppercase">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p
        data-hero-fade
        className="absolute right-6 bottom-40 z-10 hidden rotate-90 text-[10px] tracking-[0.3em] text-[var(--muted-foreground)] uppercase md:block"
      >
        {HERO.scrollCue}
      </p>
    </section>
  );
}
