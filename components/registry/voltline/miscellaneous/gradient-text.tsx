import { cn } from "@/lib/utils";
import React from "react";

interface GradientProps {
  text: string;
  bgColor: string;
  className?: HTMLParagraphElement["className"];
}
const GradientText = ({ text, bgColor, className }: GradientProps) => {
  return (
    <p
      className={cn(
        "relative z-10 mt-1 flex w-[250px] max-w-max items-center justify-center rounded-full bg-gradient-to-r from-[#121559] via-[#B42033] to-[#B42033]   px-[1px] py-[1px] font-normal",
        className,
      )}
    >
      <span
        className={cn(
          "flex  h-full w-full items-center justify-center rounded-2xl   ",
          bgColor,
        )}
      >
        <span className="gradient-text via-[#5c0877]s h-full w-full rounded-2xl from-[#121559] to-[#B42033] bg-clip-text px-5  py-1 text-transparent">
          {text}
        </span>
      </span>
    </p>
  );
};

export default GradientText;
