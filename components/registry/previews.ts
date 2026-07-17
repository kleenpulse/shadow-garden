"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { PreviewProps } from "@/lib/registry/types";

// slug → live preview component, code-split so only the active component loads.
// Register a real component here once its source is dropped into
// components/registry/<slug>/. Unregistered slugs fall back to the reference
// stand-in (see LiveWorkspace), so the full spine works end-to-end regardless.
export const previews: Record<string, ComponentType<PreviewProps>> = {
  threads: dynamic(() => import("./threads/ThreadsPreview"), { ssr: false }),
  grainient: dynamic(() => import("./grainient/GrainientPreview"), { ssr: false }),
  "light-rays": dynamic(() => import("./light-rays/LightRaysPreview"), { ssr: false }),
  "side-rays": dynamic(() => import("./side-rays/SideRaysPreview"), { ssr: false }),
  "dot-field": dynamic(() => import("./dot-field/DotFieldPreview"), { ssr: false }),
  strands: dynamic(() => import("./strands/StrandsPreview"), { ssr: false }),
  ribbons: dynamic(() => import("./ribbons/RibbonsPreview"), { ssr: false }),
  "morphing-text": dynamic(() => import("./morphing-text/MorphingTextPreview"), { ssr: false }),
  "animated-number": dynamic(() => import("./animated-number/AnimatedNumberPreview"), { ssr: false }),
  "marquee-text": dynamic(() => import("./marquee-text/MarqueeTextPreview"), { ssr: false }),
  "variable-proximity": dynamic(() => import("./variable-proximity/VariableProximityPreview"), { ssr: false }),
  "pixel-transition": dynamic(() => import("./pixel-transition/PixelTransitionPreview"), { ssr: false }),
  "border-glow": dynamic(() => import("./border-glow/BorderGlowPreview"), { ssr: false }),
  "spotlight-shell": dynamic(() => import("./spotlight-shell/SpotlightShellPreview"), { ssr: false }),
  "animated-hamburger": dynamic(() => import("./animated-hamburger/AnimatedHamburgerPreview"), { ssr: false }),
  "morph-dialog": dynamic(() => import("./morph-dialog/MorphDialogPreview"), { ssr: false }),
  "grow-dialog": dynamic(() => import("./grow-dialog/GrowDialogPreview"), { ssr: false }),
  "sakura-tree": dynamic(() => import("./sakura-tree/SakuraTreePreview"), { ssr: false }),
  "command-palette": dynamic(() => import("./command-palette/CommandPalettePreview"), { ssr: false }),
};
