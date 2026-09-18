"use client";

import { useRef } from "react";
import WaitlistForm from "../navigation/waitlist-form";
import useInView from "../hooks/use-in-view";
import { cn } from "@/lib/utils";

export default function Waitlist({ evPage }: { evPage?: boolean }) {
  const waitRef = useRef<HTMLDivElement>(null);
  const waitInView = useInView({ ref: waitRef, once: true });

  return (
    <section
      ref={waitRef}
      style={{
        transform: waitInView ? "none" : "translateY(100px)",
        opacity: waitInView ? 1 : 0,
        transition: "all 0.9s cubic-bezier(0.17, 0.55, 0.55, 1) 1s",
      }}
      className={cn(
        "flex h-[340px] w-full items-center   bg-[#F2F5F9] px-3  min-[500px]:px-8  lg:px-16 ",
        evPage ? "-mt-6 pt-6" : "",
      )}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-8 md:flex-row md:items-start md:justify-between">
        <h1 className="w-full font-[family-name:var(--font-display)] text-3xl font-semibold text-gray-900 max-md:text-center lg:max-w-[50%] lg:text-[48px] lg:leading-[58px]">
          Join the Exclusive Waitlist Today!
        </h1>

        <WaitlistForm useDarkText isTerms />
      </div>
    </section>
  );
}
