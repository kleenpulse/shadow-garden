"use client";

import { useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import Button from "../ui/button";
import FieldCanvas from "../gfx/field-canvas";
import { PRESETS } from "../gfx/field-shader";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";

gsap.registerPlugin(ScrollTrigger);

// The switcher.
//
// The source ran four stock video files: one playing full-bleed, one hidden at
// centre, and a third scaled down as a clickable preview of what came next.
// Clicking swapped them with a GSAP scale morph.
//
// The choreography is untouched. What changed is what fills the frames — four
// points on the shader's preset dial instead of four .mp4 files. That removes
// about thirty megabytes, the loading gate that used to sit in front of the page
// while the videos buffered, and the four simultaneous video decodes.

const CLIPS = [
  PRESETS.heroDawn,
  PRESETS.heroDusk,
  PRESETS.heroDeep,
  PRESETS.heroEmber,
];

export default function Hero() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasClicked, setHasClicked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const still = useStill();

  const upcomingIndex = (currentIndex + 1) % CLIPS.length;

  const handlePreviewClick = () => {
    setHasClicked(true);
    setCurrentIndex(upcomingIndex);
  };

  useGSAP(
    () => {
      if (!hasClicked || still) return;

      gsap.set("#next-field", { visibility: "visible" });
      gsap.to("#next-field", {
        transformOrigin: "center center",
        scale: 1,
        width: "100%",
        height: "100%",
        duration: 1,
        ease: "power1.inOut",
      });
      gsap.from("#current-field", {
        transformOrigin: "center center",
        scale: 0,
        duration: 1.5,
        ease: "power1.inOut",
      });
    },
    { dependencies: [currentIndex, still] },
  );

  useGSAP(
    () => {
      if (still) return;

      // The frame shears into a parallelogram as the page scrolls past it.
      gsap.set("#field-frame", {
        clipPath: "polygon(14% 0%, 72% 0%, 90% 90%, 0% 100%)",
        borderRadius: "0 0 40% 10%",
      });
      gsap.from("#field-frame", {
        clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        borderRadius: "0 0 0 0",
        duration: 1.5,
        ease: "power1.inOut",
        scrollTrigger: {
          trigger: "#field-frame",
          start: "center center",
          end: "bottom center",
          scrub: true,
        },
      });
    },
    { scope: containerRef, dependencies: [still] },
  );

  return (
    <div ref={containerRef} className="relative h-dvh w-screen overflow-x-hidden">
      {/* No loading gate. The shader has nothing to buffer, so the page is
          interactive on first paint rather than after four videos arrive. */}
      <div
        id="field-frame"
        className="relative z-10 h-dvh w-screen overflow-hidden rounded-lg bg-[var(--noctis-blue-75)]"
      >
        <div>
          {/* The preview: what you get if you click. */}
          <div className="mask-clip-path absolute-center absolute z-50 size-64 cursor-pointer overflow-hidden rounded-lg">
            <div
              onClick={handlePreviewClick}
              role="button"
              tabIndex={0}
              aria-label="Show the next scene"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handlePreviewClick();
                }
              }}
              className="origin-center scale-50 opacity-0 transition-all duration-500 ease-in hover:scale-100 hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100"
            >
              <FieldCanvas
                preset={CLIPS[upcomingIndex]!}
                className="size-64 origin-center scale-150 object-center"
              />
            </div>
          </div>

          {/* The one that grows into place on click. */}
          <FieldCanvas
            id="next-field"
            preset={CLIPS[currentIndex]!}
            className="absolute-center invisible absolute z-20 size-64"
          />

          {/* The full-bleed field behind everything. */}
          <FieldCanvas
            id="current-field"
            preset={CLIPS[currentIndex]!}
            className="absolute left-0 top-0 size-full"
          />
        </div>

        <h1 className="special-font hero-heading absolute bottom-5 right-5 z-40 text-[var(--noctis-blue-75)]">
          Wo<b>r</b>lds
        </h1>

        <div className="absolute left-0 top-0 z-40 size-full">
          <div className="mt-24 px-5 sm:px-10">
            <h1 className="special-font hero-heading text-[var(--noctis-blue-100)]">
              redefi<b>n</b>e
            </h1>
            <p className="mb-5 max-w-64 font-[family-name:var(--font-body)] text-[var(--noctis-blue-100)]">
              Enter the layer beneath the layer <br /> and take the whole board
            </p>
            <Button
              id="enter"
              title="Enter the realm"
              leftIcon={<ArrowUpRight />}
              containerClass="bg-[var(--noctis-yellow)] flex-center gap-1"
            />
          </div>
        </div>
      </div>

      <h1 className="special-font hero-heading absolute bottom-5 right-5 text-black">
        Wo<b>r</b>lds
      </h1>
    </div>
  );
}
