"use client";

import { cn } from "@/lib/utils";
import { useVoltline } from "../lib/voltline-context";
import { Button } from "../ui/button";
import Image from "next/image";
import confetti from "canvas-confetti";
import { useEffect } from "react";
import { asset } from "../../_shared/cdn";

const SendMessageModal = ({
  message,
  isWaitlist,
}: {
  message: string;
  isWaitlist?: boolean;
}) => {
  const { contactModal, setContactModal } = useVoltline();

  const handleCloseModal = () => {
    localStorage?.removeItem("contact-form");
    setContactModal(false);
  };

  useEffect(() => {
    if (contactModal && isWaitlist) {
      setTimeout(() => {
        confetti({
          ticks: 300,
          origin: {
            y: 0.7,
          },
          spread: 120,
          angle: 90,
          particleCount: 150,
          gravity: 0.5,
          zIndex: 9999,
        });
      }, 500);
    }
  }, [contactModal, isWaitlist]);

  return (
    <>
      <div
        aria-hidden
        className={cn(
          " fixed left-0 top-0 z-[110] min-h-screen w-full bg-[var(--primary)]/50  transition-all duration-300",
          contactModal ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={handleCloseModal}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleCloseModal();
          }
        }}
      />

      <div
        role="dialog"
        data-modal
        className={cn(
          "fixed   left-12 t/op-1/2 z-[999] flex h-[350px] w-[360px] -translate-x-1/2 -translate-y-1/2 select-none flex-col items-center opacity-0   backdrop-blur-lg transition-all  min-[450px]:w-[400px]  min-[550px]:w-[500px]   md:h-[400px] md:w-[600px]",
          contactModal
            ? "scale-100  rounded-xl opacity-100 duration-700 md:rounded-2xl "
            : " pointer-events-none scale-50 opacity-0 duration-300",
        )}
      >
        <div className="relative flex h-full  w-full flex-col items-center gap-y-5 rounded-xl bg-white/90 pt-8 backdrop-blur-xl  md:gap-y-8 md:rounded-2xl">
          <Image
            src={asset("voltline/logo")}
            height={50}
            width={150}
            alt="logo"
            className="absolute left-2 top-2  w-[100px]  md:w-[200px]"
          />
          <div className="flex min-h-[100px] w-full items-center justify-center gap-x-4 sm:px-8 md:h-[150px]">
            {contactModal && (
              <svg
                stroke="currentColor"
                fill="currentColor"
                strokeWidth="0"
                viewBox="0 0 512 512"
                height="200px"
                width="200px"
                className="md:w-[200px h-[150px] w-[150px] md:h-[200px]"
                xmlns="http://www.w3.org/2000/svg"
                id="success-svg"
              >
                <path d="M170.718 216.482L141.6 245.6l93.6 93.6 208-208-29.118-29.118L235.2 279.918l-64.482-63.436zM422.4 256c0 91.518-74.883 166.4-166.4 166.4S89.6 347.518 89.6 256 164.482 89.6 256 89.6c15.6 0 31.2 2.082 45.764 6.241L334 63.6C310.082 53.2 284.082 48 256 48 141.6 48 48 141.6 48 256s93.6 208 208 208 208-93.6 208-208h-41.6z" />
              </svg>
            )}
          </div>
          <div className="flex w-full flex-col items-center gap-y-2">
            <h2 className="text-xl font-medium uppercase text-[var(--primary)] md:text-2xl lg:text-4xl lg:font-bold">
              {isWaitlist ? "Thank you!" : "Message Sent!"}
            </h2>
            <p className="text-[var(--primary)] sm:text-xl">{message}</p>
            <Button
              size="lg"
              onClick={handleCloseModal}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleCloseModal();
                }
              }}
              useGsap
              className="font-[family-name:var(--font-display)] tracking-wide sm:text-xl md:mt-2 lg:mt-4 lg:rounded-xl"
            >
              Okay!
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SendMessageModal;
