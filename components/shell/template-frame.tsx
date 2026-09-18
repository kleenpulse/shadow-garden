"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import {
  isReadyMessage,
  TEMPLATE_MESSAGE,
  type TemplateSkinMessage,
} from "@/lib/templates/frame-channel";
import { tokensToQuery } from "@/lib/templates/tokens";
import type { TunedValues } from "@/lib/registry/types";

// A landing page cannot render in the component stage. The stage is
// `overflow-hidden` with a fixed min-height, and a template is a scroll machine:
// Lenis wants a real scroller, ScrollTrigger wants a real viewport, and half the
// sections are `100vh`. Re-pointing all of that at a div means rewriting the
// template — at which point the bytes on sale are not the bytes on screen.
//
// So the preview is the real route in an iframe (SPEC §C13). The frame gets a
// genuine document, genuine scroll and genuine viewport units — at the panel's own
// size, unscaled. What the buyer sees is what the buyer copies.

interface Viewport {
  id: string;
  label: string;
  width: number;
  Icon: typeof Monitor;
}

// Widths, not device names: the point is the breakpoint each one crosses.
//
// `desktop` has no fixed width — it means "as wide as the panel". That is the
// whole trick, and it is why nothing here is scaled: the frame IS a viewport of
// whatever size it is displayed at, so the template lays out and PAINTS at final
// size. There is no larger surface to resample.
//
// The alternative — render at a fixed 1440 and CSS-scale it down to fit — looks
// identical for static content and is ruinous for anything that repaints. A
// transformed surface has to be re-rasterised whenever its contents change, so a
// template with a 2D canvas animating at 60fps drags the entire frame's pixels
// through a resample on every one of those frames. Scaled it stutters; unscaled,
// the same page is smooth. Do not reintroduce a transform here.
const VIEWPORTS: Viewport[] = [
  { id: "desktop", label: "Desktop", width: 0, Icon: Monitor },
  { id: "tablet", label: "Tablet", width: 834, Icon: Tablet },
  { id: "phone", label: "Phone", width: 390, Icon: Smartphone },
];

export default function TemplateFrame({
  slug,
  values,
  paused,
  reducedMotion,
}: {
  slug: string;
  values: TunedValues;
  paused: boolean;
  reducedMotion: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>(VIEWPORTS[0]!);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);

  // The src is fixed at mount. Tokens travel by postMessage precisely so that
  // dragging the accent picker does not remount the document and throw away the
  // scroll position the buyer was in the middle of reading (§V59). The query
  // string only has to be right for the FIRST paint.
  const [src] = useState(() => {
    const query = tokensToQuery(values);
    return query ? `/templates/${slug}?${query}` : `/templates/${slug}`;
  });

  const post = useCallback(
    (message: TemplateSkinMessage) => {
      frameRef.current?.contentWindow?.postMessage(
        message,
        window.location.origin,
      );
    },
    [],
  );

  // Handshake. The frame announces itself; anything posted before that lands in a
  // document with no listener attached yet.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (isReadyMessage(event.data)) setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    post({ type: TEMPLATE_MESSAGE, values, paused, reducedMotion });
  }, [ready, values, paused, reducedMotion, post]);

  // A fresh document has no listener, so the handshake has to run again on every
  // navigation the frame makes on its own (an in-template anchor, a reload).
  const onLoad = useCallback(() => setReady(false), []);

  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (rect) setBox({ width: rect.width, height: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Real width, never a scaled one. `width: 0` means "fill the panel"; a fixed
  // width is honoured only while it actually fits, because a 834px frame inside a
  // 600px panel would have to be scaled or clipped, and both are worse than simply
  // showing the narrower viewport the reader can actually see.
  const frameWidth =
    viewport.width === 0 ? box.width : Math.min(viewport.width, box.width);

  return (
    <div ref={boxRef} className="relative grid h-full w-full place-items-center overflow-hidden">
      {box.height > 0 && frameWidth > 0 && (
        <iframe
          ref={frameRef}
          src={src}
          onLoad={onLoad}
          title={`${slug} template preview`}
          // The frame is same-origin by construction (it is this app), which is
          // what makes the postMessage handshake possible at all. Scripts and
          // same-origin are therefore both required; everything else stays off.
          sandbox="allow-scripts allow-same-origin"
          className="border-0 bg-white"
          // No transform. The frame is a real viewport at a real size, so the
          // template paints at final resolution and the compositor has nothing to
          // resample. See the note on VIEWPORTS above before changing this.
          style={{ width: frameWidth, height: box.height }}
        />
      )}

      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-hairline bg-surface/80 p-1 backdrop-blur">
        {VIEWPORTS.map((option) => {
          const active = option.id === viewport.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setViewport(option)}
              aria-pressed={active}
              aria-label={
                option.width === 0
                  ? `${option.label} — fills the panel`
                  : `${option.label} — ${option.width}px`
              }
              title={
                option.width === 0
                  ? `${option.label} · fits the panel`
                  : `${option.label} · ${option.width}px`
              }
              className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${
                active
                  ? "bg-raised text-accent"
                  : "text-ink-mute hover:text-ink"
              }`}
            >
              <option.Icon className="h-3.5 w-3.5" aria-hidden />
            </button>
          );
        })}
        {/* The real width being rendered, not the width that was asked for —
            a fixed viewport is clamped to the panel rather than scaled. */}
        <span className="px-2 font-mono text-[10px] tabular-nums text-ink-mute">
          {Math.round(frameWidth)}
        </span>
      </div>
    </div>
  );
}
