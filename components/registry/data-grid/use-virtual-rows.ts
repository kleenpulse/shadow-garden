"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

/**
 * Windowing over a fixed row height.
 *
 * Two inputs decide everything: how far the viewport is scrolled, and how tall
 * it is. The first arrives on a `scroll` event, which is cheap and needs no
 * observer. The second needs a ResizeObserver — and rather than construct a
 * second one beside the shared runtime host, this leases the host's.
 *
 * The host is halted and paints nothing (`halted: true`, `paintWhenHalted:
 * false`), so not a single frame is ever scheduled. What it contributes is the
 * part that is actually easy to get wrong: an observer bound to the element
 * rather than to `window`, a dpr that is re-read when the window moves between
 * monitors, and a teardown that cannot leak. Grids do not need a render loop.
 * They do need those three things, and there is already one correct
 * implementation of them in the project.
 *
 * Row height is fixed rather than measured. Variable heights need a measured
 * offset index and a two-pass render, which is a different component — and a
 * fixed height is what makes `scrollTop / rowHeight` an O(1) answer instead of
 * a search.
 */

export interface VirtualWindow {
  /** Attach to the scrolling element. */
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Index of the first rendered row, overscan included. */
  first: number;
  /** Index one past the last rendered row. */
  last: number;
  /** Height of the full, unwindowed list — what gives the scrollbar its range. */
  totalHeight: number;
  /** Offset the rendered slice sits at. */
  offsetTop: number;
  /** Measured viewport height in CSS px; 0 until first layout. */
  height: number;
  onScroll(): void;
  /** Bring a row fully inside the viewport, moving as little as possible. */
  scrollRowIntoView(index: number): void;
}

/**
 * `leadingOffset` is the height of anything sitting above the first row inside
 * the SAME scroller — the header. It has to be subtracted before dividing,
 * because `scrollTop` is measured from the top of the content and the rows do
 * not start there. Getting this wrong is invisible at the top of the list and
 * shows up as the window lagging the scroll by exactly one header.
 */
export function useVirtualRows(
  rowCount: number,
  rowHeight: number,
  overscan: number,
  leadingOffset: number,
): VirtualWindow {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  useAnimationLoop({
    target: viewportRef,
    // Nothing to animate. The host is here for its observer and its teardown.
    halted: true,
    paintWhenHalted: false,
    onResize: (metrics) => setHeight(metrics.height),
  });

  const onScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport) setScrollTop(viewport.scrollTop);
  }, []);

  const scrollRowIntoView = useCallback(
    (index: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const top = leadingOffset + index * rowHeight;
      const bottom = top + rowHeight;
      // The sticky header covers the first `leadingOffset` px of the viewport,
      // so a row scrolled to exactly the top would be hidden underneath it.
      if (top < viewport.scrollTop + leadingOffset) {
        viewport.scrollTop = top - leadingOffset;
      } else if (bottom > viewport.scrollTop + viewport.clientHeight) {
        viewport.scrollTop = bottom - viewport.clientHeight;
      }
    },
    [leadingOffset, rowHeight],
  );

  const safeHeight = Math.max(rowHeight, 1);
  const past = Math.max(0, scrollTop - leadingOffset);
  const first = Math.max(0, Math.floor(past / safeHeight) - overscan);
  // Overscan is added twice: once for the rows above the fold and once below, so
  // a flick in either direction has the same amount of already-rendered runway.
  const span = Math.ceil(height / safeHeight) + overscan * 2 + 1;
  const last = Math.min(rowCount, first + span);

  return {
    viewportRef,
    first,
    last,
    totalHeight: rowCount * rowHeight,
    offsetTop: first * rowHeight,
    height,
    onScroll,
    scrollRowIntoView,
  };
}
