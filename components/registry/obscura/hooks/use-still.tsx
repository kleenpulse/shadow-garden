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
// Consumers SKIP their animation rather than running it at zero duration, and
// the WebGPU renderers draw exactly one frame and stop (SPEC §V70). Never
// running a reveal leaves every element at its natural, final state — which is
// exactly what reduced motion should look like.

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
