"use client";

import { useRef } from "react";

import { SOCIALS } from "../lib/constants";
import { Button } from "../ui/button";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// The closing section.
//
// New. It carries the `trade-now` anchor the navbar has always linked to, and it
// is the only place the SOCIALS list — also already written and also rendering
// nowhere — actually appears.

export default function FooterSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;

      gsap.from(".footer__mark", {
        yPercent: 40,
        opacity: 0,
        duration: 1.1,
        ease: "power3.out",
        scrollTrigger: { trigger: sectionRef.current, start: "top 80%" },
      });
    },
    { scope: sectionRef, dependencies: [still] },
  );

  return (
    <footer
      ref={sectionRef}
      id="trade-now"
      className="relative z-10 w-full overflow-hidden bg-black px-4 pb-12 pt-24 sm:px-8 md:pt-32 lg:px-16"
    >
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="flex flex-col items-center gap-8 border-b border-white/10 pb-20 text-center">
          <h2 className="max-w-[18ch] text-4xl font-black uppercase leading-[0.95] text-white sm:text-6xl md:text-7xl">
            Claim a guardian
          </h2>
          <p className="max-w-[46ch] text-base font-light text-white/60 sm:text-lg">
            888 in total, three designs, one chance each. When they are gone the
            contract closes and nothing further is minted.
          </p>

          <Button
            variant="default"
            size="lg"
            className="mt-2 rounded-full px-10 text-base font-bold uppercase tracking-wide"
          >
            Trade now
          </Button>

          <ul className="mt-6 flex items-center gap-3">
            {SOCIALS.map((social) => {
              const Icon = social.icon;
              return (
                <li key={social.id}>
                  <a
                    href={social.link}
                    target="_blank"
                    rel="noreferrer"
                    // The label is generic on purpose: these are placeholders a
                    // buyer replaces with their own platforms.
                    aria-label={`Community link ${social.id}`}
                    className="grid size-11 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-[hsl(var(--primary-red))] hover:text-[hsl(var(--primary-red))]"
                  >
                    <Icon className="size-5" />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Oversized wordmark, clipped by the fold — the page's last gesture. */}
        <div className="pointer-events-none select-none overflow-hidden pt-16">
          <p
            aria-hidden
            className="footer__mark whitespace-nowrap text-center text-[19vw] font-black leading-[0.8] tracking-tighter text-white/[0.06]"
          >
            JINLONG
          </p>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 pt-10 text-xs text-white/40 sm:flex-row">
          <p>© {new Date().getFullYear()} Jinlong. All rights reserved.</p>
          <p className="font-mono uppercase tracking-[0.25em]">金龍 · 888</p>
        </div>
      </div>
    </footer>
  );
}
