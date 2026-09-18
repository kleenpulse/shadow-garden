"use client";

import { useRef } from "react";
import Image from "next/image";

import { HOW_TO_BUY } from "../lib/constants";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// The three-step section.
//
// New — and the most obviously missing of the three. `HOW_TO_BUY` was already
// sitting fully written in lib/constants.ts, and the navbar already linked to
// `#how-to-buy`. The data and the link both existed; only the section did not.

export default function HowToBuySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;

      gsap.from(".step__card", {
        y: 64,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.15,
        scrollTrigger: { trigger: sectionRef.current, start: "top 70%" },
      });

      // The coins keep turning while the section is on screen — the one piece of
      // idle motion in an otherwise scroll-driven page.
      gsap.to(".step__coin", {
        rotateY: 360,
        duration: 6,
        ease: "none",
        repeat: -1,
        stagger: 0.8,
      });
    },
    { scope: sectionRef, dependencies: [still] },
  );

  return (
    <section
      ref={sectionRef}
      id="how-to-buy"
      className="relative z-10 w-full bg-black px-4 py-24 sm:px-8 md:py-32 lg:px-16"
    >
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-16 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <h2 className="max-w-[14ch] text-4xl font-black uppercase leading-[0.95] text-white sm:text-6xl md:text-7xl">
            How to <span className="text-[hsl(var(--primary-red))]">claim</span>
          </h2>
          <p className="max-w-[42ch] text-base font-light text-white/60 sm:text-lg">
            Three steps. No allowlist, no waiting room, no form to fill in
            beforehand.
          </p>
        </div>

        <ol className="grid gap-6 md:grid-cols-3 md:gap-8">
          {HOW_TO_BUY.map((step) => (
            <li
              key={step.id}
              className="step__card group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-linear-to-b from-white/[0.07] to-transparent p-8 transition-colors hover:border-[hsl(var(--primary-red))]/40"
            >
              <div className="step__coin relative mb-8 size-20 [transform-style:preserve-3d]">
                <Image
                  src={step.image}
                  alt=""
                  aria-hidden
                  fill
                  sizes="80px"
                  className="object-contain"
                />
              </div>

              <h3 className="mb-3 text-xl font-black uppercase tracking-wide text-white sm:text-2xl">
                {step.title}
              </h3>
              <p className="text-sm font-light leading-relaxed text-white/60 sm:text-base">
                {step.description}
              </p>

              {/* Oversized step numeral, bled off the corner. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-6 -right-2 text-[7rem] font-black leading-none text-white/[0.04] transition-colors group-hover:text-[hsl(var(--primary-red))]/10"
              >
                {step.id}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
