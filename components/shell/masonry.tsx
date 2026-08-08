"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// Pinterest-style masonry: items pack upward into the shortest column instead of
// sitting on a shared row baseline, so a tall card never leaves a hole beside a
// short one.
//
// Every item is an absolutely positioned child of ONE container, moved by
// `transform`. That is the load-bearing choice. The obvious alternative — a real
// DOM column per column, items distributed between them — remounts an item every
// time it changes column, which throws away focus, playing video, open popovers
// and scroll position on every resize. Here the DOM order never changes: items
// only move.
//
// DOM order also stays the reading order (item 1, 2, 3 fill left-to-right across
// the row), so Tab traverses the grid the way the eye does. CSS `columns` cannot
// promise that — it fills the first column top-to-bottom before starting the
// second.
//
// Nothing here re-renders React. A repack is a batch of style writes on refs; the
// component renders exactly twice in its life (fallback → packed) plus whenever
// its children change.
export interface MasonryProps {
  /** Items to pack. Each needs a stable `key` — that is what stops a remount. */
  children?: ReactNode;
  className?: string;
  /** Target column width. The column count is derived from the container, not the viewport. */
  minColumnWidth?: number;
  /** Ceiling on the derived column count, however wide the container gets. */
  maxColumns?: number;
  /** Space between columns and between stacked items. */
  gap?: number;
  /** `balanced` packs into the shortest column; `sequential` keeps strict left-to-right order. */
  packing?: "balanced" | "sequential";
  /** How long an item takes to glide to a new slot. 0 snaps. */
  transition?: number;
  /** Delay added per item as a batch reveals. */
  stagger?: number;
  /** Fade and rise each item in as it enters the viewport. */
  revealOnScroll?: boolean;
  /** How far an item rises on reveal. */
  revealDistance?: number;
  /** When true, items appear immediately and never tween. */
  reducedMotion?: boolean;
}

// Height changes below this are subpixel noise from rounding a fractional column
// width. Reacting to them lets a repack feed itself.
const EPSILON = 0.5;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Most items a single reveal batch staggers before the delay stops growing. */
const STAGGER_CAP = 6;

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Finish the entrance on whatever item contains `el`, immediately and without
 * animating.
 *
 * Call this before measuring or scrolling to an anchor inside a Masonry. A
 * reveal that rises is a transform on an ancestor of your target, so it sits
 * inside the box `scrollIntoView` measures: scroll first and the item lands
 * `revealDistance` low, then finishes rising — settling that far past where you
 * aimed, which on a page with a sticky header means back underneath it.
 *
 * Harmless when the item has already arrived, or when reveals are off.
 */
export function settleMasonryReveal(el: Element | null | undefined) {
  const inner = el?.closest<HTMLElement>("[data-masonry-item]");
  if (!inner || inner.dataset.revealed) return;
  inner.dataset.revealed = "1";
  inner.style.transition = "none";
  inner.style.opacity = "1";
  inner.style.transform = "translate3d(0, 0, 0)";
}

export default function Masonry({
  children,
  className,
  minColumnWidth = 240,
  maxColumns = 4,
  gap = 16,
  packing = "balanced",
  transition = 320,
  stagger = 45,
  revealOnScroll = true,
  revealDistance = 16,
  reducedMotion = false,
}: MasonryProps) {
  const items = Children.toArray(children);
  const count = items.length;
  // A parent that re-renders on every keystroke would otherwise hand this a new
  // `children` array identity each time and buy a full forced-layout remeasure
  // for nothing. Keys are what actually decide the layout; content that changes
  // underneath them changes a height, which the ResizeObserver already catches.
  const signature = items
    .map((child, i) => (isValidElement(child) ? (child.key ?? i) : i))
    .join("|");

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const frameRef = useRef(0);
  const willChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only a width change can invalidate a pack. Height changes on the container
  // are the pack's own output, and reacting to them is an infinite loop.
  const lastWidth = useRef(-1);
  const packedOnce = useRef(false);

  // Server and first client render are the same CSS-columns fallback, so the
  // static HTML paints as a real grid rather than a pile at the origin. The swap
  // to absolute happens in a layout effect, before the browser paints again.
  const [packed, setPacked] = useState(false);

  const tween =
    reducedMotion || transition <= 0
      ? "none"
      : `transform ${transition}ms ${EASE}`;

  const pack = useCallback(
    (animate: boolean) => {
      const el = containerRef.current;
      if (!el) return;

      const width = el.clientWidth;
      // Zero width means display:none, a collapsed panel, or a detached subtree.
      // Packing against it would divide a nonexistent row into columns and write
      // NaN; bail and let the ResizeObserver call back when it has a box.
      if (width <= 0) return;

      const columns = Math.max(
        1,
        Math.min(maxColumns, Math.floor((width + gap) / (minColumnWidth + gap))),
      );
      const colWidth = (width - gap * (columns - 1)) / columns;
      const rtl = getComputedStyle(el).direction === "rtl";
      const wraps = wrapRefs.current;

      // Three passes, never interleaved: write every width, read every height,
      // write every position. Measuring one item then moving it then measuring
      // the next is layout thrashing — the browser is forced to re-run layout
      // once per item instead of once per pass.
      for (const w of wraps) {
        if (w) w.style.width = `${colWidth}px`;
      }

      const heights: number[] = [];
      for (const w of wraps) {
        heights.push(w ? w.getBoundingClientRect().height : 0);
      }

      const colHeights = new Array<number>(columns).fill(0);
      for (let i = 0; i < wraps.length; i++) {
        const w = wraps[i];
        if (!w) continue;

        let col = 0;
        if (packing === "sequential") {
          col = i % columns;
        } else {
          // Strictly-shorter wins, so a tie always resolves to the leftmost
          // column. An `<=` here would let two equal columns swap an item back
          // and forth between otherwise identical packs.
          for (let c = 1; c < columns; c++) {
            if (colHeights[c] < colHeights[col] - EPSILON) col = c;
          }
        }

        const x = rtl
          ? width - colWidth - col * (colWidth + gap)
          : col * (colWidth + gap);

        w.style.transition = animate ? tween : "none";
        w.style.transform = `translate3d(${x}px, ${colHeights[col]}px, 0)`;
        colHeights[col] += heights[i] + gap;
      }

      // Trailing gap belongs between items, not under the last one.
      const tallest = colHeights.length ? Math.max(...colHeights) : 0;
      el.style.height = `${Math.max(0, tallest - gap)}px`;
      lastWidth.current = width;

      // `will-change` promotes every item to its own compositor layer, and a
      // layer that is never invalidated can hold a stale frame (§V29) — these
      // items are commonly translucent cards over a blurred backdrop. So it
      // lives exactly as long as the flight, on a timer rather than
      // `transitionend`, which never fires for an interrupted or no-op tween.
      if (animate && tween !== "none") {
        for (const w of wraps) {
          if (w) w.style.willChange = "transform";
        }
        if (willChangeTimer.current) clearTimeout(willChangeTimer.current);
        willChangeTimer.current = setTimeout(() => {
          for (const w of wrapRefs.current) {
            if (w) w.style.willChange = "";
          }
        }, transition + 60);
      }
    },
    [gap, maxColumns, minColumnWidth, packing, transition, tween],
  );

  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      pack(true);
    });
  }, [pack]);

  // Synchronous, in a layout effect, on mount and on every children change.
  //
  // This is the whole reason the component is shaped this way. A consumer that
  // scrolls to an anchor does it in a passive effect, and React runs a child's
  // layout effect before any parent's passive effect — so by the time that
  // scroll measures, these positions are final. Deferring the pack to the
  // ResizeObserver or to rAF instead would put the scroll one frame ahead of the
  // layout it is measuring: right anchor, wrong offset (§B10).
  useIsomorphicLayoutEffect(() => {
    wrapRefs.current.length = count;
    innerRefs.current.length = count;

    if (!packed) {
      setPacked(true);
      return;
    }

    // The first pack has no previous position to travel from — tweening it would
    // slide every item in from the origin.
    pack(packedOnce.current);
    packedOnce.current = true;
  }, [packed, pack, count, signature]);

  // Async height changes only: images resolving, a font swapping, text rewrapping
  // after the column count changed under it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !packed) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== el) {
          schedule();
          return;
        }
        // Container: width only. Its height is what the pack just wrote.
        const w = entry.contentRect.width;
        if (Math.abs(w - lastWidth.current) > EPSILON) {
          schedule();
          return;
        }
      }
    });

    ro.observe(el);
    for (const w of wrapRefs.current) {
      if (w) ro.observe(w);
    }

    return () => ro.disconnect();
  }, [packed, schedule, signature]);

  // Entrance. Hidden state is applied here rather than in the markup so the
  // prerendered HTML is never a page of invisible cards for anyone whose JS is
  // slow, blocked, or off.
  useIsomorphicLayoutEffect(() => {
    if (!packed) return;
    const inners = innerRefs.current;
    const live = revealOnScroll && !reducedMotion && transition > 0;

    if (!live) {
      for (const el of inners) {
        if (!el) continue;
        el.style.opacity = "";
        el.style.transform = "";
        el.style.transition = "";
        el.style.transitionDelay = "";
        delete el.dataset.revealed;
      }
      return;
    }

    for (const el of inners) {
      if (!el) continue;
      // An item that already arrived is pinned visible before anything else
      // happens. This effect re-runs whenever the item set changes, and a
      // re-run that re-hid a revealed item — or that landed between the flag
      // and its reveal — would strand a card at opacity 0 permanently.
      if (el.dataset.revealed) {
        el.style.opacity = "1";
        el.style.transform = "translate3d(0, 0, 0)";
        continue;
      }
      el.style.opacity = "0";
      el.style.transform = `translate3d(0, ${revealDistance}px, 0)`;
      el.style.transition = `opacity ${transition}ms ${EASE}, transform ${transition}ms ${EASE}`;
    }

    const io = new IntersectionObserver(
      (entries) => {
        let n = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLDivElement;
          io.unobserve(el);
          if (el.dataset.revealed) continue;
          el.dataset.revealed = "1";
          // The stagger is `transition-delay`, not a timer. A timer can be
          // cancelled by an unmount or a re-run mid-flight; a delay is owned by
          // the transition it belongs to and cannot be orphaned.
          //
          // Capped, because a batch is however many items happen to cross at
          // once — a fast scroll into a wide grid can deliver thirty. Uncapped,
          // the last of them waits well over a second while sitting in plain
          // sight, which reads as broken rather than staggered.
          el.style.transitionDelay = `${Math.min(n, STAGGER_CAP) * stagger}ms`;
          el.style.opacity = "1";
          el.style.transform = "translate3d(0, 0, 0)";
          n++;
        }
      },
      // No negative bottom margin. Trimming the root to hold a reveal until an
      // item is "properly" on screen strands anything that only ever reaches
      // that band — the last row of a page that cannot scroll further never
      // intersects, and stays invisible for good.
      { threshold: 0 },
    );

    for (const el of inners) {
      if (el && !el.dataset.revealed) io.observe(el);
    }

    return () => io.disconnect();
  }, [
    packed,
    revealOnScroll,
    revealDistance,
    reducedMotion,
    transition,
    stagger,
    signature,
  ]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (willChangeTimer.current) clearTimeout(willChangeTimer.current);
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        // `contain: layout style` walls this subtree's layout off from the rest
        // of the page. Deliberately NOT `paint` — that clips a ring or shadow
        // drawn on an item at the container's edge.
        //
        // `overflow-anchor: none` because scroll anchoring picks a child to hold
        // still and these children move under it, which reads as scroll drift.
        "contain-[layout_style] [overflow-anchor:none]",
        // Absolute children have nowhere to go on a printed page.
        "print:h-auto! print:block!",
        className,
      )}
      style={
        packed
          ? { position: "relative", height: 0 }
          : {
              // Same arithmetic the pack does, expressed to the browser: with
              // both set, the used count is the smaller of `maxColumns` and what
              // fits. So the pre-hydration paint lands on the real grid.
              columnWidth: `${minColumnWidth}px`,
              columnCount: maxColumns,
              columnGap: `${gap}px`,
            }
      }
    >
      {items.map((child, i) => (
        <div
          key={isValidElement(child) ? (child.key ?? i) : i}
          ref={(el) => {
            wrapRefs.current[i] = el;
          }}
          className="print:static! print:w-auto! print:transform-none!"
          style={
            packed
              ? { position: "absolute", top: 0, left: 0 }
              : { breakInside: "avoid", marginBottom: `${gap}px` }
          }
        >
          {/* Reveal rides on an inner element: two transforms on one node would
              overwrite each other, and the outer one is the item's position. */}
          <div
            data-masonry-item=""
            ref={(el) => {
              innerRefs.current[i] = el;
            }}
          >
            {child}
          </div>
        </div>
      ))}
    </div>
  );
}
