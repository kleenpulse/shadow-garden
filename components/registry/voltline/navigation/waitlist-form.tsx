/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { FormEvent, useEffect, useState, useTransition } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { useVoltline } from "../lib/voltline-context";
import Link from "next/link";
import { addToWaitlist } from "../lib/waitlist";
import SendMessageModal from "../modal/send-message-modal";
import ErrorMessage from "../miscellaneous/error-message";
import { ArrowUpRight, LoaderCircle } from "lucide-react";

const WaitlistForm = ({
  isTerms,
  useDarkText,
}: {
  isTerms?: boolean;
  useDarkText?: boolean;
}) => {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");

  const [errorMessage, setErrorMessage] = useState("");

  const isValidMail = email.match(
    /^([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})$/,
  );

  const { setContactModal, hideNav } = useVoltline();
  useEffect(() => {
    if (hideNav) {
      setContactModal(false);
    }
  }, [hideNav]);

  const handleEmailSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage("");

    startTransition(() => {
      addToWaitlist(email).then((data) => {
        if (data?.status === 400) {
          setErrorMessage(data?.message);
          return;
        }
        if (data?.status === 200) {
          setContactModal(true);

          setEmail("");
        }
      });
    });
  };

  return (
    <>
      <div className="flex w-full max-w-[513px] flex-col gap-y-4 sm:gap-2">
        <div className="h-[56px] w-full rounded-full bg-gradient-to-r from-[#121559] via-[#B42033] to-[#B42033] p-[1px] sm:h-[72px]">
          <form
            onSubmit={handleEmailSubmit}
            className="flex h-full  w-full items-center justify-between rounded-full bg-white p-3 text-xl uppercase text-[var(--surface-white)]"
          >
            <input
              type="email"
              name="email"
              id="email"
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              value={email}
              placeholder="Enter your email to join waitlist"
              className="w-full border-0 bg-transparent px-2 text-base font-normal leading-relaxed tracking-wide text-neutral-600 outline-0 placeholder:text-xs sm:placeholder:text-base md:text-lg"
            />
            <Button
              size="icon"
              type={isValidMail && !isPending ? "submit" : "button"}
              className="group/btn h-[40px] w-full max-w-[40px] rounded-full text-white sm:h-[48px] sm:max-w-[48px]"
            >
              {isPending ? (
                <LoaderCircle className="animate-spin text-2xl" />
              ) : (
                <ArrowUpRight className="transform-gpu text-2xl transition-transform duration-300 group-hover/btn:-translate-y-1 group-hover/btn:translate-x-1" />
              )}
            </Button>
          </form>
        </div>
        {errorMessage.length > 0 && <ErrorMessage errorMsg={errorMessage} />}

        <span
          className={cn(
            "  text-centerx text-xs font-[300] tracking-wide",
            isTerms ? "inline-block" : "hidden",
            useDarkText
              ? "text-[var(--almost-black)] lg:text-base"
              : "text-[var(--surface-white)]",
          )}
        >
          By clicking Join Waitlist you&apos;re confirming that you agree with
          our
          <Link
            href="/terms"
            className="ml-[2px]  block underline outline-offset-2"
          >
            Terms and Conditions.
          </Link>
        </span>
      </div>
    </>
  );
};

export default WaitlistForm;
