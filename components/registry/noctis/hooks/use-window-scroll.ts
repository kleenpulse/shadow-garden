"use client";

import { useEffect, useState } from "react";

// Current window scroll position.
//
// Replaces `useWindowScroll` from `react-use`, which was the only thing this
// template imported from a library of roughly a hundred hooks. Eighteen lines is
// a better trade than a dependency, and this one is passive-listener and
// rAF-throttled, which the original was not.

export function useWindowScroll(): { x: number; y: number } {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;
      setPosition({ x: window.scrollX, y: window.scrollY });
    };

    // Scroll fires far more often than the screen refreshes; coalescing to one
    // read per frame is the difference between a state update per event and a
    // state update per paint.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return position;
}
