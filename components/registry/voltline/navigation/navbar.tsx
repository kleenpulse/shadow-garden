"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";
import { useVoltline } from "../lib/voltline-context";
import { Button } from "../ui/button";
import MobileNavbar from "./mobile-navbar";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { asset } from "../../_shared/cdn";

export default function Navbar() {
  const { hideNav, setOpenNavbar, openNavbar, isHeroInView, setActiveLink } =
    useVoltline();

  return (
    <nav
      className={cn(
        " backdrop-blur-mdx fixed top-0 z-[100] mx-auto flex w-full max-w-[1440px] transform-gpu items-center bg-white px-5 transition-all duration-300  md:px-16",
        hideNav ? "-translate-y-[150px]" : "-translate-y-0",
        isHeroInView
          ? "py-4 sm:bg-black/5"
          : " border-b border-[var(--primary)]/50 py-2 sm:bg-white",
      )}
    >
      <div className="flex w-full items-center  gap-4 sm:justify-between">
        <div className="flex items-center gap-x-3">
          <button
            onClick={() => setOpenNavbar(!hideNav)}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setOpenNavbar(!hideNav);
              }
            }}
            type="button"
            className="flex items-center "
          >
            {openNavbar ? (
              <X
                size={24}
                className={cn(
                  " cursor-pointer text-[var(--primary)] sm:h-10 sm:w-10 ",
                  isHeroInView
                    ? "sm:text-white"
                    : "text-[var(--primary)] sm:text-[var(--primary)]",
                )}
              />
            ) : (
              <>
                <Menu
                  className={cn(
                    "hidden h-10 w-10 cursor-pointer  sm:block",
                    isHeroInView ? "text-white" : "text-[var(--primary)]",
                  )}
                />
                <Menu
                  size={24}
                  className=" cursor-pointer text-[var(--primary)] sm:hidden"
                />
              </>
            )}
          </button>
          <Link
            href="/"
            onClick={() => {
              setActiveLink("");
              localStorage.removeItem("activeLink");
            }}
          >
            <Image
              className="w-[94px] sm:h-16 sm:w-44"
              src={asset("voltline/logo")}
              alt="Logo"
              width={172}
              height={60}
              quality={100}
            />
          </Link>
        </div>

        <div className=" hidden items-center sm:flex">
          <Button
            href="https://web.voltline.io/login"
            variant="link"
            className={cn(
              "tracking-wide transition-colors duration-700 sm:text-lg",
              isHeroInView ? "text-white" : "text-[var(--primary)]",
            )}
          >
            Login
          </Button>
          <Button
            href="https://web.voltline.io/register"
            size="ghost"
            className=" rounded-full px-4 py-1 tracking-wide text-[var(--surface-white)] sm:text-lg md:px-5 md:py-2"
          >
            Get Started
          </Button>
        </div>
      </div>

      <MobileNavbar />
    </nav>
  );
}
