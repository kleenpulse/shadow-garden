"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Whether the template should hold still.
//
// Two sources, OR'd: the visitor's OS-level `prefers-reduced-motion`, and a
// `data-motion="reduced"` attribute on an ancestor. The first is the
// accessibility contract the site owes; the second lets a host — the Shadow
// Garden bench, a Storybook, a screenshot runner — freeze the page without the
// template knowing anything about that host.
//
// Consumers SKIP their animation rather than running it at zero duration. That
// distinction is the whole point: every reveal in this template is a
// `gsap.fromTo` that starts at opacity 0.1, so a frozen timeline would leave the
// copy permanently unreadable. Never running it leaves every element at its
// natural, final state — which is exactly what reduced motion should look like.

const StillContext = createContext(false);

export function StillProvider({ children }: { children: ReactNode }) {
  const [still, setStill] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const host = document.querySelector("[data-motion]");

    const read = () =>
      setStill(
        query.matches || host?.getAttribute("data-motion") === "reduced",
      );

    read();
    query.addEventListener("change", read);

    // The attribute is live: a host can flip it while the page is open, and the
    // template has to notice without a reload.
    const observer = host ? new MutationObserver(read) : null;
    if (host && observer) {
      observer.observe(host, { attributes: true, attributeFilter: ["data-motion"] });
    }

    return () => {
      query.removeEventListener("change", read);
      observer?.disconnect();
    };
  }, []);

  return <StillContext.Provider value={still}>{children}</StillContext.Provider>;
}

/** False until mounted — the server cannot know, and guessing would flash. */
export function useStill(): boolean {
  return useContext(StillContext);
}

/**
 * Whether a canvas should keep animating.
 *
 * GSAP-driven sections get their reduced-motion behaviour from `useStill` alone,
 * because a ScrollTrigger that is never created costs nothing. A raw
 * `requestAnimationFrame` loop is different: it keeps running whatever the page
 * thinks about motion, and whatever the viewport is showing. This template has two
 * of them, and left ungated they burn a full frame budget on a particle field that
 * scrolled off screen ten sections ago — while the page's own pause control reports
 * that everything has stopped.
 *
 * So the answer combines both questions: is motion wanted, and is this element
 * anywhere near the viewport.
 *
 * `rootMargin` is generous on purpose. Restarting a field costs a re-seed, and
 * thrashing that at the exact moment the element crosses the edge would be worse
 * than the frames it saves.
 */
export function useAnimationActive(
  ref: React.RefObject<HTMLElement | null>,
): boolean {
  const still = useStill();
  // Optimistic: on the first client frame the observer has not reported yet, and
  // starting is cheaper to undo than a visible stall is to explain.
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry?.isIntersecting ?? true),
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  // A backgrounded tab is the other way an animation can be invisible, and the
  // browser does not always throttle a canvas loop to nothing on its own. Cheap to
  // observe, and it means a template left open in a stale tab stops costing the
  // machine anything.
  useEffect(() => {
    const read = () => setPageVisible(!document.hidden);
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);

  return !still && onScreen && pageVisible;
}
