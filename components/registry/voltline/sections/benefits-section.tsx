import LearnMoreCard from "../card/learn-more-card";
import { useRef } from "react";
import useInView from "../hooks/use-in-view";
import { ArrowRight } from "lucide-react";

export default function Benefits() {
  const benefitsRef = useRef<HTMLDivElement>(null);
  const benefitInView = useInView({ ref: benefitsRef, once: true });

  return (
    <div className=" flex   h-auto max-h-fit  w-full flex-col items-center justify-between gap-y-20 py-5  pt-10  sm:px-5 lg:px-0 xl:py-10 ">
      <div
        ref={benefitsRef}
        style={{
          transform: benefitInView ? "none" : "translateY(100px)",
          opacity: benefitInView ? 1 : 0,
          transition: "all 0.9s cubic-bezier(0.17, 0.55, 0.55, 1) 0.5s",
        }}
        className="flex  w-full flex-col gap-6 sm:gap-16  lg:flex-row xl:gap-20 "
      >
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold  leading-8 text-[var(--almost-black)] sm:text-[40px] sm:leading-[48px] lg:w-full lg:max-w-[50%]">
          Unlocking the Benefits we offer fleet operators and Charging Station Owners
        </h2>
        <p className="text-lg text-gray-500 lg:mt-2 lg:w-full lg:max-w-[50%]">
          Discover the advantages of using Voltline - A platform that connects EV
          owners and charging site hosts.
        </p>
      </div>

      <div className=" flex w-full  flex-col gap-8 lg:flex-row lg:gap-16  xl:gap-20 ">
        <LearnMoreCard
          cardTitle="EV Owners"
          btnBG="bg-teal-100"
          description="Navigate and monitor your charging sessions on the move. Stay connected to the EV community and make charging a breeze."
        />
        <LearnMoreCard
          cardTitle="Station Owners"
          btnBG="bg-[var(--card-rose)]"
          description="Navigate and monitor your charging sessions on the move, and Stay
              connected to the EV community and make charging a breeze."
        />
      </div>
    </div>
  );
}
