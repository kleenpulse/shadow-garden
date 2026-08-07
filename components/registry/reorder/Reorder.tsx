"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Reorder as MotionReorder, useDragControls } from "motion/react";
import { cn } from "@/lib/utils";

// A list you rearrange by dragging a row, and — equally — by grabbing a handle
// with the keyboard and walking it up the list.
//
// The keyboard half is not a courtesy. Motion's Reorder ships the pointer
// gesture and nothing else: no handle wiring, no key handling, no announcements.
// A drag-only sort is a demo, not a component, because there is no keyboard path
// to the same result and no way for a screen reader to learn one exists.
//
// TOUCH-ACTION IS ON THE HANDLE, NOT THE ROW. Motion writes `touch-action`
// itself only when it owns the listener: for `drag="y"` it writes `pan-x`, and
// for a handle-driven drag (`dragListener={false}`) it writes NOTHING AT ALL.
// So a handle without `touch-none` works perfectly on a desktop and scrolls the
// page under every finger. The row keeps the default on purpose — the page must
// still scroll when you drag anywhere that is not the grip.
//
// `select-none` on the row because it carries text: a drag across it selects the
// text, a press starting on that selection begins a native drag-and-drop, the
// browser answers with `pointercancel`, and motion abandons the gesture with the
// row stopped dead under a still-moving cursor.
//
// `layout="position"` rather than `layout`. Full layout animation scale-corrects
// the row box, which distorts the text inside it while the box is interpolating.
// Position-only moves the row and leaves its contents alone.
//
// Controlled: the array lives with the caller and comes back through onReorder.
// What happens to the new order — persist it, undo it, animate a save — is not
// the gesture's business.
export interface ReorderItemData {
  id: string;
  label: string;
  meta?: string;
}

export interface ReorderProps {
  /** Current order. */
  items?: ReorderItemData[];
  /** The new order, on every commit — pointer or keyboard. */
  onReorder?: (next: ReorderItemData[]) => void;
  /** Which way the list runs. */
  axis?: "y" | "x";
  /** Spring tension as displaced rows close up. */
  stiffness?: number;
  /** Spring friction on the same. */
  damping?: number;
  /** Restrict the drag to a grip. False makes the whole row the surface. */
  handle?: boolean;
  /** Scale of a row while it is off the ground. */
  lift?: number;
  /** Shadow under a lifted row. */
  liftShadow?: number;
  /** Space between rows, in px. */
  gap?: number;
  /** Row corner radius, in px. */
  radius?: number;
  /** Row padding. */
  density?: "comfortable" | "compact";
  /** Print the position of each row. */
  showIndex?: boolean;
  /** Grip and grabbed-row tint. */
  accentColor?: string;
  /** Rows change place with no travel; drag and keyboard stay live. */
  reducedMotion?: boolean;
  className?: string;
}

const move = <T,>(list: T[], from: number, to: number): T[] => {
  const next = list.slice();
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
};

export default function Reorder({
  items = [],
  onReorder,
  axis = "y",
  stiffness = 520,
  damping = 38,
  handle = true,
  lift = 1.03,
  liftShadow = 0.35,
  gap = 8,
  radius = 8,
  density = "comfortable",
  showIndex = true,
  accentColor = "#a855f7",
  reducedMotion = false,
  className,
}: ReorderProps) {
  // The id of the row the keyboard is carrying, and the order it was picked up
  // from. Escape restores the second; there is no other way back once the array
  // has already been handed to the caller on every step.
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const originRef = useRef<ReorderItemData[] | null>(null);
  const [message, setMessage] = useState("");

  // Roving tabindex: one stop for the whole list, arrows move between grips.
  const [roving, setRoving] = useState(0);
  const focusWanted = useRef<string | null>(null);
  const gripRefs = useRef(new Map<string, HTMLButtonElement>());

  const index = (id: string) => items.findIndex((item) => item.id === id);

  // Focus follows the ITEM, not the slot. Move row 2 to position 4 and the key
  // that still works is the one under the row you are carrying — chasing the
  // index would leave you holding whatever slid into the space behind you.
  useEffect(() => {
    const id = focusWanted.current;
    if (!id) return;
    focusWanted.current = null;
    gripRefs.current.get(id)?.focus({ preventScroll: true });
  }, [items]);

  const commit = (next: ReorderItemData[], id: string) => {
    focusWanted.current = id;
    setRoving(next.findIndex((item) => item.id === id));
    onReorder?.(next);
  };

  const step = (id: string, delta: number) => {
    const from = index(id);
    const to = Math.min(items.length - 1, Math.max(0, from + delta));
    if (from < 0 || to === from) return;
    commit(move(items, from, to), id);
    setMessage(`Moved to position ${to + 1} of ${items.length}`);
  };

  const jump = (id: string, edge: "start" | "end") => {
    const from = index(id);
    const to = edge === "start" ? 0 : items.length - 1;
    if (from < 0 || to === from) return;
    commit(move(items, from, to), id);
    setMessage(`Moved to position ${to + 1} of ${items.length}`);
  };

  const grab = (id: string) => {
    originRef.current = items;
    setGrabbed(id);
    setMessage(`${label(items, id)}, grabbed. Position ${index(id) + 1} of ${items.length}.`);
  };

  const drop = (id: string) => {
    originRef.current = null;
    setGrabbed(null);
    setMessage(`Dropped at position ${index(id) + 1} of ${items.length}`);
  };

  const cancel = (id: string) => {
    const origin = originRef.current;
    originRef.current = null;
    setGrabbed(null);
    if (origin) {
      const back = origin.findIndex((item) => item.id === id);
      commit(origin, id);
      setMessage(`Cancelled, returned to position ${back + 1} of ${items.length}`);
      return;
    }
    setMessage("Cancelled");
  };

  const [prevKey, nextKey] =
    axis === "y" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];

  const onKeyDown = (event: KeyboardEvent, id: string) => {
    const held = grabbed === id;

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (held) drop(id);
      else grab(id);
      return;
    }
    if (event.key === "Escape" && held) {
      event.preventDefault();
      cancel(id);
      return;
    }
    // Tab while carrying a row would abandon it mid-move with no way to say so.
    if (event.key === "Tab" && held) {
      event.preventDefault();
      return;
    }
    if (event.key === prevKey || event.key === nextKey) {
      event.preventDefault();
      const delta = event.key === nextKey ? 1 : -1;
      if (held) {
        step(id, delta);
        return;
      }
      const to = Math.min(items.length - 1, Math.max(0, index(id) + delta));
      setRoving(to);
      gripRefs.current.get(items[to]?.id ?? "")?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const edge = event.key === "Home" ? "start" : "end";
      if (held) {
        jump(id, edge);
        return;
      }
      const to = edge === "start" ? 0 : items.length - 1;
      setRoving(to);
      gripRefs.current.get(items[to]?.id ?? "")?.focus({ preventScroll: true });
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <MotionReorder.Group
        axis={axis}
        values={items}
        onReorder={(next: ReorderItemData[]) => onReorder?.(next)}
        className={cn("flex list-none", axis === "y" ? "flex-col" : "flex-row")}
        style={{ gap }}
      >
        {items.map((item, i) => (
          <Row
            key={item.id}
            item={item}
            position={i}
            total={items.length}
            axis={axis}
            stiffness={stiffness}
            damping={damping}
            handle={handle}
            lift={lift}
            liftShadow={liftShadow}
            radius={radius}
            density={density}
            showIndex={showIndex}
            accentColor={accentColor}
            reducedMotion={reducedMotion}
            grabbed={grabbed === item.id}
            tabbable={roving === i || (roving >= items.length && i === 0)}
            registerGrip={(node) => {
              if (node) gripRefs.current.set(item.id, node);
              else gripRefs.current.delete(item.id);
            }}
            onGripFocus={() => setRoving(i)}
            onKeyDown={(event) => onKeyDown(event, item.id)}
          />
        ))}
      </MotionReorder.Group>

      {/* Assertive: a move already happened, and a polite queue would report it
          after the next one. */}
      <p aria-live="assertive" aria-atomic className="sr-only">
        {message}
      </p>
    </div>
  );
}

function label(items: ReorderItemData[], id: string): string {
  return items.find((item) => item.id === id)?.label ?? "Row";
}

function Row({
  item,
  position,
  total,
  axis,
  stiffness,
  damping,
  handle,
  lift,
  liftShadow,
  radius,
  density,
  showIndex,
  accentColor,
  reducedMotion,
  grabbed,
  tabbable,
  registerGrip,
  onGripFocus,
  onKeyDown,
}: {
  item: ReorderItemData;
  position: number;
  total: number;
  axis: "y" | "x";
  stiffness: number;
  damping: number;
  handle: boolean;
  lift: number;
  liftShadow: number;
  radius: number;
  density: "comfortable" | "compact";
  showIndex: boolean;
  accentColor: string;
  reducedMotion: boolean;
  grabbed: boolean;
  tabbable: boolean;
  registerGrip: (node: HTMLButtonElement | null) => void;
  onGripFocus: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  const controls = useDragControls();

  return (
    <MotionReorder.Item
      value={item}
      layout="position"
      dragListener={!handle}
      dragControls={controls}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness, damping }
      }
      whileDrag={
        reducedMotion
          ? undefined
          : {
              scale: lift,
              boxShadow: `0 ${Math.round(liftShadow * 26)}px ${Math.round(liftShadow * 44)}px rgb(0 0 0 / ${liftShadow})`,
            }
      }
      className={cn(
        "flex items-center gap-3 border border-hairline bg-panel select-none",
        density === "compact" ? "px-3 py-2" : "px-4 py-3",
        // Horizontal rows share the width and truncate rather than holding their
        // intrinsic size — a row that refuses to shrink pushes the tail of the
        // list off the end of its own container.
        axis === "x" && "min-w-0 flex-1",
        !handle && "cursor-grab active:cursor-grabbing",
      )}
      style={{
        borderRadius: radius,
        outline: grabbed ? `2px solid ${accentColor}` : undefined,
        outlineOffset: 2,
      }}
    >
      <button
        ref={registerGrip}
        type="button"
        // The grip is the drag surface when `handle` is on, so it is the element
        // that must opt out of touch scrolling. See the note at the top.
        className="touch-none grid size-7 shrink-0 cursor-grab place-items-center rounded-md border border-hairline text-ink-mute transition-colors outline-none hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
        style={grabbed ? { color: accentColor, borderColor: accentColor } : undefined}
        aria-roledescription="sortable"
        aria-pressed={grabbed}
        aria-label={`Reorder ${item.label}. Position ${position + 1} of ${total}. Press space to pick up.`}
        tabIndex={tabbable ? 0 : -1}
        onFocus={onGripFocus}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (handle) controls.start(event);
        }}
      >
        <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
          <path
            d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {showIndex ? (
        <span className="w-5 shrink-0 text-right font-display text-[11px] tabular-nums text-ink-mute">
          {position + 1}
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[12px] tracking-[0.12em] text-ink uppercase">
          {item.label}
        </span>
        {item.meta ? (
          <span className="mt-0.5 block truncate font-sans text-[12px] text-ink-mute">
            {item.meta}
          </span>
        ) : null}
      </span>
    </MotionReorder.Item>
  );
}
