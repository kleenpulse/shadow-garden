"use client";

import { Faqs } from "../lib/constants";
import { cn } from "@/lib/utils";
import Image from "next/image";
import React, { useRef, useState } from "react";
import { Button } from "../ui/button";
import useInView from "../hooks/use-in-view";
import { Plus } from "lucide-react";
import { asset } from "../../_shared/cdn";

const FAQs = ({ isFaqsPage }: { isFaqsPage?: boolean }) => {
  const faqRef = useRef<HTMLDivElement>(null);
  const faqInView = useInView({ ref: faqRef, once: true });
  const [showFaqs, setShowFaqs] = useState(new Array(Faqs.length).fill(false));

  const toggleFaq = (index: number) => {
    const newShowFaqs = [...showFaqs];
    newShowFaqs[index] = !newShowFaqs[index];

    if (newShowFaqs[index]) {
      for (let i = 0; i < newShowFaqs.length; i++) {
        if (i !== index) {
          newShowFaqs[i] = false;
        }
      }
    }
    setShowFaqs(newShowFaqs);
  };

  return (
    <section
      ref={faqRef}
      style={{
        transform: faqInView ? "none" : "translateY(100px)",
        opacity: faqInView ? 1 : 0,
        transition: "all 0.9s cubic-bezier(0.17, 0.55, 0.55, 1) 0.5s",
      }}
      className="w-full py-8 md:py-20 "
    >
      <div className="flex w-full max-w-[600px] flex-col gap-y-6  lg:max-w-[768px]">
        <h2 className="font-[family-name:var(--font-display)] text-4xl font-medium text-[var(--tertiary)] lg:text-[56px]">
          FAQs
        </h2>
        <p className=" font-[family-name:var(--font-body)] text-lg font-normal text-[var(--tertiary)]">
          Find answers to common questions about our platform, its benefits for
          fleet operators, and the tools available for charging site hosts.
        </p>
      </div>

      <div className="relative mt-10 flex  flex-col md:mt-20 ">
        {Faqs.map((faq, index) => (
          <div
            key={faq.id}
            className="mb-4 flex w-full transform-gpu items-start justify-between gap-4 border-b border-[var(--soft-border)] pb-4 font-[family-name:var(--font-display)] text-[15px] text-[var(--tertiary)] lg:mb-6 xl:gap-8"
          >
            <div className="flex w-full flex-col items-start">
              <p
                tabIndex={0}
                role="button"
                aria-label="Toggle FAQ"
                aria-haspopup
                aria-expanded={showFaqs[index]}
                onClick={() => toggleFaq(index)}
                className="h-[50px] text-xl font-semibold transition-colors duration-300 hover:text-[var(--primary)] min-[500px]:text-2xl lg:text-[32px]"
              >
                {faq.question}{" "}
              </p>

              <p
                className={cn(
                  " grid  h-full w-full max-w-[60%] overflow-hidden  transition-all [&>span]:overflow-hidden ",
                  showFaqs[index]
                    ? "grid-rows-[1fr] duration-300"
                    : "grid-rows-[0fr] duration-500 ",
                )}
              >
                <span>{faq.answer}</span>
              </p>
            </div>

            <span
              tabIndex={0}
              role="button"
              aria-label="Toggle FAQ"
              aria-haspopup
              aria-expanded={showFaqs[index]}
              onClick={() => toggleFaq(index)}
              className={cn(
                "cursor-pointer select-none text-[28px] text-[var(--tertiary)] transition-transform duration-300",
                showFaqs[index] ? "rotate-45" : "",
              )}
            >
              <Plus />
            </span>
          </div>
        ))}
      </div>
      <div
        className={cn(
          "flex w-full flex-col justify-between gap-4 gap-y-8 rounded-3xl border-b-2 border-[var(--soft-border)] bg-[var(--card-rose)] px-4 py-6 shadow-[0_8px_8px_-4px_rgba(0,0,0,0.03),0_20px_24px_-4px_rgba(0,0,0,0.08)] md:h-[136px] md:flex-row md:items-center lg:px-8",
          isFaqsPage ? "mt-10 sm:mt-16" : "",
        )}
      >
        <div className="flex gap-x-6 font-[family-name:var(--font-display)] text-[var(--tertiary)] [&>p]:lg:text-lg">
          <Image
            src={asset("voltline/question-mark")}
            width={60}
            height={60}
            alt="question mark"
            className="h-[60px] w-[60px] flex-shrink-0 hover:animate-pulse"
          />
          <div className="flex flex-col">
            <h3 className="text-2xl font-semibold lg:text-3xl">
              Still have questions?
            </h3>
            <p>
              Can&apos;t find the answers you&apos;re looking for? Please chat
              to our friendly team.
            </p>
          </div>
        </div>
        <Button
          href="/contact"
          variant="outline"
          className="border-[var(--tertiary)] px-6 py-4 font-[family-name:var(--font-display)] text-[var(--tertiary)] min-[400px]:text-lg"
        >
          Get in touch
        </Button>
      </div>
    </section>
  );
};

export default FAQs;
