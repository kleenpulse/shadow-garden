"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  isSkinMessage,
  TEMPLATE_READY,
} from "@/lib/templates/frame-channel";
import { skinFrom } from "@/lib/templates/tokens";
import type { TunedValues } from "@/lib/registry/types";

// The bench half of the token contract, wrapped around a template on the bare
// /templates/<slug> route. It exists so the template itself contains no bench
// coupling: everything below this element sees ordinary CSS custom properties and
// two data attributes, exactly as a buyer's copy will (SPEC §V59).
//
// When the route is opened directly rather than embedded, this is inert — the
// initial query-string values are applied and no listener is attached.
export default function TokenBridge({
  slug,
  initial,
  children,
}: {
  slug: string;
  initial: TunedValues;
  children: ReactNode;
}) {
  const [values, setValues] = useState<TunedValues>(initial);
  // Pause and OS-level reduced-motion both mean "stop moving", and a template
  // should not have to reason about which. They collapse into the one signal it
  // already understands: data-motion="reduced".
  const [forceStill, setForceStill] = useState(false);

  useEffect(() => {
    if (window.parent === window) return;

    const onMessage = (event: MessageEvent) => {
      // Same-origin only. A frame that repaints for any sender is a frame anyone
      // can repaint.
      if (event.origin !== window.location.origin) return;
      if (!isSkinMessage(event.data)) return;
      setValues(event.data.values);
      setForceStill(event.data.paused || event.data.reducedMotion);
    };

    window.addEventListener("message", onMessage);
    // Announce readiness rather than waiting to be found: the parent's first post
    // would otherwise race this component's mount.
    window.parent.postMessage(
      { type: TEMPLATE_READY },
      window.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const skin = useMemo(() => {
    const effective = forceStill ? { ...values, motion: "reduced" } : values;
    return skinFrom(effective);
  }, [values, forceStill]);

  return (
    <div data-template={slug} style={skin.style} {...skin.attrs}>
      {children}
    </div>
  );
}
