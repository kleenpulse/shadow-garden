"use client";

import { RefObject, useEffect, useState } from "react";

interface UseInViewProperties {
  // React 19 types every useRef<T>(null) as RefObject<T | null>, so a hook that
  // demands a non-null ref cannot accept one. Widened rather than asking twelve
  // call sites to assert.
  ref: RefObject<HTMLElement | null>;
  once?: boolean;
  isFrames?: boolean;
}

const useInView = ({ ref, once, isFrames }: UseInViewProperties) => {
  const [hasAnimated, setHasAnimated] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (once) {
          if (entry.isIntersecting && !hasAnimated) {
            setHasAnimated(true);
          }
          return;
        }
        if (entry && entry) {
          setIsViewing(entry.isIntersecting);
          return;
        }
      },
      {
        // root: ref?.current,
        // rootMargin: "100px",
        threshold: isFrames ? 0.8 : undefined,
      },
    );

    const currentReference = ref.current;
    if (currentReference) {
      observer.observe(currentReference);
      return () => {
        observer.unobserve(currentReference);
      };
    }
  }, [ref, hasAnimated, once, isFrames]);

  return once ? hasAnimated : isViewing;
};

export default useInView;
