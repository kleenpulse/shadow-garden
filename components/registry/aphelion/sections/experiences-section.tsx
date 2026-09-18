"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { EXPERIENCES } from "../lib/constants";

gsap.registerPlugin(ScrollTrigger);

// An index, not a card grid: four numbered rows under hairlines, the way a
// night's programme reads on paper. Hover pulls the row's title toward the
// accent; scroll staggers the rows in as the section enters.

export default function ExperiencesSection() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;
      gsap.fromTo(
        "[data-experience-row]",
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
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
      id="experiences"
      className="relative z-10 mx-auto w-full max-w-[90rem] px-6 py-28 md:px-10 md:py-40"
    >
      <p className="text-xs tracking-[0.3em] text-[var(--accent)] uppercase">
        {EXPERIENCES.eyebrow}
      </p>
      <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--foreground)] md:text-6xl">
        {EXPERIENCES.title}
      </h2>

      <div className="mt-16">
        {EXPERIENCES.items.map((item) => (
          <article
            key={item.index}
            data-experience-row
            className="group grid grid-cols-1 gap-4 border-t border-[var(--border)] py-8 transition-colors duration-300 last:border-b md:grid-cols-[6rem_1fr_1fr_10rem] md:items-baseline md:gap-8"
          >
            <span className="font-[family-name:var(--font-display)] text-sm text-[var(--muted-foreground)]">
              {item.index}
            </span>
            <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--foreground)] transition-colors duration-300 group-hover:text-[var(--accent)] md:text-3xl">
              {item.title}
            </h3>
            <p className="max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
              {item.description}
            </p>
            <p className="text-xs tracking-[0.2em] text-[var(--muted-foreground)] uppercase md:text-right">
              {item.meta}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
