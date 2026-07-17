"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseResizableArgs = {
  width: number;
  onWidth: (next: number) => void;
  min: number;
  max: number;
  /** Width restored on double-click of the handle. */
  resetTo: number;
  /** Which side the handle sits on relative to the panel it resizes. */
  edge?: "left" | "right";
};

const NUDGE_STEP = 16;

/**
 * Pointer-drag resize for a side panel. `onWidth` is wired to a persisted store
 * setter, so widths survive reload. The handle is keyboard-accessible (arrow
 * keys nudge) and double-click resets to `resetTo`. While dragging, the document
 * gets `select-none` + a col-resize cursor so text selection / hover transitions
 * don't fight the drag. Adapted from ellum's knowledge-center useResizable.
 */
export function useResizable({
  width,
  onWidth,
  min,
  max,
  resetTo,
  edge = "right",
}: UseResizableArgs) {
  const startX = useRef(0);
  const startWidth = useRef(0);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const clamp = useCallback(
    (w: number) => Math.min(max, Math.max(min, w)),
    [min, max],
  );

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    document.body.classList.remove("select-none", "cursor-col-resize");
  }, []);

  const onPointerMove = useRef<(e: PointerEvent) => void>(() => {});
  const onPointerUp = useRef<() => void>(() => {});

  useEffect(() => {
    onPointerMove.current = (e: PointerEvent) => {
      if (!dragging.current) return;
      const delta =
        edge === "right" ? e.clientX - startX.current : startX.current - e.clientX;
      onWidth(clamp(startWidth.current + delta));
    };
    onPointerUp.current = () => {
      endDrag();
      window.removeEventListener("pointermove", onPointerMove.current);
      window.removeEventListener("pointerup", onPointerUp.current);
    };
  }, [edge, onWidth, clamp, endDrag]);

  useEffect(() => endDrag, [endDrag]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      setIsDragging(true);
      document.body.classList.add("select-none", "cursor-col-resize");
      window.addEventListener("pointermove", onPointerMove.current);
      window.addEventListener("pointerup", onPointerUp.current);
    },
    [width],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onWidth(clamp(width + (edge === "right" ? -NUDGE_STEP : NUDGE_STEP)));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onWidth(clamp(width + (edge === "right" ? NUDGE_STEP : -NUDGE_STEP)));
      }
    },
    [width, edge, onWidth, clamp],
  );

  const handleDoubleClick = useCallback(() => {
    onWidth(clamp(resetTo));
  }, [onWidth, clamp, resetTo]);

  return {
    isDragging,
    handleProps: {
      onPointerDown: handlePointerDown,
      onKeyDown: handleKeyDown,
      onDoubleClick: handleDoubleClick,
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-valuenow": width,
      "aria-valuemin": min,
      "aria-valuemax": max,
      tabIndex: 0,
    },
  };
}
