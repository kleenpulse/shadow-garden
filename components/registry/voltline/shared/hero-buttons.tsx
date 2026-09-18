import React from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
interface Props {
  className?: HTMLDivElement["className"];
}

const HeroButtons = ({ className }: Props) => {
  return (
    <div
      className={cn(
        " flex w-full flex-col items-start  gap-y-6 md:flex-row md:items-center md:gap-x-6",
        className,
      )}
    >
      <Button
        variant="outline"
        href="https://web.voltline.io/map"
        className="group/btn w-full items-center border-none bg-[#CD0C0C] p-3 px-5 font-[family-name:var(--font-display)] text-lg font-[300] tracking-wide text-[var(--surface-white)] max-md:max-w-[350px]  sm:flex md:py-4 lg:py-6"
      >
        <span className="flex w-full items-center gap-x-2 md:text-2xl">
          Search For EV Station
          {/* <ArrowUpRight className="transform-gpu text-2xl transition-transform duration-300 group-hover/btn:-translate-y-1 group-hover/btn:translate-x-1" /> */}
        </span>
      </Button>
      <Button
        href="/contact"
        variant="outline"
        className="group/btn w-full  items-center p-3 px-5 font-[family-name:var(--font-display)] font-[300]  tracking-wide text-[var(--surface-white)] max-md:max-w-[350px] sm:flex  md:py-4 lg:py-6"
      >
        <span className="flex w-full items-center gap-x-2 text-lg md:text-2xl ">
          List Your Station
        </span>
      </Button>
    </div>
  );
};

export default HeroButtons;
