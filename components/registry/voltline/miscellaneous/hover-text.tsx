import { cn } from "@/lib/utils";
import React, { Dispatch, SetStateAction } from "react";
import { ChevronRight } from "lucide-react";
interface Props {
  text: string;
  index?: number;
  listId?: number;
  onclick?: () => void;
  onMouseEnter?: () => void;
}
const HoverText = ({ text, index, listId, onclick, onMouseEnter }: Props) => {
  return (
    <span
      role="button"
      onClick={listId ? onclick : undefined}
      onMouseEnter={listId ? onMouseEnter : undefined}
      className={cn(
        " relative flex w-full max-w-max transform-gpu items-center justify-start gap-2 overflow-hidden border-b border-[var(--soft-border)] px-2 py-1 font-normal leading-9 text-[var(--header)] transition-transform duration-200 min-[350px]:text-lg  min-[380px]:text-xl xl:py-2 xl:text-2xl",
        index === listId
          ? "translate-x-4 font-semibold text-[var(--almost-black)] duration-500"
          : "",
      )}
    >
      <ChevronRight className="size-6 " />
      {text}
      <span
        className={cn(
          " absolute bottom-0 left-0 h-[1px] w-[0px] transition-all duration-700 ",
          index === listId
            ? "w-full bg-[var(--almost-black)] font-semibold duration-500"
            : "",
        )}
      />
    </span>
  );
};

export default HoverText;
