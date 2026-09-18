"use client";

import { useEffect, useState } from "react";
import { useStill } from "../hooks/use-still";

// Types its text out one character at a time.
//
// Replaces `typewriter-effect`, which the source used to type an entire HTML
// string — the whole `<h1>`, its classes and its nested spans — through
// `innerHTML`. That works, but it means the headline does not exist in the markup
// until JavaScript has run, it cannot be styled by anything that expects real
// elements, and it puts an `innerHTML` write on the page's most prominent piece of
// copy for the sake of an animation.
//
// Here the heading is ordinary JSX and only the letters animate.
//
// The full string is always present for assistive technology via `aria-label`, so
// a screen reader announces the headline once rather than narrating it growing.

export default function TypeReveal({
  text,
  speed = 70,
  startDelay = 0,
  className,
}: {
  text: string;
  /** Milliseconds per character. */
  speed?: number;
  /** Milliseconds to wait before the first character. */
  startDelay?: number;
  className?: string;
}) {
  const still = useStill();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    // Reduced motion gets the finished headline, not a faster one.
    if (still) {
      setShown(text.length);
      return;
    }

    setShown(0);
    let index = 0;
    let interval: ReturnType<typeof setInterval>;

    const begin = setTimeout(() => {
      interval = setInterval(() => {
        index += 1;
        setShown(index);
        if (index >= text.length) clearInterval(interval);
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(begin);
      clearInterval(interval);
    };
  }, [text, speed, startDelay, still]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{text.slice(0, shown)}</span>
    </span>
  );
}
