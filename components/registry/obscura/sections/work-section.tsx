"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { WORK } from "../lib/constants";
import WorkItem from "../sub-sections/work-item";

gsap.registerPlugin(ScrollTrigger);

// The wall. A staggered two-column hang — alternating orientations and a
// vertical offset on the second column, the way prints are actually hung —
// with each print drifting up a little slower than the scroll (parallax via
// scrubbed ScrollTrigger, so it rides the same clock as everything else).

export default function WorkSection() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;

      gsap.fromTo(
        "[data-work-item]",
        { opacity: 0, y: 48 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: { trigger: ref.current, start: "top 70%" },
        },
      );

      // gentle parallax: each print drifts against the scroll
      const items = gsap.utils.toArray<HTMLElement>("[data-work-item]");
      for (const [index, item] of items.entries()) {
        gsap.to(item, {
          y: index % 2 === 0 ? -24 : -56,
          ease: "none",
          scrollTrigger: {
            trigger: item,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });
      }
    },
    { scope: ref, dependencies: [still] },
  );

  return (
    <section
      ref={ref}
      id="work"
      className="relative z-10 mx-auto w-full max-w-[90rem] px-6 py-28 md:px-10 md:py-40"
    >
      <p className="font-[family-name:var(--font-body)] text-xs tracking-[0.3em] text-[var(--accent)] uppercase">
        {WORK.eyebrow}
      </p>
      <h2 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--foreground)] md:text-6xl">
        {WORK.title}
      </h2>

      <div className="mt-20 grid grid-cols-1 gap-x-10 gap-y-20 md:grid-cols-2">
        {WORK.items.map((work, index) => (
          <div
            key={work.index}
            data-work-item
            className={index % 2 === 1 ? "md:mt-32" : undefined}
          >
            <WorkItem
              work={work}
              orientation={index % 3 === 0 ? "landscape" : "portrait"}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
