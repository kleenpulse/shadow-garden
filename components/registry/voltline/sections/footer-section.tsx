"use client";

import { FOO_LINKS } from "../lib/constants";
import Link from "next/link";
import React, { useRef } from "react";
import WaitlistForm from "../navigation/waitlist-form";
import Image from "next/image";
import useInView from "../hooks/use-in-view";
import { Button } from "../ui/button";
import { asset } from "../../_shared/cdn";
type Props = {
  href: string;
  label: string;
};
const SOME_LINKS: Props[] = [
  {
    href: "/privacy-policy",
    label: "Privacy Policy",
  },
  {
    href: "/terms",
    label: "Terms of Service",
  },
  {
    href: "/cookies",
    label: "Cookies Policy",
  },
];

const Foobar = () => {
  const fooRef = useRef<HTMLDivElement>(null);
  const fooInView = useInView({ ref: fooRef, once: true });

  return (
    <section
      ref={fooRef}
      style={{
        opacity: fooInView ? 1 : 0,
        transition: "all 0.9s cubic-bezier(0.17, 0.55, 0.55, 1) 0.5s",
      }}
      className="relative my-10 flex w-full flex-col gap-y-8 px-4 min-[500px]:px-8  lg:my-20 lg:px-16"
    >
      <div className="flex w-full flex-wrap items-center justify-center gap-5">
        {FOO_LINKS.map((link) => (
          <Link
            className="rounded-lg border  border-yellow-300 px-3 py-2 font-[family-name:var(--font-display)] text-[var(--almost-black)] transition-colors duration-300 hover:border-[var(--primary)] hover:text-[var(--primary)] lg:text-lg lg:font-medium"
            key={link.id}
            href={link.href}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex w-full  flex-col items-center gap-y-8">
        <h2 className="w-full max-w-[759px] text-center font-[family-name:var(--font-display)] text-2xl text-[20px] font-semibold text-[var(--tertiary)] sm:lg:text-[32px] lg:leading-10">
          Let us unleash our creativity and expertise to create designs that
          deliver extraordinary results.
        </h2>

        <WaitlistForm />
      </div>

      <div className="flex w-full flex-col items-center justify-between gap-y-8 border-b border-[var(--almost-black)] pb-2 md:flex-row ">
        <Link href="/">
          <Image src={asset("voltline/logo")} alt="logo footer" width={173} height={60} />
        </Link>
        <div className="flex flex-wrap  justify-center gap-x-5 gap-y-4">
          {SOME_LINKS.map((link) => (
            <Link
              className="font-[family-name:var(--font-display)] text-[var(--almost-black)] underline underline-offset-2 transition-colors duration-300 hover:text-[var(--primary)]"
              key={link.href}
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Foobar;
