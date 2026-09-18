"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";

// The @gsap/react `useGSAP` hook, inlined.
//
// The package is a thin wrapper over `gsap.context()`, and inlining it means
// one fewer package on the install line a buyer has to agree to. The cleanup is
// the part that matters: `context.revert()` kills every tween AND every
// ScrollTrigger created inside the callback. Without it, a remount leaves the
// old triggers bound to detached nodes, and the second mount's animations
// fight the first.
//
// useLayoutEffect, not useEffect: ScrollTrigger measures the DOM on creation,
// so running after paint would read a layout the browser is about to change
// and pin the trigger at the wrong scroll offset.

export interface UseGsapConfig {
  /** Scopes every selector string in the callback to this element's subtree. */
  scope?: RefObject<HTMLElement | null> | undefined;
  /** Re-runs the callback (after reverting the previous context) when these change. */
  dependencies?: unknown[];
}

/**
 * The callback may return a cleanup function; `gsap.context()` runs it on
 * revert. Second argument is either a config or a bare dependency array,
 * matching the upstream API.
 */
export function useGSAP(
  callback: () => void | (() => void),
  config: UseGsapConfig | unknown[] = {},
): void {
  const { scope, dependencies = [] } = Array.isArray(config)
    ? { scope: undefined, dependencies: config }
    : config;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useLayoutEffect(() => {
    const context = gsap.context(
      () => callbackRef.current(),
      scope?.current ?? undefined,
    );
    return () => context.revert();
    // The callback is read through a ref, so it is deliberately not a dependency:
    // an inline arrow would otherwise revert and rebuild every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}
