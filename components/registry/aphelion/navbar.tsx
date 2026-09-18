"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { cn } from "@/lib/utils";
import { useGSAP } from "./hooks/use-gsap";
import { useStill } from "./hooks/use-still";
import { BRAND, NAV_CTA, NAV_LINKS } from "./lib/constants";

gsap.registerPlugin(ScrollTrigger);

// Fixed nav that gets out of the way: scrolling down slides it off, scrolling
// up brings it back. At the top of the page it sits transparent over the
// aurora; past the hero it grows a blurred backdrop so the links stay legible
// over the starfield.

export default function Navbar() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;
      const nav = ref.current;
      if (!nav) return;

      const slide = gsap
        .to(nav, { yPercent: -110, duration: 0.4, ease: "power2.out", paused: true })
        .progress(0);

      ScrollTrigger.create({
        start: "top top",
        end: "max",
        onUpdate: (self) => {
          if (self.scroll() < 80) {
            slide.reverse();
          } else if (self.direction === 1) {
            slide.play();
          } else {
            slide.reverse();
          }
        },
      });

      ScrollTrigger.create({
        start: "80 top",
        end: "max",
        onToggle: (self) => nav.toggleAttribute("data-scrolled", self.isActive),
      });
    },
    { scope: ref, dependencies: [still] },
  );

  return (
    <header
      ref={ref}
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-colors duration-300",
        "data-scrolled:bg-[color-mix(in_srgb,var(--background)_72%,transparent)] data-scrolled:backdrop-blur-md",
      )}
    >
      <nav className="mx-auto flex max-w-[90rem] items-center justify-between px-6 py-5 md:px-10">
        <a
          href="#top"
          className="font-[family-name:var(--font-display)] text-lg tracking-[0.35em] text-[var(--foreground)]"
        >
          {BRAND.wordmark}
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm tracking-wide text-[var(--muted-foreground)] transition-colors duration-200 hover:text-[var(--foreground)]"
            >
              {link.label}
            </a>
          ))}
        </div>

        <a
          href={NAV_CTA.href}
          className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm tracking-wide text-[var(--foreground)] transition-colors duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {NAV_CTA.label}
        </a>
      </nav>
    </header>
  );
}
