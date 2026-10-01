"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import { cn } from "@/lib/utils";

// One black shape that hosts a rotating set of live activities. Each activity
// supplies three views — the compact pill's two slots and the expanded card —
// and the island morphs between them: content leaves fast, the shell springs
// to its new size, and the incoming content arrives once the shape has all
// but landed. Text riding a shell through a resize reads as smeared even when
// it is scale-corrected, so it never does.
export interface IslandActivity {
  id: string;
  /** Read out for the compact pill, e.g. "Timer, running". */
  label: string;
  /** Left of the cutout in the compact pill: a glyph, artwork or ring. */
  leading: ReactNode;
  /** Right of the cutout: the one number worth glancing at. */
  trailing: ReactNode;
  /** The card the pill opens into. Brings its own padding. */
  expanded: ReactNode;
}

export interface LiveActivityProps {
  activities: IslandActivity[];
  /** Id of the activity on show. Changing it morphs the island to that one. */
  activity?: string;
  /** Rotate through the activities on a timer while nobody is engaging. */
  autoCycle?: boolean;
  /** Seconds each activity holds the island before the next takes over. */
  cycleInterval?: number;
  /** Spring stiffness of the shell — higher lands faster. */
  stiffness?: number;
  /** Spring damping — lower overshoots and wobbles on arrival. */
  damping?: number;
  /** Blur, in px, that content dissolves through on its way in and out. */
  contentBlur?: number;
  /** Progress, rings and the focus outline. */
  accent?: string;
  /** Freezes the clock every activity reads, and with it the cycle. */
  paused?: boolean;
  /** When true, every morph lands instantly and nothing spins. */
  reducedMotion?: boolean;
  onActivityChange?: (id: string) => void;
  className?: string;
}

type Updater<T> = T | ((prev: T) => T);

interface IslandContextValue {
  /** Seconds since mount, stopped while paused, quantised to the tick rate. */
  elapsed: number;
  paused: boolean;
  expanded: boolean;
  reduced: boolean;
  accent: string;
  read(key: string): unknown;
  write(key: string, next: (prev: unknown) => unknown): void;
}

const IslandContext = createContext<IslandContextValue | null>(null);

function useIslandContext() {
  const ctx = useContext(IslandContext);
  if (!ctx) throw new Error("Island views must render inside <LiveActivity>");
  return ctx;
}

/** Clock and mode for views rendered inside the island. */
export function useIsland() {
  const { elapsed, paused, expanded, reduced, accent } = useIslandContext();
  return { elapsed, paused, expanded, reduced, accent };
}

/**
 * State shared by every view of an activity. The compact pill and the card are
 * separate trees — both are mounted at once while they crossfade — so state
 * kept in either would fork. It lives in the island instead, keyed by name.
 */
export function useIslandState<T>(key: string, initial: T) {
  const { read, write } = useIslandContext();
  const stored = read(key);
  const value = stored === undefined ? initial : (stored as T);
  const set = useCallback(
    (next: Updater<T>) =>
      write(key, (prev) => {
        const base = prev === undefined ? initial : (prev as T);
        return typeof next === "function"
          ? (next as (p: T) => T)(base)
          : next;
      }),
    // `initial` only matters before the first write; tracking it would hand
    // callers a new setter on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, write],
  );
  return [value, set] as const;
}

// Ten commits a second is plenty for clocks and progress; anything that has to
// move smoothly animates itself between ticks.
const TICK_HZ = 10;

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function LiveActivity({
  activities,
  activity,
  autoCycle = true,
  cycleInterval = 4,
  stiffness = 420,
  damping = 25,
  contentBlur = 6,
  accent = "#a855f7",
  paused = false,
  reducedMotion = false,
  onActivityChange,
  className,
}: LiveActivityProps) {
  const osReduce = useReducedMotion();
  const reduce = Boolean(osReduce) || reducedMotion;

  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const time = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  useAnimationLoop({
    target: rootRef,
    halted: paused,
    onFrame: ({ dt }) => {
      time.current += dt;
      const tick = Math.floor(time.current * TICK_HZ) / TICK_HZ;
      setElapsed((prev) => (prev === tick ? prev : tick));
    },
  });

  const [store, setStore] = useState<Record<string, unknown>>({});
  const read = useCallback((key: string) => store[key], [store]);
  const write = useCallback(
    (key: string, next: (prev: unknown) => unknown) =>
      setStore((s) => ({ ...s, [key]: next(s[key]) })),
    [],
  );

  const [picked, setPicked] = useState(activity ?? activities[0]?.id);
  const [requested, setRequested] = useState(activity);
  const [cycling, setCycling] = useState(autoCycle);
  if (activity !== requested || autoCycle !== cycling) {
    // Without the cycle the island shows what `activity` says; leaving it on
    // whatever the cycle last landed on makes the prop a liar.
    if (activity !== undefined && (activity !== requested || !autoCycle)) {
      setPicked(activity);
    }
    setRequested(activity);
    setCycling(autoCycle);
  }
  const index = Math.max(
    0,
    activities.findIndex((a) => a.id === picked),
  );
  const current = activities[index];

  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const refocusPill = useRef(false);

  const step = useCallback(
    (dir: 1 | -1) => {
      const n = activities.length;
      if (n < 2) return;
      const id = activities[(index + dir + n) % n].id;
      setPicked(id);
      onActivityChange?.(id);
    },
    [activities, index, onActivityChange],
  );

  // The cycle restarts its count whenever something else changed the activity,
  // and stands still while anyone is looking at, pointing at or tabbed into it.
  const lastSwitch = useRef(0);
  useEffect(() => {
    lastSwitch.current = time.current;
    // A swap remounts the pill under a new key. If the outgoing one held focus,
    // hand it on now, while that one is still mounted and exiting — otherwise
    // focus falls to the body and the arrow keys stop working after one press.
    if (!expanded && rootRef.current?.contains(document.activeElement)) {
      pillRef.current?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const held = expanded || hovered || focused;
  useEffect(() => {
    if (!autoCycle || held) {
      lastSwitch.current = elapsed;
      return;
    }
    if (elapsed - lastSwitch.current < cycleInterval) return;
    lastSwitch.current = elapsed;
    step(1);
  }, [elapsed, autoCycle, held, cycleInterval, step]);

  const collapse = useCallback((returnFocus: boolean) => {
    refocusPill.current = returnFocus;
    setExpanded(false);
  }, []);

  useEffect(() => {
    if (expanded) {
      cardRef.current?.focus({ preventScroll: true });
      return;
    }
    if (refocusPill.current) {
      refocusPill.current = false;
      pillRef.current?.focus({ preventScroll: true });
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) collapse(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [expanded, collapse]);

  const onRootKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && expanded) {
      e.preventDefault();
      collapse(true);
    }
  };

  const onPillKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
    }
  };

  const ctx = useMemo<IslandContextValue>(
    () => ({
      elapsed,
      paused,
      expanded,
      reduced: reduce,
      accent,
      read,
      write,
    }),
    [elapsed, paused, expanded, reduce, accent, read, write],
  );

  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness, damping };

  const blur = reduce ? 0 : contentBlur;
  const gone = {
    opacity: 0,
    scale: reduce ? 1 : 0.92,
    ...(blur > 0 ? { filter: `blur(${blur}px)` } : {}),
  };
  const shown = {
    opacity: 1,
    scale: 1,
    ...(blur > 0 ? { filter: "blur(0px)" } : {}),
    transition: reduce
      ? { duration: 0 }
      : { duration: 0.3, delay: 0.12, ease: EASE_OUT },
  };
  const leaving = {
    ...gone,
    transition: reduce ? { duration: 0 } : { duration: 0.12 },
  };

  if (!current) return null;

  return (
    <IslandContext.Provider value={ctx}>
      <MotionConfig transition={spring}>
        <div
          ref={rootRef}
          className={cn("flex w-full justify-center", className)}
          style={{ containerType: "inline-size" }}
          onKeyDown={onRootKeyDown}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (rootRef.current?.contains(e.relatedTarget as Node)) return;
            setFocused(false);
            if (expanded) collapse(false);
          }}
        >
          {/* Radius sits in `style` so motion corrects it through the layout
              scale; as a class it would stretch into an ellipse mid-morph. */}
          <motion.div
            layout
            whileTap={expanded || reduce ? undefined : { scale: 0.96 }}
            className={cn(
              "relative overflow-hidden bg-black text-white outline-offset-2",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--island-accent)]",
              expanded && "shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]",
            )}
            style={
              {
                borderRadius: expanded ? 32 : 20,
                "--island-accent": accent,
              } as CSSProperties
            }
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {expanded ? (
                <motion.div
                  key={`${current.id}:card`}
                  ref={cardRef}
                  role="group"
                  aria-label={current.label}
                  tabIndex={-1}
                  layout="position"
                  initial={gone}
                  animate={shown}
                  exit={leaving}
                  className="w-[min(22.5rem,calc(100cqw-1rem))] outline-none"
                >
                  {current.expanded}
                </motion.div>
              ) : (
                <motion.button
                  key={`${current.id}:pill`}
                  ref={pillRef}
                  type="button"
                  aria-expanded={false}
                  onClick={() => setExpanded(true)}
                  onKeyDown={onPillKeyDown}
                  layout="position"
                  initial={gone}
                  animate={shown}
                  exit={leaving}
                  className="flex h-9 items-center gap-2 pr-3 pl-1.5 outline-none"
                >
                  <span className="sr-only">{current.label}</span>
                  <span aria-hidden className="flex min-w-6 items-center">
                    {current.leading}
                  </span>
                  {/* The cutout: hardware sits here, so content never does. */}
                  <span aria-hidden className="w-14 shrink-0" />
                  {/* Its own layout node, so when the pill widens or narrows
                      under it the count rides the shell's edge instead of
                      landing at the new edge while the clip is still growing
                      towards it — which reads as the number blinking out. */}
                  <motion.span
                    layout="position"
                    aria-hidden
                    className="flex min-w-6 items-center justify-end"
                  >
                    {current.trailing}
                  </motion.span>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </MotionConfig>
    </IslandContext.Provider>
  );
}
