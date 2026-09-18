"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { STORY } from "../lib/constants";

gsap.registerPlugin(ScrollTrigger);

export default function StorySection() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;
      gsap.fromTo(
        "[data-story-reveal]",
        { opacity: 0, y: 28 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          stagger: 0.15,
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
      id="story"
      className="relative z-10 mx-auto w-full max-w-[90rem] px-6 py-28 md:px-10 md:py-40"
    >
      <p data-story-reveal className="text-xs tracking-[0.3em] text-[var(--accent)] uppercase">
        {STORY.eyebrow}
      </p>
      <h2
        data-story-reveal
        className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--foreground)] md:text-6xl"
      >
        {STORY.title}
      </h2>

      <blockquote
        data-story-reveal
        className="mt-16 max-w-4xl font-[family-name:var(--font-display)] text-2xl leading-snug text-[var(--foreground)] italic md:text-4xl"
      >
        “{STORY.quote}”
      </blockquote>

      <div className="mt-16 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
        {STORY.paragraphs.map((paragraph, index) => (
          <p
            key={index}
            data-story-reveal
            className="text-sm leading-relaxed text-[var(--muted-foreground)]"
          >
            {paragraph}
          </p>
        ))}
      </div>

      <p
        data-story-reveal
        className="mt-12 text-xs tracking-[0.3em] text-[var(--muted-foreground)] uppercase"
      >
        — {STORY.signature}
      </p>
    </section>
  );
}
