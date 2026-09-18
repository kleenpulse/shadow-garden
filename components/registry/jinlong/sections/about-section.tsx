"use client";

import { useRef } from "react";
import Image from "next/image";

import { CHARACTERS } from "../lib/characters";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// The story section.
//
// New. The source shipped a single-screen hero and nothing under it — the nav
// pointed at anchors that did not exist, so every link scrolled nowhere. This is
// the first of the three sections that give the page somewhere to go.

export default function AboutSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;

      gsap.from(".about__line", {
        yPercent: 120,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: sectionRef.current, start: "top 75%" },
      });

      // The three plates drift up at slightly different rates, which reads as
      // depth without needing a parallax library.
      gsap.utils.toArray<HTMLElement>(".about__plate").forEach((plate, i) => {
        gsap.to(plate, {
          yPercent: -12 - i * 6,
          ease: "none",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top bottom",
            end: "bottom top",
            scrub: 1,
          },
        });
      });
    },
    { scope: sectionRef, dependencies: [still] },
  );

  return (
    <section
      ref={sectionRef}
      id="about"
      className="relative z-10 w-full overflow-hidden bg-black px-4 py-24 sm:px-8 md:py-32 lg:px-16"
    >
      <div className="mx-auto grid w-full max-w-[1400px] gap-16 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.35em] text-[hsl(var(--primary-red))]">
            金 龍 · The Golden Dragon
          </p>

          {/* Each line is its own element so the stagger has something to stagger. */}
          <h2 className="max-w-[16ch] text-4xl font-black uppercase leading-[0.95] text-white sm:text-6xl md:text-7xl">
            <span className="block overflow-hidden">
              <span className="about__line block">Fortune</span>
            </span>
            <span className="block overflow-hidden">
              <span className="about__line block text-[hsl(var(--primary-red))]">
                favours
              </span>
            </span>
            <span className="block overflow-hidden">
              <span className="about__line block">the bold</span>
            </span>
          </h2>

          <div className="mt-8 max-w-[52ch] space-y-5 text-base font-light leading-relaxed text-white/70 sm:text-lg">
            <p className="about__line">
              Three guardians, cast in gold and vermillion, drawn from the old
              stories about where luck comes from and who is allowed to carry it.
            </p>
            <p className="about__line">
              Each one is hand-illustrated and minted once. No editions, no
              re-issues — when a guardian is claimed, that is the end of it.
            </p>
          </div>

          <dl className="mt-12 grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
            {[
              ["3", "Guardians"],
              ["888", "Total supply"],
              ["0%", "Creator fee"],
            ].map(([value, label]) => (
              <div key={label} className="about__line">
                <dt className="text-3xl font-black text-white sm:text-4xl">
                  {value}
                </dt>
                <dd className="mt-1 text-xs uppercase tracking-widest text-white/50">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative grid grid-cols-3 gap-3 sm:gap-5">
          {CHARACTERS.map((character, index) => (
            <div
              key={character}
              className="about__plate relative aspect-2/3 overflow-hidden rounded-2xl border border-white/10 bg-linear-to-b from-white/10 to-transparent"
              // Staggered start positions, so the drift has somewhere to go and
              // the trio never sits on one flat line.
              style={{ marginTop: `${index * 28}px` }}
            >
              <Image
                src={character}
                alt=""
                aria-hidden
                fill
                sizes="(max-width: 1024px) 33vw, 16vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
