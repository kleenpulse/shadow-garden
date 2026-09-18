"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { ROOMS } from "../lib/constants";
import RoomCard from "../sub-sections/room-card";

gsap.registerPlugin(ScrollTrigger);

export default function RoomsSection() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;
      gsap.fromTo(
        "[data-room-card]",
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
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
      id="rooms"
      className="relative z-10 mx-auto w-full max-w-[90rem] px-6 py-28 md:px-10 md:py-40"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs tracking-[0.3em] text-[var(--accent)] uppercase">
            {ROOMS.eyebrow}
          </p>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--foreground)] md:text-6xl">
            {ROOMS.title}
          </h2>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
        {ROOMS.items.map((room) => (
          <div key={room.name} data-room-card>
            <RoomCard room={room} />
          </div>
        ))}
      </div>
    </section>
  );
}
