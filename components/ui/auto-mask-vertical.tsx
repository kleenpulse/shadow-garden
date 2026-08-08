"use client";

import type React from "react";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// A vertical scroll container that (1) fades its top/bottom edges with a
// mask-image gradient based on scroll position and (2) hides its scrollbar,
// revealing it only on hover or while actively scrolling (md+).
export interface AutoMaskVerticalProps
  extends React.ComponentPropsWithoutRef<"div"> {
  topThreshold?: number;
  bottomThreshold?: number;
  fadeSizePercent?: number;
  transitionDurationMs?: number;
}

export const AutoMaskVertical = forwardRef<HTMLDivElement, AutoMaskVerticalProps>(
  (
    {
      children,
      className,
      style,
      topThreshold = 10,
      bottomThreshold = 10,
      fadeSizePercent = 12,
      transitionDurationMs = 300,
      onScroll,
      ...rest
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);
    // Auto-hiding scrollbar: true while actively scrolling, reset to false ~1s idle.
    const [scrolling, setScrolling] = useState(false);
    const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node;
        if (!ref) return;
        if (typeof ref === "function") {
          ref(node);
        } else {
          ref.current = node;
        }
      },
      [ref],
    );

    const updateScrollState = useCallback(() => {
      const element = containerRef.current;
      if (!element) return;
      const { scrollTop, scrollHeight, clientHeight } = element;
      const normalizedScrollTop = Math.max(0, scrollTop);
      const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
      const resolvedTopThreshold = Math.max(0, topThreshold);
      const resolvedBottomThreshold = Math.max(0, bottomThreshold);
      setCanScrollUp(normalizedScrollTop > resolvedTopThreshold);
      setCanScrollDown(
        maxScrollTop - normalizedScrollTop > resolvedBottomThreshold,
      );
    }, [bottomThreshold, topThreshold]);

    useEffect(() => {
      updateScrollState();
    }, [updateScrollState, children]);

    useEffect(() => {
      const element = containerRef.current;
      if (!element) return;

      const handleScroll = (event: Event) => {
        // The DOM `scroll` event uses the plain `Event` interface (not
        // `UIEvent`), so never gate the forward on `instanceof UIEvent` — that
        // silently drops every scroll and the parent's onScroll never fires.
        onScroll?.(event as unknown as React.UIEvent<HTMLDivElement>);
        // Reveal the scrollbar while scrolling; hide it after a short idle.
        setScrolling(true);
        if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
        scrollHideTimer.current = setTimeout(() => setScrolling(false), 1000);
        if (frameRef.current !== null) return;
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null;
          updateScrollState();
        });
      };

      const handleResize = () => {
        updateScrollState();
      };

      element.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("resize", handleResize);

      return () => {
        element.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleResize);
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        if (scrollHideTimer.current) {
          clearTimeout(scrollHideTimer.current);
          scrollHideTimer.current = null;
        }
      };
    }, [onScroll, updateScrollState]);

    const maskImage = useMemo(() => {
      const resolvedFade = Math.min(49, Math.max(0, fadeSizePercent));
      const topStop = `${resolvedFade}%`;
      const bottomStop = `${100 - resolvedFade}%`;

      if (canScrollUp && canScrollDown) {
        return `linear-gradient(to bottom, transparent 0%, black ${topStop}, black ${bottomStop}, transparent 100%)`;
      }
      if (canScrollUp) {
        return `linear-gradient(to bottom, transparent 0%, black ${topStop}, black 100%)`;
      }
      if (canScrollDown) {
        return `linear-gradient(to bottom, black 0%, black ${bottomStop}, transparent 100%)`;
      }
      return "none";
    }, [canScrollDown, canScrollUp, fadeSizePercent]);

    const mergedStyle = useMemo<React.CSSProperties>(
      () => ({
        ...style,
        maskImage,
        WebkitMaskImage: maskImage,
        transition:
          transitionDurationMs <= 0
            ? style?.transition
            : `mask-image ${transitionDurationMs}ms ease, -webkit-mask-image ${transitionDurationMs}ms ease`,
      }),
      [maskImage, style, transitionDurationMs],
    );

    return (
      <div
        {...rest}
        ref={setRefs}
        className={cn(
          "min-h-0 overflow-y-auto transition-[mask-image] duration-300",
          // Auto-hiding scrollbar: invisible by default, revealed on hover or
          // while actively scrolling (md+ only), never rendered below md.
          "scrollbar-thin max-md:scrollbar-none [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:transition-colors",
          "[scrollbar-color:transparent_transparent] [&::-webkit-scrollbar-thumb]:bg-transparent",
          // Revealed thumb uses the app scrollbar token (--sg-scroll) so every
          // scroll surface shares one theme-tinted color.
          "md:hover:[scrollbar-color:var(--sg-scroll)_transparent] md:hover:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)",
          scrolling &&
            "md:[scrollbar-color:var(--sg-scroll)_transparent] md:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)",
          className,
        )}
        style={mergedStyle}
      >
        {children}
      </div>
    );
  },
);

AutoMaskVertical.displayName = "AutoMaskVertical";

export default AutoMaskVertical;
