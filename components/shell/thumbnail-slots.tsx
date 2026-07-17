"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

// Bounds how many live previews (each a WebGL/canvas context) run at once.
// Cards near the viewport request a slot; only the first `max` requesters are
// granted "live" — the rest render a static poster. Browsers cap WebGL contexts
// (~8-16), so this keeps a long favorites list from exhausting them.

interface SlotActions {
  request: (id: string) => void;
  release: (id: string) => void;
}

const SlotActionsContext = createContext<SlotActions | null>(null);
const SlotLiveContext = createContext<ReadonlySet<string>>(new Set());

export function ThumbnailSlotsProvider({
  max = 6,
  children,
}: {
  max?: number;
  children: ReactNode;
}) {
  // Visible ids in the order they entered view; the first `max` get a live slot.
  const orderRef = useRef<string[]>([]);
  const [live, setLive] = useState<ReadonlySet<string>>(new Set());

  const recompute = useCallback(() => {
    setLive(new Set(orderRef.current.slice(0, max)));
  }, [max]);

  // Stable across renders so a card's IntersectionObserver effect never re-runs
  // just because the live set changed.
  const actions = useMemo<SlotActions>(
    () => ({
      request: (id) => {
        if (!orderRef.current.includes(id)) {
          orderRef.current = [...orderRef.current, id];
          recompute();
        }
      },
      release: (id) => {
        if (orderRef.current.includes(id)) {
          orderRef.current = orderRef.current.filter((x) => x !== id);
          recompute();
        }
      },
    }),
    [recompute],
  );

  return (
    <SlotActionsContext.Provider value={actions}>
      <SlotLiveContext.Provider value={live}>{children}</SlotLiveContext.Provider>
    </SlotActionsContext.Provider>
  );
}

/**
 * Grant this card a live slot while it's near the viewport, capped by the
 * provider's `max`. Returns whether the card currently holds a slot.
 */
export function useThumbnailSlot<T extends Element>(
  id: string,
  ref: RefObject<T | null>,
): boolean {
  const actions = useContext(SlotActionsContext);
  const live = useContext(SlotLiveContext);

  useEffect(() => {
    const el = ref.current;
    if (!el || !actions) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) actions.request(id);
        else actions.release(id);
      },
      // Mount slightly before the card scrolls into view for a seamless reveal.
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      actions.release(id);
    };
  }, [id, actions, ref]);

  return live.has(id);
}
