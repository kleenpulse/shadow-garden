import useInView from "../hooks/use-in-view";
import Image from "next/image";
import { useRef } from "react";
import { asset } from "../../_shared/cdn";

export default function Solutions() {
  const solutionsRef = useRef<HTMLDivElement>(null);
  const solutionsInView = useInView({ ref: solutionsRef, once: true });
  const solutionImgRef = useRef<HTMLDivElement>(null);
  const solutionImgInView = useInView({ ref: solutionImgRef, once: true });

  return (
    <section className="flex h-auto w-full flex-col items-center justify-center gap-4  overflow-hidden  bg-[#f4fbf8] px-5 py-8 sm:gap-20 sm:py-28">
      <div
        ref={solutionsRef}
        style={{
          transform: solutionsInView ? "none" : "translateY(100px)",
          opacity: solutionsInView ? 1 : 0,
          transition: "all 0.9s cubic-bezier(0.17, 0.55, 0.55, 1) 0.5s",
        }}
        className="flex w-full flex-col gap-4 text-center  "
      >
        <h1 className="text-2xl font-semibold text-gray-900 sm:text-5xl  ">
          Robust EV Solutions
        </h1>

        <p className=" mx-auto w-full  max-w-[600px] text-lg font-normal text-gray-600 sm:text-2xl xl:max-w-[700px]">
          With Voltline, you can easily transfer energy from your home energy
          savings to power your electric vehicle.
        </p>
      </div>

      <div
        ref={solutionImgRef}
        style={{
          transform: solutionsInView ? "none" : "translateY(100px)",
          opacity: solutionsInView ? 1 : 0,
          transition: "all 0.9s cubic-bezier(0.17, 0.55, 0.55, 1) 0.7s",
        }}
        className="relative"
      >
        <Image
          src={asset("voltline/dashboard")}
          width={2000}
          height={1000}
          alt="Electric vehicle"
          className="hidden w-full rounded-b-3xl sm:block"
        />
        <Image
          src={asset("voltline/evmobile")}
          width={281}
          height={562}
          quality={100}
          alt="Electric vehicle"
          className="  sm:hidden"
        />
      </div>
    </section>
  );
}
