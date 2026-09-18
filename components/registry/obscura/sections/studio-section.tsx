"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { asset } from "../../_shared/cdn";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { STUDIO } from "../lib/constants";

gsap.registerPlugin(ScrollTrigger);

// The studio, in its own words: a portrait of the printing wall (a plain img
// under the shared grain — not every picture needs a GPU), the story in two
// columns, and three facts set like plate captions.

export default function StudioSection() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;
      gsap.fromTo(
        "[data-studio-reveal]",
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: { trigger: ref.current, start: "top 70%" },
        },
      );
    },
    { scope: ref, dependencies: [still] },
  );

  return (
    <section
      ref={ref}
      id="studio"
      className="relative z-10 mx-auto w-full max-w-[90rem] px-6 py-28 md:px-10 md:py-40"
    >
      <div className="grid grid-cols-1 gap-16 md:grid-cols-[2fr_3fr]">
        <div data-studio-reveal className="relative overflow-hidden rounded-[var(--radius)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- see hero-canvas */}
          <img
            src={asset(STUDIO.portrait.id, { transform: "w_1200" })}
            alt={STUDIO.portrait.alt}
            loading="lazy"
            className="aspect-4/5 h-full w-full object-cover"
          />
          <div aria-hidden="true" className="obscura-grain absolute inset-0" />
        </div>

        <div>
          <p
            data-studio-reveal
            className="font-[family-name:var(--font-body)] text-xs tracking-[0.3em] text-[var(--accent)] uppercase"
          >
            {STUDIO.eyebrow}
          </p>
          <h2
            data-studio-reveal
            className="mt-4 max-w-xl font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--foreground)] md:text-6xl"
          >
            {STUDIO.title}
          </h2>

          <div className="mt-10 flex max-w-xl flex-col gap-6">
            {STUDIO.paragraphs.map((paragraph, index) => (
              <p
                key={index}
                data-studio-reveal
                className="font-[family-name:var(--font-body)] text-sm leading-relaxed text-[var(--muted-foreground)]"
              >
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mt-14 grid grid-cols-3 gap-6 border-t border-[var(--border)] pt-8">
            {STUDIO.facts.map((fact) => (
              <div key={fact.label} data-studio-reveal>
                <p className="font-[family-name:var(--font-display)] text-3xl text-[var(--foreground)]">
                  {fact.value}
                </p>
                <p className="mt-2 font-[family-name:var(--font-body)] text-[11px] tracking-[0.15em] text-[var(--muted-foreground)] uppercase">
                  {fact.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
