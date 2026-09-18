"use client";

import { useRef } from "react";
import { gsap } from "gsap";

import { useGSAP } from "./hooks/use-gsap";
import { INTRO } from "./lib/constants";

// The entrance: a print developing. The counter runs 0→100 like a darkroom
// timer under a safelight-red wash, the wordmark resolves out of the red, and
// the wash lifts upward to reveal the page — which rendered underneath the
// whole time, so nothing here costs a crawler or a no-JS visitor anything.
// Reduced motion never mounts this component at all.

type IntroAnimationProps = {
  onComplete: () => void;
};

export function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const overlay = ref.current;
      if (!overlay) return;

      const counter = overlay.querySelector("[data-intro-counter]");
      const wordmark = overlay.querySelector("[data-intro-wordmark]");
      const wash = overlay.querySelector("[data-intro-wash]");
      const progress = { value: 0 };

      const timeline = gsap.timeline({
        defaults: { ease: "power2.out" },
        onComplete,
      });

      timeline
        .to(progress, {
          value: 100,
          duration: 1.4,
          ease: "power1.inOut",
          onUpdate: () => {
            if (counter) {
              counter.textContent = String(Math.round(progress.value)).padStart(3, "0");
            }
          },
        })
        .fromTo(
          wordmark,
          { opacity: 0, letterSpacing: "0.6em" },
          { opacity: 1, letterSpacing: "0.2em", duration: 0.8 },
          "-=0.9",
        )
        .to(wash, { opacity: 0, duration: 0.5 }, "-=0.2")
        .to(overlay, {
          yPercent: -100,
          duration: 0.8,
          ease: "power3.inOut",
          delay: 0.15,
        })
        .set(overlay, { display: "none" });
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--background)]"
    >
      <div
        data-intro-wash
        aria-hidden="true"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
      />
      <p
        data-intro-wordmark
        className="relative font-[family-name:var(--font-display)] text-4xl tracking-[0.2em] text-[var(--foreground)] md:text-6xl"
      >
        {INTRO.wordmark}
      </p>
      <p className="relative mt-6 flex items-center gap-3 font-[family-name:var(--font-body)] text-xs tracking-[0.3em] text-[var(--muted-foreground)] uppercase">
        {INTRO.line}
        <span data-intro-counter className="inline-block w-[3ch] text-[var(--accent)]">
          000
        </span>
      </p>
    </div>
  );
}
