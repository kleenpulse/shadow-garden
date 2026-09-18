/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import Image from "next/image";

import { useVoltline } from "../lib/voltline-context";
import { useEffect, useRef } from "react";
import useInView from "../hooks/use-in-view";
import HeroButtons from "../shared/hero-buttons";
import { asset } from "../../_shared/cdn";

export default function Hero() {
  const { setIsHeroInView } = useVoltline();
  const heroRef = useRef<HTMLDivElement | null>(null);
  const heroInView = useInView({ ref: heroRef, once: false });

  useEffect(() => {
    if (heroInView) {
      setIsHeroInView(true);
    } else {
      setIsHeroInView(false);
    }
  }, [heroInView]);

  return (
    <section
      ref={heroRef}
      className="data-hero  md:  relative max-h-[700px] items-center  bg-black/10 min-[305px]:max-h-[1200px] "
      data-hero
      data-main-hero
    >
      <Image
        src={asset("voltline/ev-car")}
        alt="Hero Background Image"
        width={1920}
        quality={100}
        height={1080}
        className="hero-image sticky top-0 h-screen  w-full bg-blue-600/90 object-cover md:max-h-[1200px]"
      />

      <section className="relative top-0  z-10 flex max-h-[700px] w-full -translate-y-full items-center gap-y-8 px-5  max-[2000px]:min-h-screen  md:max-h-[1200px] md:px-16  min-[1350px]:h-[70vh] min-[2000px]:h-[100vh] ">
        <div
          data-hero-content
          className="relative flex h-full w-full flex-col items-start justify-between md:justify-center lg:max-w-[768px]"
        >
          <div className="relative z-10 flex w-full flex-col items-start gap-y-5 pt-6 font-[family-name:var(--font-display)] min-[450px]:gap-y-8 min-[450px]:pt-0  ">
            <h1 className="font-[family-name:var(--font-display)] text-[56px] font-semibold leading-[48px] text-[var(--surface-white)] min-[430px]:text-5xl  min-[430px]:leading-[67px] min-[450px]:font-medium lg:text-[56px]">
              Connecting EV Owners and Charging Station Owners
            </h1>
            <p className="font-[family-name:var(--font-display)] font-[300] tracking-wide text-[var(--surface-white)] max-lg:max-w-[500px] lg:text-lg">
              Voltline is the platform that brings together fleet operators and charging
              site hosts, enabling eco-friendly energy transfer for a
              sustainable future.
            </p>
          </div>
          <HeroButtons className="mt-10" />
        </div>
      </section>
    </section>
  );
}
