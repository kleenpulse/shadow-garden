"use client";

import { useEffect, useState } from "react";

// A media query as a boolean.
//
// Replaces `react-responsive`, which the source pulled in for exactly this. The
// platform has had `matchMedia` for over a decade and it is four lines; the
// library was a dependency, a provider and a re-render per resize event.
//
// Returns false on the server and on the first client render — the layout has to
// commit to something before it can measure, and the desktop branch is the one
// that degrades more gracefully at an unknown size.

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    const read = () => setMatches(list.matches);
    read();
    list.addEventListener("change", read);
    return () => list.removeEventListener("change", read);
  }, [query]);

  return matches;
}
