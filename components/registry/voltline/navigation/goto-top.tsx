"use client";

import { useVoltline } from "../lib/voltline-context";
import useWindowHeight from "../hooks/use-window-height";
import { cn } from "@/lib/utils";

import React, { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

const GotoTop = () => {
  const { hideNav } = useVoltline();
  const { scrollY } = useWindowHeight();

  const [hideToTop, setHideToTop] = useState(false);
  useEffect(() => {
    let prevScrollpos = window.scrollY;
    // console.log("PREV", prevScrollpos);
    window.onscroll = () => {
      const currentScrollPos = window.scrollY;

      if (prevScrollpos >= currentScrollPos) {
        setHideToTop(false);
      } else {
        setHideToTop(true);
      }
      prevScrollpos = currentScrollPos;
    };
  }, []);

  const handleTop = () => {
    window && window.scroll({ top: 0, behavior: "smooth" });
  };

  return hideToTop ? null : (
    <div
      role="button"
      onClick={handleTop}
      className={cn(
        " fixed bottom-12 right-2    z-[9999] mx-auto  flex max-w-[1440px] select-none  items-center rounded border border-[var(--primary)] bg-[var(--primary)]/90 text-2xl text-white backdrop-blur-xl  transition-all duration-1000 active:scale-95 active:duration-300 max-[400px]:bottom-16 sm:bottom-10 sm:right-5 sm:text-4xl",
        scrollY > 1200
          ? "translate-x-0 opacity-100 shadow-[0_0_40px_0_rgba(0,0,0,0.16)]"
          : "translate-x-20 opacity-0",
        hideNav && "hidden",
      )}
    >
      <ChevronUp />
    </div>
  );
};

export default GotoTop;
