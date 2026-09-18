import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function Button({
  title,
  id,
  leftIcon,
  rightIcon,
  containerClass,
}: {
  title: string;
  id?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClass?: string;
}) {
  return (
    <button
      id={id}
      className={cn(
        "group relative z-10 w-fit cursor-pointer overflow-hidden rounded-full bg-[var(--noctis-violet-50)] px-7 py-3 text-black",
        containerClass,
      )}
    >
      {leftIcon}
      <span className="relative inline-flex overflow-hidden font-[family-name:var(--font-mono)] text-xs uppercase">
        <span>{title}</span>
      </span>
      {rightIcon}
    </button>
  );
}
