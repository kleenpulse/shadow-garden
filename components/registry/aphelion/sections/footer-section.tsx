"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { BRAND, FOOTER } from "../lib/constants";

gsap.registerPlugin(ScrollTrigger);

// The close: the booking claim at display size over the open starfield, then
// the practical footer. The oversized wordmark at the very bottom runs at 20vw
// and clips below the fold line on purpose — a horizon, not a logo.

export default function FooterSection() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;
      gsap.fromTo(
        "[data-footer-reveal]",
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: { trigger: ref.current, start: "top 75%" },
        },
      );
    },
    { scope: ref, dependencies: [still] },
  );

  return (
    <footer ref={ref} id="book" className="relative z-10 overflow-hidden">
      <div className="mx-auto w-full max-w-[90rem] px-6 pt-28 pb-16 md:px-10 md:pt-40">
        <p
          data-footer-reveal
          className="text-xs tracking-[0.3em] text-[var(--accent)] uppercase"
        >
          {FOOTER.cta.eyebrow}
        </p>
        <h2
          data-footer-reveal
          className="mt-6 font-[family-name:var(--font-display)] text-6xl leading-none text-[var(--foreground)] md:text-9xl"
        >
          {FOOTER.cta.title}
        </h2>
        <a
          data-footer-reveal
          href={FOOTER.cta.href}
          className="group mt-10 inline-flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] px-6 py-3 text-sm tracking-wide text-[var(--foreground)] transition-colors duration-300 hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {FOOTER.cta.action}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </a>

        <div
          data-footer-reveal
          className="mt-24 flex flex-wrap items-start justify-between gap-8 border-t border-[var(--border)] pt-8"
        >
          <div className="flex flex-col gap-2">
            {FOOTER.contact.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm text-[var(--muted-foreground)] transition-colors duration-200 hover:text-[var(--foreground)]"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-2 md:text-right">
            {FOOTER.meta.map((item) => (
              <p key={item.label} className="text-sm text-[var(--muted-foreground)]">
                {item.label}
              </p>
            ))}
          </div>
        </div>

        <p className="mt-10 text-[10px] tracking-wide text-[var(--muted-foreground)]">
          {FOOTER.smallPrint}
        </p>
      </div>

      <p
        aria-hidden="true"
        className="pointer-events-none -mb-[4vw] block text-center font-[family-name:var(--font-display)] text-[20vw] leading-none tracking-[0.1em] text-[color-mix(in_srgb,var(--foreground)_7%,transparent)] select-none"
      >
        {BRAND.wordmark}
      </p>
    </footer>
  );
}
