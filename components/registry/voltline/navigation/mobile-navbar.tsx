/* eslint-disable react-hooks/exhaustive-deps */
import { NAV_LINKS } from "../lib/constants";
import { useVoltline } from "../lib/voltline-context";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAnimate, stagger, motion } from "motion/react";

const MobileNavbar = () => {
  const { openNavbar, setOpenNavbar, activeLink, setActiveLink, isHeroInView } =
    useVoltline();
  const [scope, animate] = useAnimate();

  // the stagger effect
  const staggerList = stagger(0.1, { startDelay: 0.25 });

  useEffect(() => {
    animate(
      "ul",
      {
        width: openNavbar ? 180 : 0,
        height: openNavbar ? 175 : 0,
        opacity: openNavbar ? 1 : 0,
      },
      {
        type: "spring",
        bounce: 0,
        duration: 0.4,
      },
    );
    animate(
      "li",
      openNavbar
        ? { opacity: 1, scale: 1, x: 0 }
        : { opacity: 0, scale: 0.3, x: -50 },
      {
        duration: 0.2,
        delay: openNavbar ? staggerList : 0,
      },
    );
  }, [openNavbar]);

  return (
    <>
      {openNavbar && (
        <div
          className="fixed left-0 top-0 z-[99] h-screen min-h-screen w-full cursor-default bg-black/25 opacity-0"
          role="dialog"
          onClick={() => setOpenNavbar(!openNavbar)}
        />
      )}
      <div className="absolute z-[999] w-full " ref={scope}>
        <ul
          className={cn(
            "absolute left-0 top-10 overflow-hidden bg-white pl-8 pt-1 shadow-lg shadow-black/20",
            isHeroInView ? "" : "border border-[var(--primary)]/50  sm:top-12",
          )}
          data-menu-ul
        >
          {NAV_LINKS.map((link, index) => (
            <motion.li key={index}>
              <Link
                href={`/${link.href}`}
                key={link.id}
                onClick={() => {
                  setActiveLink(link.href);
                  setOpenNavbar(false);
                }}
                className={cn(
                  "hover:text-accent-color relative w-fit text-sm font-[300] transition-colors duration-300",
                  {
                    "font-medium text-[var(--primary)]": activeLink === link.href,
                  },
                )}
              >
                {link.label}
                <span
                  tabIndex={-1}
                  aria-hidden
                  className={cn(
                    "absolute -bottom-2  left-1/2 h-[2px] w-full -translate-x-1/2 translate-y-2 transform rounded-tl-lg rounded-tr-lg border-none bg-[var(--primary)] opacity-0 outline-none transition-all duration-300 md:w-[120%]",
                    {
                      "translate-y-0 opacity-100": activeLink === link.href,
                    },
                  )}
                />
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </>
  );
};

export default MobileNavbar;
