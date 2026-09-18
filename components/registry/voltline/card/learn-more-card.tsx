import React, { useRef } from "react";
import { Button } from "../ui/button";
import GradientText from "../miscellaneous/gradient-text";
import { cn } from "@/lib/utils";
import useInView from "../hooks/use-in-view";
import { ArrowRight, ArrowUpRight } from "lucide-react";

type LearnMoreCardProps = {
  btnBG: string;
  description: string;
  cardTitle: string;
};
const LearnMoreCard = ({
  btnBG,
  description,
  cardTitle,
}: LearnMoreCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const cardInView = useInView({ ref: cardRef, once: true });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { currentTarget: target } = e;

    const rect = target?.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    target.style.setProperty("--border--x", `${x}px`);
    target.style.setProperty("--border--y", `${y}px`);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      style={{
        transform: cardInView ? "none" : "translateY(100px)",
        opacity: cardInView ? 1 : 0,
        transition: "all 0.9s cubic-bezier(0.17, 0.55, 0.55, 1) 0.5s",
      }}
      className={cn(
        "card relative flex h-[270px] max-h-max items-center justify-center rounded-xl  border-b-[3px] border-[var(--soft-border)] p-[2px] opacity-30 shadow-md transition-all  duration-500 hover:shadow-[0_8px_30px_0px_rgba(0,0,0,0.2)] hover:duration-300 sm:rounded-3xl md:h-[300px]",
        btnBG,
      )}
    >
      <div className="card-border" />
      <div
        className={cn(
          "card-content flex h-full w-full flex-col items-start justify-between rounded-xl p-5  min-[500px]:p-4 sm:rounded-3xl sm:p-7 lg:p-5 xl:p-8",
          btnBG,
        )}
      >
        <GradientText text={cardTitle} bgColor={btnBG} />
        <h3 className="mt-4 font-[family-name:var(--font-display)] font-normal text-gray-600 min-[500px]:text-lg min-[500px]:leading-9 sm:text-xl lg:text-2xl">
          {description}
        </h3>

        <Button
          size="link"
          variant="link"
          className="group/btn  flex items-center  gap-x-1 font-normal text-indigo-600  min-[500px]:gap-x-2 sm:text-xl md:text-2xl"
        >
          <span className="flex w-full items-center gap-x-2 ">
            Learn more
            <ArrowUpRight className="transform-gpu text-xl transition-transform duration-300 group-hover/btn:-translate-y-1 group-hover/btn:translate-x-1 sm:text-2xl" />
          </span>
        </Button>
      </div>
    </div>
  );
};

export default LearnMoreCard;
