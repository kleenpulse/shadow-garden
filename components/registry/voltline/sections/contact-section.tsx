"use client";

import React, { useEffect, useRef, useState } from "react";
import ContactCard from "../card/contact-card";
import useInView from "../hooks/use-in-view";
import { usePathname } from "next/navigation";
import { Mail, MapPin, Phone } from "lucide-react";

const Contact = () => {
  const pathname = usePathname();
  const [hideContact, sethideContact] = useState(false);

  const contactRef = useRef<HTMLDivElement>(null);
  const contactInView = useInView({ ref: contactRef, once: true });

  useEffect(() => {
    if (pathname === "/terms" || pathname === "/privacy-policy") {
      sethideContact(true);
    } else {
      sethideContact(false);
    }
  }, [pathname]);

  return (
    <section
      ref={contactRef}
      style={{
        transform: contactInView ? "none" : "translateY(100px)",
        opacity: contactInView ? 1 : 0,
        transition: "all 0.9s cubic-bezier(0.17, 0.55, 0.55, 1) 0.5s",
      }}
      className="my-8 flex w-full flex-col  gap-y-12 px-4 py-6  min-[500px]:px-8 md:my-12 md:gap-8 lg:my-16  lg:px-16"
    >
      <div className="flex w-full max-w-[600px] flex-col gap-y-4  lg:max-w-[768px]">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--tertiary)] min-[500px]:text-4xl lg:text-[56px]">
          Have A Question Or Request?
        </h2>
        <p className=" font-[family-name:var(--font-display)] font-normal text-[var(--tertiary)] sm:text-lg">
          Easily reach us on any of the following addresses
        </p>
      </div>
      <div className="flex flex-col gap-8 lg:flex-row">
        <ContactCard
          icon={<Mail className="h-full w-full" />}
          title="Email"
          info="info@voltline.co"
          isLink
        />
        <ContactCard
          icon={<Phone className="h-full w-full" />}
          title="Support"
          info="+1 (555) 000-0000"
          isLink
        />
        <ContactCard
          icon={<MapPin className="h-full w-full" />}
          title="Office"
          info="16192 Coastal Hwy, Lewes, DE 19958"
          smalltext
        />
      </div>
    </section>
  );
};

export default Contact;
