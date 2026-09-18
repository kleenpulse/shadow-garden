"use client";

import { useRef } from "react";
import { gsap } from "gsap";

import { useGSAP } from "./hooks/use-gsap";
import { INTRO } from "./lib/constants";

// The entrance: an aperture of night. The wordmark tracks in letter by
// letter, the sub-line settles, then a circular clip opens from the centre —
// the page was rendered underneath the whole time, so a crawler or a visitor
// with scripting disabled never sees this overlay at all. Reduced motion skips
// the component entirely (the app root never mounts it), which is the correct
// reading of "skip the entrance": there is nothing underneath the visitor has
// not already asked to see.

type IntroAnimationProps = {
  onComplete: () => void;
};

export function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const overlay = ref.current;
      if (!overlay) return;

      const letters = overlay.querySelectorAll("[data-intro-letter]");
      const line = overlay.querySelector("[data-intro-line]");

      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete,
      });

      timeline
        .fromTo(
          letters,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.7, stagger: 0.045 },
        )
        .fromTo(
          line,
          { opacity: 0 },
          { opacity: 1, duration: 0.5 },
          "-=0.3",
        )
        .to(overlay, {
          clipPath: "circle(0% at 50% 50%)",
          duration: 0.9,
          ease: "power3.inOut",
          delay: 0.5,
        })
        .set(overlay, { display: "none" });
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--background)]"
      style={{ clipPath: "circle(140% at 50% 50%)" }}
    >
      <div className="font-[family-name:var(--font-display)] text-3xl tracking-[0.45em] text-[var(--foreground)] md:text-5xl">
        {INTRO.wordmark.split("").map((letter, index) => (
          <span key={index} data-intro-letter className="inline-block">
            {letter}
          </span>
        ))}
      </div>
      <p
        data-intro-line
        className="text-xs tracking-[0.3em] text-[var(--muted-foreground)] uppercase"
      >
        {INTRO.line}
      </p>
    </div>
  );
}
