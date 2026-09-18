import Image from "next/image";
import GradientText from "../miscellaneous/gradient-text";
import { ENERGY_LISTS, TARGET_LISTS } from "../lib/constants";
import HoverText from "../miscellaneous/hover-text";
import { useEffect, useRef, useState } from "react";
import useInView from "../hooks/use-in-view";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { asset } from "../../_shared/cdn";

const IMAGES: string[] = [
  asset("voltline/energy-energy-3"),
  asset("voltline/energy-energy-2"),
  asset("voltline/energy-energy-1"),
];

export default function Energy() {
  const energyRef = useRef<HTMLDivElement>(null);
  const energyInView = useInView({ ref: energyRef, once: true });
  const [currentIdx, setCurrentIdx] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentIdx(1);
    }, 3000);
    return () => clearTimeout(timer);
  }, [currentIdx]);

  return (
    <section
      ref={energyRef}
      style={{
        transform: energyInView ? "none" : "translateY(100px)",
        opacity: energyInView ? 1 : 0,
        transition: "all 0.9s cubic-bezier(0.17, 0.55, 0.55, 1) 0.5s",
      }}
      className=" flex h-full w-full  flex-col  items-center justify-between gap-4   py-8 sm:gap-y-10  lg:flex-row lg:gap-16 lg:py-28 min-[1400px]:gap-20"
    >
      <div className="relative flex aspect-square h-full w-full max-w-[500px] items-center overflow-hidden rounded-2xl  md:max-w-[600px] lg:pt-0 xl:h-[600px] xl:max-w-[50%]">
        {IMAGES.map((image, index) => (
          <Image
            key={index + image}
            src={image}
            alt="Target Users"
            width={600}
            height={600}
            loading="eager"
            quality={100}
            priority
            className={cn(
              "section-image aspect-square h-full  w-full translate-x-10 object-contain object-center opacity-0 transition-all duration-1000 md:object-fill",
              index === currentIdx - 1
                ? "relative translate-x-0 opacity-100 duration-500"
                : "pointer-events-none absolute translate-x-20 opacity-0 duration-300  lg:translate-x-40",
            )}
          />
        ))}
      </div>

      <div className="md:pb-x bg-black/20x lg: flex h-full flex-col items-between justify-between gap-5 gap-y-6  lg:h-full  lg:gap-y-24 min-[1100px]:h-[430px] min-[1100px]:gap-y-32  xl:h-[600px] xl:max-w-[50%] xl:py-4 xl:pb-20">
        <div className=" flex w-full flex-col justify-start gap-y-3 ">
          {ENERGY_LISTS.map((list) => (
            <HoverText
              index={currentIdx}
              key={list.id}
              text={list.label}
              listId={list.id}
              onclick={() => setCurrentIdx(list.id!)}
              onMouseEnter={() => setCurrentIdx(list.id!)}
            />
          ))}
        </div>
        <div className=" flex flex-col gap-4 ">
          <GradientText
            text="Energy Saving Transfer"
            bgColor="bg-[var(--surface-white)]"
          />

          <div className="flex-col items-start justify-start">
            <p className="font-normal leading-relaxed tracking-wide  text-neutral-600  min-[350px]:text-lg lg:text-xl xl:text-2xl">
              Our platform is tailor-made to simplify and enhance your charging
              infrastructure experience for the following persons.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
