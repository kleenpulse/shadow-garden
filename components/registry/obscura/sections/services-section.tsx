"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { SERVICES } from "../lib/constants";

gsap.registerPlugin(ScrollTrigger);

// The price list, set like a colophon: numbered hairline rows, serif titles,
// mono descriptions. Hover pulls a row's title toward the safelight.

export default function ServicesSection() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;
      gsap.fromTo(
        "[data-service-row]",
        { opacity: 0, y: 28 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: { trigger: ref.current, start: "top 72%" },
        },
      );
    },
    { scope: ref, dependencies: [still] },
  );

  return (
    <section
      ref={ref}
      id="services"
      className="relative z-10 mx-auto w-full max-w-[90rem] px-6 py-28 md:px-10 md:py-40"
    >
      <p className="font-[family-name:var(--font-body)] text-xs tracking-[0.3em] text-[var(--accent)] uppercase">
        {SERVICES.eyebrow}
      </p>
      <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--foreground)] md:text-6xl">
        {SERVICES.title}
      </h2>

      <div className="mt-16">
        {SERVICES.items.map((item) => (
          <article
            key={item.index}
            data-service-row
            className="group grid grid-cols-1 gap-3 border-t border-[var(--border)] py-8 last:border-b md:grid-cols-[6rem_1fr_2fr] md:items-baseline md:gap-8"
          >
            <span className="font-[family-name:var(--font-body)] text-xs text-[var(--accent)]">
              {item.index}
            </span>
            <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--foreground)] transition-colors duration-300 group-hover:text-[var(--accent)] md:text-3xl">
              {item.title}
            </h3>
            <p className="max-w-lg font-[family-name:var(--font-body)] text-sm leading-relaxed text-[var(--muted-foreground)]">
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
