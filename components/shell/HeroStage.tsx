"use client";

import { useEffect, useState } from "react";
import Threads from "@/components/registry/threads/Threads";

// Ambient hero backdrop — the real OGL Threads component, tinted Shadow Garden purple.
export default function HeroStage() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 opacity-60">
      <Threads
        color="#a855f7"
        amplitude={1.6}
        distance={0.3}
        opacity={0.85}
        saturation={1}
        enableMouseInteraction={false}
        paused={reduced}
      />
    </div>
  );
}
