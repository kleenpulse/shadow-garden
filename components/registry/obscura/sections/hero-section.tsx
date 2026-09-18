"use client";

import { useRef } from "react";
import gsap from "gsap";

import { asset } from "../../_shared/cdn";
import HeroCanvas from "../gfx/hero-canvas";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { HERO } from "../lib/constants";
import SplitText from "../miscellaneous/split-text";

// Full-viewport photograph with the studio's claim set into it. The canvas
// carries the darkroom effects; the text under it is real DOM, and the
// metadata strip is the mono voice of the whole template — exposure notes as
// typography.

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
          stagger: 0.09,
          ease: "power4.out",
          delay: 0.2,
        },
      );
      gsap.fromTo(
        "[data-hero-fade]",
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          stagger: 0.12,
          ease: "power2.out",
          delay: 0.8,
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
      <HeroCanvas src={asset(HERO.image.id, { transform: "w_2400" })} alt={HERO.image.alt} />

      {/* legibility scrim over the photograph's lower third */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[5] h-2/3 bg-linear-to-t from-[var(--background)] via-[color-mix(in_srgb,var(--background)_55%,transparent)] to-transparent"
      />

      <div className="relative z-10 mx-auto w-full max-w-[90rem] px-6 pb-24 md:px-10">
        <p
          data-hero-fade
          className="mb-6 font-[family-name:var(--font-body)] text-xs tracking-[0.3em] text-[var(--accent)] uppercase"
        >
          {HERO.eyebrow}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-6xl leading-[0.95] text-[var(--foreground)] md:text-9xl">
          <span className="block overflow-hidden pb-1">
            <SplitText>{HERO.titleA}</SplitText>
          </span>
          <span className="block overflow-hidden pb-3 italic">
            <SplitText>{HERO.titleB}</SplitText>
          </span>
        </h1>
        <p
          data-hero-fade
          className="mt-8 max-w-md font-[family-name:var(--font-body)] text-sm leading-relaxed text-[var(--muted-foreground)]"
        >
          {HERO.subtitle}
        </p>
      </div>

      <div className="relative z-10 border-t border-[var(--border)]">
        <div
          data-hero-fade
          className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center gap-x-10 gap-y-2 px-6 py-5 md:px-10"
        >
          {HERO.meta.map((item) => (
            <span
              key={item}
              className="font-[family-name:var(--font-body)] text-xs tracking-[0.25em] text-[var(--muted-foreground)] uppercase"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
