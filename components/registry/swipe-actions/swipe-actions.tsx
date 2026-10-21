"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";

// List rows you swipe to reveal actions, the way iOS Mail does it.
//
// The row content is the only thing that moves. The actions sit behind it as
// slices that are sized from the gap the content leaves, every frame, through
// motion values: n actions split the revealed gap into n equal bands, so the tray
// never paints under the content and the rows need no opaque background. Past the
// tray the content either rubber-bands (the iOS formula) or, with `fullSwipe`,
// keeps tracking the finger until it crosses the threshold. Crossing it springs
// `arm` from 0 to 1, and that spring is the snap you feel: the outermost slice
// grows over the others to fill the whole gap and its label jumps to the content
// edge. Let go while armed and that action runs.
//
// A dismiss action flies the content off first and calls `onAction` once it has
// left; the parent removes the row and the exit collapses it. The component never
// removes a row on its own, and never moves one unless a hand or a key asked.
//
// The gesture is hand-rolled on pointer events rather than motion's `drag`,
// because the row has to share the touch with the page: `touch-pan-y` keeps
// vertical scrolling native, the axis is decided after a few pixels, and only a
// horizontal lock captures the pointer. `drag="x"` would claim the touch first.
//
// `select-none` because rows carry text: a drag across it starts a selection, a
// press on that selection starts a native drag-and-drop, the browser answers with
// `pointercancel`, and the row stops dead under a moving finger.

export interface SwipeAction {
  id: string;
  label: string;
  /** Drawn above the label, in the label's color. */
  icon?: ReactNode;
  /** Fill of the action's slice. The label turns near-black when white would be hard to read on it. */
  color: string;
  /** The row flies off before `onAction` fires, and the list expects it removed. */
  dismiss?: boolean;
  /** What screen readers hear after it runs, such as "Archived". Defaults to the label. */
  announce?: string;
}

export interface SwipeRow {
  id: string;
  /** Names the row in announcements. The default row shows it as the first line. */
  title: string;
  /** Second line of the default row. */
  description?: string;
  /** Right-hand detail of the default row, such as a time. */
  meta?: string;
}

/** Actions for one side. The first is the outermost, and it is the one a full swipe runs. */
export type SwipeActionList<T extends SwipeRow = SwipeRow> =
  | SwipeAction[]
  | ((row: T) => SwipeAction[]);

export interface SwipeActionsProps<T extends SwipeRow = SwipeRow> {
  rows: T[];
  /** Revealed by swiping right. */
  leading?: SwipeActionList<T>;
  /** Revealed by swiping left. */
  trailing?: SwipeActionList<T>;
  /** An action ran. For a dismiss action, remove the row here. */
  onAction?: (rowId: string, actionId: string) => void;
  /** Custom row content. Defaults to title, description and meta. */
  renderRow?: (row: T) => ReactNode;
  /** Width of each action button once it is fully shown, in px. */
  revealWidth?: number;
  /** Swipe far enough and the outer action runs on its own. */
  fullSwipe?: boolean;
  /** How far across the row a full swipe has to go, in percent. */
  fullSwipeThreshold?: number;
  /** Resistance past the last button. 0 is a hard stop. */
  rubberBand?: number;
  /** A flick faster than this, in px/s, opens or closes the row. */
  velocityThreshold?: number;
  /** How hard the row springs to where it lands. */
  stiffness?: number;
  /** How fast that spring settles. */
  damping?: number;
  /** Rows land and fold away instantly. Finger tracking stays live. */
  reducedMotion?: boolean;
  className?: string;
}

type Side = "leading" | "trailing";

interface Settings {
  rows: SwipeRow[];
  onAction?: (rowId: string, actionId: string) => void;
  revealWidth: number;
  fullSwipe: boolean;
  fullSwipeThreshold: number;
  rubberBand: number;
  velocityThreshold: number;
  stiffness: number;
  damping: number;
  reduce: boolean;
}

// What a row needs from its list. One object for the list's lifetime, so rows
// never re-render because a callback changed identity.
interface ListApi {
  settings: { readonly current: Settings };
  /** This row is open now. Closes whichever row was. */
  claim(id: string, close: () => void): void;
  release(id: string): void;
  /** A press landed on this row. Closes any other open row. */
  touch(id: string): void;
  move(id: string, to: number | "first" | "last"): void;
  /** This row is leaving with focus inside it. Hand focus to a neighbour. */
  handoff(id: string): void;
  announce(text: string): void;
  activate(id: string): void;
  /** The row's focus target, for the arrow keys. Returns the unregister. */
  register(id: string, el: HTMLElement): () => void;
}

/** Travel, in px, before the gesture picks an axis. */
const AXIS_SLOP = 6;
/** Horizontal wins only when it beats vertical by this factor. */
const AXIS_BIAS = 1.2;
/** Seconds of release velocity folded into the open/close decision. */
const PROJECTION = 0.15;
/** Only pointer samples this recent, in ms, count toward release velocity. */
const VELOCITY_WINDOW = 80;
/** Past the tray, the arm point is never closer than this to the last button. */
const ARM_MARGIN = 24;
/** Pull back this far under the arm point before it disarms, so it never flickers. */
const ARM_HYSTERESIS = 12;
/** A slice shows its label from this width, fully by LABEL_FROM + LABEL_SPAN. */
const LABEL_FROM = 40;
const LABEL_SPAN = 16;
/** A dismissed row flies this far past its own width. */
const FLY_OUT = 1.05;
/** If the row is still in `rows` this long after a dismiss, it comes back. */
const REMOVAL_GRACE = 700;

const ARM_SPRING = { type: "spring" as const, stiffness: 700, damping: 50 };
const FLY_SPRING = { type: "spring" as const, stiffness: 900, damping: 60, restDelta: 1 };
const FOLD = { duration: 0.24, ease: [0.32, 0.72, 0, 1] as const };

export default function SwipeActions<T extends SwipeRow>({
  rows,
  leading,
  trailing,
  onAction,
  renderRow,
  revealWidth = 76,
  fullSwipe = true,
  fullSwipeThreshold = 60,
  rubberBand = 0.55,
  velocityThreshold = 500,
  stiffness = 500,
  damping = 42,
  reducedMotion = false,
  className,
}: SwipeActionsProps<T>) {
  const reduce = Boolean(useReducedMotion()) || reducedMotion;

  const rootRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Keyed, so the same sentence twice in a row is a new node and is read again.
  const [message, setMessage] = useState({ text: "", key: 0 });

  // Gesture handlers outlive the render that bound them, so they read props from
  // here. Written after commit, never during render.
  const settings = useRef<Settings>({
    rows,
    onAction,
    revealWidth,
    fullSwipe,
    fullSwipeThreshold,
    rubberBand,
    velocityThreshold,
    stiffness,
    damping,
    reduce,
  });
  useLayoutEffect(() => {
    settings.current = {
      rows,
      onAction,
      revealWidth,
      fullSwipe,
      fullSwipeThreshold,
      rubberBand,
      velocityThreshold,
      stiffness,
      damping,
      reduce,
    };
  });

  const openRow = useRef<{ id: string; close: () => void } | null>(null);
  const targets = useRef(new Map<string, HTMLElement>());

  const api = useMemo<ListApi>(() => {
    const focus = (id: string, preventScroll: boolean) => {
      setActiveId(id);
      targets.current.get(id)?.focus({ preventScroll });
    };
    return {
      settings,
      claim(id, close) {
        const prev = openRow.current;
        if (prev && prev.id !== id) prev.close();
        openRow.current = { id, close };
      },
      release(id) {
        if (openRow.current?.id === id) openRow.current = null;
      },
      touch(id) {
        const prev = openRow.current;
        if (prev && prev.id !== id) prev.close();
      },
      move(id, to) {
        const list = settings.current.rows;
        if (list.length === 0) return;
        const from = list.findIndex((row) => row.id === id);
        const index =
          to === "first"
            ? 0
            : to === "last"
              ? list.length - 1
              : Math.min(list.length - 1, Math.max(0, from + to));
        const next = list[index];
        if (next) focus(next.id, false);
      },
      handoff(id) {
        const list = settings.current.rows;
        const from = list.findIndex((row) => row.id === id);
        const next = list[from + 1] ?? list[from - 1];
        if (next && next.id !== id) focus(next.id, true);
      },
      announce(text) {
        setMessage((prev) => ({ text, key: prev.key + 1 }));
      },
      activate(id) {
        setActiveId(id);
      },
      register(id, el) {
        targets.current.set(id, el);
        // Identity-checked: a row re-added under the same id can mount before
        // the old one finishes leaving, and must keep its entry.
        return () => {
          if (targets.current.get(id) === el) targets.current.delete(id);
        };
      },
    };
  }, []);

  // One set of listeners per list, so a second instance (a hover card, a split
  // view) only ever closes its own rows. A press outside closes the open row,
  // and so does any scroll that moves the list, as it does on iOS.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const open = openRow.current;
      if (!open) return;
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      open.close();
    };
    const onScroll = (event: Event) => {
      const open = openRow.current;
      const root = rootRef.current;
      if (!open || !root) return;
      const target = event.target;
      if (target === document || (target instanceof Node && target.contains(root))) {
        open.close();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  // Roving tabindex: the list is one tab stop, and the arrows walk the rows.
  const tabId =
    activeId !== null && rows.some((row) => row.id === activeId)
      ? activeId
      : (rows[0]?.id ?? null);

  return (
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      <div ref={rootRef} className={cn("relative w-full", className)}>
        {/* role="list" because Safari drops list semantics from a list with
            list-style: none. */}
        <ul role="list" className="m-0 list-none p-0">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <Row
                key={row.id}
                id={row.id}
                title={row.title}
                content={renderRow ? renderRow(row) : <DefaultRow row={row} />}
                leading={actionsFor(leading, row)}
                trailing={actionsFor(trailing, row)}
                tabbable={row.id === tabId}
                buttonWidth={revealWidth}
                reduce={reduce}
                api={api}
              />
            ))}
          </AnimatePresence>
        </ul>
        <p aria-live="polite" className="sr-only">
          <span key={message.key}>{message.text}</span>
        </p>
      </div>
    </MotionConfig>
  );
}

function actionsFor<T extends SwipeRow>(
  list: SwipeActionList<T> | undefined,
  row: T,
): SwipeAction[] {
  if (!list) return [];
  return typeof list === "function" ? list(row) : list;
}

interface RowProps {
  id: string;
  title: string;
  content: ReactNode;
  leading: SwipeAction[];
  trailing: SwipeAction[];
  tabbable: boolean;
  buttonWidth: number;
  reduce: boolean;
  api: ListApi;
}

interface Gesture {
  pointer: number;
  startX: number;
  startY: number;
  /** Where the content was when the press landed. */
  origin: number;
  axis: "x" | "y" | null;
  /** Row width, read when the press lands rather than at mount. */
  width: number;
  armed: boolean;
  samples: { t: number; x: number }[];
}

function Row({
  id,
  title,
  content,
  leading,
  trailing,
  tabbable,
  buttonWidth,
  reduce,
  api,
}: RowProps) {
  const present = useIsPresent();
  const x = useMotionValue(0);
  const arm = useMotionValue(0);
  const [open, setOpen] = useState<Side | null>(null);
  const bodyId = useId();
  const hintId = useId();

  const surfaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const gesture = useRef<Gesture | null>(null);
  const unbind = useRef<(() => void) | null>(null);
  const flight = useRef<(() => void) | null>(null);
  const grace = useRef<number | undefined>(undefined);
  const status = useRef({
    open: null as Side | null,
    /** Where x is headed, so a tap that caught a spring can let it finish. */
    target: 0,
    committing: false,
    suppressClick: false,
    /** The tray whose first button should take focus once it is interactive. */
    focusSide: null as Side | null,
  });
  const latest = useRef({ id, title, leading, trailing, present });
  useLayoutEffect(() => {
    latest.current = { id, title, leading, trailing, present };
  });

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    return api.register(id, el);
  }, [api, id]);

  useEffect(() => {
    const listeners = unbind;
    const flying = flight;
    const timer = grace;
    return () => {
      listeners.current?.();
      flying.current?.();
      window.clearTimeout(timer.current);
      api.release(id);
    };
  }, [api, id]);

  // Trays are inert while closed, so a key that opens one can only move focus
  // into it after the commit that lifts `inert`.
  useLayoutEffect(() => {
    if (!open || status.current.focusSide !== open) return;
    status.current.focusSide = null;
    focusInnermost(open);
  });

  function settings() {
    return api.settings.current;
  }

  function actionsOn(side: Side) {
    return side === "leading" ? latest.current.leading : latest.current.trailing;
  }

  function trayWidth(side: Side) {
    return settings().revealWidth * actionsOn(side).length;
  }

  function glide(to: number, velocity = 0, onComplete?: () => void) {
    status.current.target = to;
    const s = settings();
    if (s.reduce) {
      x.jump(to);
      onComplete?.();
      return;
    }
    animate(x, to, {
      type: "spring",
      stiffness: s.stiffness,
      damping: s.damping,
      velocity,
      restDelta: 0.5,
      restSpeed: 10,
      onComplete,
    });
  }

  function snap(armed: boolean) {
    if (settings().reduce) arm.jump(armed ? 1 : 0);
    else animate(arm, armed ? 1 : 0, ARM_SPRING);
  }

  function trayHasFocus() {
    const active = document.activeElement;
    return (
      !!active &&
      active !== contentRef.current &&
      !!surfaceRef.current?.contains(active)
    );
  }

  function mark(side: Side | null) {
    if (status.current.open === side) return;
    status.current.open = side;
    setOpen(side);
    // Closed from outside (a press elsewhere, a scroll, another row opening):
    // focus is the user's business there, so it stays where they put it.
    if (side) api.claim(latest.current.id, () => close(0, "none"));
    else api.release(latest.current.id);
  }

  /**
   * `auto` pulls focus back to the row only if it was inside the tray, because
   * closing makes the tray inert and focus would drop to the body. `row` always
   * lands on the row; `none` leaves focus alone.
   */
  function close(velocity = 0, focus: "auto" | "row" | "none" = "auto") {
    const pull = focus === "row" || (focus === "auto" && trayHasFocus());
    glide(0, velocity);
    mark(null);
    if (pull) contentRef.current?.focus({ preventScroll: true });
  }

  function openTo(side: Side, velocity = 0) {
    glide(signOf(side) * trayWidth(side), velocity);
    mark(side);
  }

  function focusInnermost(side: Side) {
    const count = actionsOn(side).length;
    buttons.current.get(`${side}:${count - 1}`)?.focus({ preventScroll: true });
  }

  function fire(action: SwipeAction) {
    settings().onAction?.(latest.current.id, action.id);
    api.announce(`${action.announce ?? action.label}: ${latest.current.title}`);
  }

  function commit(side: Side, action: SwipeAction, velocity = 0) {
    if (status.current.committing) return;

    if (!action.dismiss) {
      const pull = trayHasFocus();
      fire(action);
      // The slice stays expanded while the row slides home, then resets.
      glide(0, velocity, () => {
        if (!gesture.current) arm.jump(0);
      });
      mark(null);
      if (pull) contentRef.current?.focus({ preventScroll: true });
      return;
    }

    status.current.committing = true;
    if (surfaceRef.current?.contains(document.activeElement)) {
      api.handoff(latest.current.id);
    }
    mark(null);
    snap(true);

    const width = surfaceRef.current?.offsetWidth ?? 0;
    const away = signOf(side) * width * FLY_OUT;
    status.current.target = away;

    let fired = false;
    const done = () => {
      if (fired) return;
      fired = true;
      flight.current?.();
      flight.current = null;
      fire(action);
      // The parent owns the data. If it kept the row, bring the row back
      // rather than leave a blank slot.
      grace.current = window.setTimeout(() => {
        if (!latest.current.present) return;
        status.current.committing = false;
        glide(0, 0, () => {
          if (!gesture.current) arm.jump(0);
        });
      }, REMOVAL_GRACE);
    };

    if (settings().reduce) {
      done();
      return;
    }
    // Fire the moment the content clears the row, not when the spring rests:
    // its tail is off screen, and waiting for it reads as lag before the fold.
    flight.current = x.on("change", (v) => {
      if (Math.abs(v) >= width) done();
    });
    animate(x, away, { ...FLY_SPRING, velocity, onComplete: done });
  }

  // Where the content sits for a raw finger offset, and whether that arms the
  // full swipe.
  function place(raw: number, g: Gesture) {
    const s = settings();
    const side: Side = raw < 0 ? "trailing" : "leading";
    const count = actionsOn(side).length;
    if (count === 0 || raw === 0) {
      if (g.armed) {
        g.armed = false;
        snap(false);
      }
      return 0;
    }
    const reach = Math.abs(raw);
    const tray = s.revealWidth * count;
    let out: number;
    if (reach <= tray) out = reach;
    else if (s.fullSwipe) out = Math.min(reach, g.width);
    else out = tray + rubber(reach - tray, s.rubberBand, g.width);

    let armed = false;
    if (s.fullSwipe) {
      const at = Math.max((s.fullSwipeThreshold / 100) * g.width, tray + ARM_MARGIN);
      armed = out >= (g.armed ? at - ARM_HYSTERESIS : at);
    }
    if (armed !== g.armed) {
      g.armed = armed;
      snap(armed);
    }
    return signOf(side) * out;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const surface = surfaceRef.current;
    if (!surface || gesture.current || status.current.committing) return;

    api.touch(latest.current.id);
    status.current.suppressClick = false;
    // Catch a spring mid-flight, the way a finger stops a moving scroll view.
    x.stop();
    arm.jump(0);
    gesture.current = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: x.get(),
      axis: null,
      width: surface.offsetWidth,
      armed: false,
      samples: [],
    };

    // On the window, not the row: a fast first move can land outside the row
    // before the axis is known and the pointer is captured.
    const move = (e: PointerEvent) => onMove(e);
    const up = (e: PointerEvent) => onEnd(e, true);
    const cancel = (e: PointerEvent) => onEnd(e, false);
    // Only the capture this row took. A touch is captured implicitly by the
    // element under the finger, and taking it over fires `lostpointercapture`
    // on that element, which bubbles here: read as a cancel, it would end
    // every touch swipe the moment the axis locked.
    const lost = (e: PointerEvent) => {
      if (e.target === surface) onEnd(e, false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    surface.addEventListener("lostpointercapture", lost);
    unbind.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      surface.removeEventListener("lostpointercapture", lost);
    };
  }

  function onMove(event: PointerEvent) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointer) return;
    // A button let go outside the window before the lock never sends a
    // pointerup. Without this, the next plain hover would drag the row.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      onEnd(event, false);
      return;
    }
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;

    if (!g.axis) {
      if (Math.hypot(dx, dy) < AXIS_SLOP) return;
      if (Math.abs(dx) > AXIS_BIAS * Math.abs(dy)) {
        g.axis = "x";
        status.current.suppressClick = true;
        // Captured only now: before the lock, the page may still want this
        // pointer for a scroll.
        try {
          surfaceRef.current?.setPointerCapture(g.pointer);
        } catch {}
      } else {
        g.axis = "y";
        onEnd(event, false);
        return;
      }
    }

    const shown = place(g.origin + dx, g);
    x.set(shown);
    g.samples.push({ t: event.timeStamp, x: shown });
    if (g.samples.length > 16) g.samples.shift();
  }

  function onEnd(event: PointerEvent, released: boolean) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointer) return;
    gesture.current = null;
    unbind.current?.();
    unbind.current = null;

    if (g.axis !== "x") {
      // A vertical scroll closes an open row, as it does on iOS. A tap lets
      // whatever it interrupted finish; the click decides the rest.
      if (g.axis === "y" && status.current.open) close();
      else glide(status.current.target);
      return;
    }

    const s = settings();
    const v = released ? velocityOf(g.samples, event.timeStamp) : 0;
    const at = x.get();
    const side: Side | null = at < 0 ? "trailing" : at > 0 ? "leading" : null;

    if (released && g.armed && side) {
      const primary = actionsOn(side)[0];
      if (primary) {
        commit(side, primary, v);
        return;
      }
    }
    if (g.armed) snap(false);
    if (!side) {
      close(v);
      return;
    }

    const sign = signOf(side);
    // A real flick goes the way it was thrown. Anything slower is decided by
    // where the row would coast to.
    const keep =
      Math.abs(v) > s.velocityThreshold
        ? sign * v > 0
        : sign * (at + v * PROJECTION) > trayWidth(side) / 2;
    if (keep) openTo(side, v);
    else close(v);
  }

  function onClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (status.current.suppressClick) {
      status.current.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // A tap on an open row closes it and goes no further, as on iOS.
    if (status.current.open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  function onBlur(event: ReactFocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || surfaceRef.current?.contains(next)) return;
    if (status.current.open && !status.current.committing) close(0, "none");
  }

  function reveal(side: Side) {
    api.touch(latest.current.id);
    arm.jump(0);
    if (status.current.open === side) {
      focusInnermost(side);
      return;
    }
    status.current.focusSide = side;
    openTo(side);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.altKey || event.ctrlKey || event.metaKey || status.current.committing) return;
    const key = event.key;

    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      api.move(latest.current.id, key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (key === "Home" || key === "End") {
      event.preventDefault();
      api.move(latest.current.id, key === "Home" ? "first" : "last");
      return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      // Left is a swipe left: it shows the trailing tray, or shuts the leading one.
      const side: Side = key === "ArrowLeft" ? "trailing" : "leading";
      const shown = status.current.open;
      if (shown && shown !== side) {
        event.preventDefault();
        close();
        return;
      }
      if (actionsOn(side).length === 0) return;
      event.preventDefault();
      reveal(side);
      return;
    }
    if (key === "Escape") {
      // Unclaimed when nothing is open, so a host (a dialog, a fullscreen
      // view) still gets its Escape.
      if (status.current.open) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      const primary = latest.current.trailing[0];
      if (primary?.dismiss) {
        event.preventDefault();
        commit("trailing", primary);
      }
    }
  }

  function onTrayKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    side: Side,
    slot: number,
  ) {
    if (event.altKey || event.ctrlKey || event.metaKey || status.current.committing) return;
    const key = event.key;
    if (key === "Escape") {
      event.preventDefault();
      close(0, "row");
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      api.move(latest.current.id, key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (key !== "ArrowLeft" && key !== "ArrowRight") return;

    // Arrows move on screen. Stepping off the inner end goes back to the row
    // and shuts the tray; the outer end is a wall.
    const count = actionsOn(side).length;
    const order = Array.from({ length: count }, (_, i) =>
      side === "leading" ? i : count - 1 - i,
    );
    const at = order.indexOf(slot) + (key === "ArrowRight" ? 1 : -1);
    if (at >= 0 && at < count) {
      event.preventDefault();
      buttons.current.get(`${side}:${order[at]}`)?.focus();
      return;
    }
    if (side === "trailing" ? at < 0 : at >= count) {
      event.preventDefault();
      close(0, "row");
    }
  }

  function registerButton(side: Side, slot: number, el: HTMLButtonElement | null) {
    const key = `${side}:${slot}`;
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  }

  const hint = hintFor(leading, trailing);

  return (
    <motion.li
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={reduce ? { duration: 0 } : FOLD}
      className="relative overflow-hidden border-current/10 not-last:border-b"
    >
      {/* touch-pan-y, not touch-none: the list still has to scroll under a
          vertical swipe on a phone. */}
      <div
        ref={surfaceRef}
        inert={!present}
        className="relative touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onBlur={onBlur}
      >
        {leading.length > 0 ? (
          <Tray
            side="leading"
            actions={leading}
            open={open === "leading"}
            x={x}
            arm={arm}
            buttonWidth={buttonWidth}
            register={registerButton}
            onRun={commit}
            onKeyDown={onTrayKeyDown}
          />
        ) : null}
        <motion.div
          ref={contentRef}
          role="group"
          tabIndex={tabbable ? 0 : -1}
          aria-labelledby={bodyId}
          aria-describedby={hint ? hintId : undefined}
          style={{ x }}
          className="relative focus-visible:outline-2 focus-visible:-outline-offset-2"
          onKeyDown={onKeyDown}
          onFocus={() => api.activate(id)}
          onClickCapture={onClickCapture}
        >
          <div id={bodyId} onDragStart={(event) => event.preventDefault()}>
            {content}
          </div>
        </motion.div>
        {trailing.length > 0 ? (
          <Tray
            side="trailing"
            actions={trailing}
            open={open === "trailing"}
            x={x}
            arm={arm}
            buttonWidth={buttonWidth}
            register={registerButton}
            onRun={commit}
            onKeyDown={onTrayKeyDown}
          />
        ) : null}
      </div>
      {hint ? (
        <span id={hintId} hidden>
          {hint}
        </span>
      ) : null}
    </motion.li>
  );
}

interface TrayProps {
  side: Side;
  actions: SwipeAction[];
  open: boolean;
  x: MotionValue<number>;
  arm: MotionValue<number>;
  buttonWidth: number;
  register: (side: Side, slot: number, el: HTMLButtonElement | null) => void;
  onRun: (side: Side, action: SwipeAction) => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    side: Side,
    slot: number,
  ) => void;
}

function Tray({
  side,
  actions,
  open,
  x,
  arm,
  buttonWidth,
  register,
  onRun,
  onKeyDown,
}: TrayProps) {
  const count = actions.length;
  // DOM order follows the screen, left to right, so Tab does too. Slot 0 is the
  // outermost action on either side.
  const slots = Array.from({ length: count }, (_, i) =>
    side === "leading" ? i : count - 1 - i,
  );
  return (
    <div inert={!open} className="pointer-events-none absolute inset-0">
      {slots.map((slot) => {
        const action = actions[slot];
        return (
          <Slice
            key={action.id}
            action={action}
            side={side}
            slot={slot}
            count={count}
            x={x}
            arm={arm}
            buttonWidth={buttonWidth}
            buttonRef={(el) => register(side, slot, el)}
            onRun={() => onRun(side, action)}
            onKeyDown={(event) => onKeyDown(event, side, slot)}
          />
        );
      })}
    </div>
  );
}

interface SliceProps {
  action: SwipeAction;
  side: Side;
  slot: number;
  count: number;
  x: MotionValue<number>;
  arm: MotionValue<number>;
  buttonWidth: number;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onRun: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

// Each slice is a full-row-wide button parked just outside the row and slid in by
// transform, so a frame of dragging costs no layout. It shows from its inner
// edge outward; the slice outside it sits on top and covers the rest.
function Slice({
  action,
  side,
  slot,
  count,
  x,
  arm,
  buttonWidth,
  buttonRef,
  onRun,
  onKeyDown,
}: SliceProps) {
  const sign = signOf(side);
  const depth = count - 1 - slot;
  const primary = slot === 0;

  const offset = useTransform([x, arm], ([xv, av]: number[]) =>
    band(xv, av, sign, count, depth, primary).offset,
  );
  // Centred in its band; the armed primary's label rides the content edge.
  const labelX = useTransform([x, arm], ([xv, av]: number[]) => {
    const b = band(xv, av, sign, count, depth, primary);
    return -sign * ((b.width - buttonWidth) / 2) * (primary ? 1 - b.arm : 1);
  });
  const labelOpacity = useTransform([x, arm], ([xv, av]: number[]) => {
    const b = band(xv, av, sign, count, depth, primary);
    return Math.min(1, Math.max(0, (b.width - LABEL_FROM) / LABEL_SPAN));
  });

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      className={cn(
        "group/slice pointer-events-auto absolute inset-y-0 w-full overflow-hidden outline-none",
        side === "leading" ? "right-full" : "left-full",
      )}
      style={{
        x: offset,
        zIndex: count - slot,
        backgroundColor: action.color,
        color: inkOn(action.color),
      }}
      onClick={onRun}
      onKeyDown={onKeyDown}
    >
      <motion.span
        className={cn(
          "absolute inset-y-0 flex flex-col items-center justify-center gap-1 px-1 text-xs leading-none font-medium",
          side === "leading" ? "right-0" : "left-0",
        )}
        style={{ width: buttonWidth, x: labelX, opacity: labelOpacity }}
      >
        {action.icon ? (
          <span aria-hidden className="flex [&_svg]:size-5">
            {action.icon}
          </span>
        ) : null}
        <span className="max-w-full truncate">{action.label}</span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-1.5 rounded-md opacity-0 ring-2 ring-current group-focus-visible/slice:opacity-100"
        />
      </motion.span>
    </motion.button>
  );
}

function DefaultRow({ row }: { row: SwipeRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.title}</p>
        {row.description ? (
          <p className="mt-0.5 truncate text-sm opacity-60">{row.description}</p>
        ) : null}
      </div>
      {row.meta ? (
        <span className="shrink-0 text-xs tabular-nums opacity-50">{row.meta}</span>
      ) : null}
    </div>
  );
}

function signOf(side: Side) {
  return side === "leading" ? 1 : -1;
}

/**
 * One slice's band inside the revealed gap. `r` is the gap; n slices split it
 * evenly until `arm` hands it all to the primary. `offset` is the slice's
 * translate from its parking spot outside the row.
 */
function band(
  xv: number,
  av: number,
  sign: number,
  count: number,
  depth: number,
  primary: boolean,
) {
  const r = Math.max(0, sign * xv);
  const armed = Math.min(1, Math.max(0, av));
  const share = (r / count) * (1 - armed);
  const width = primary ? r - (count - 1) * share : share;
  return { offset: sign * (r - depth * share), width, arm: armed };
}

/** iOS rubber band: give that falls off with distance and never reaches `w`. */
function rubber(d: number, c: number, w: number) {
  if (c <= 0 || w <= 0) return 0;
  return (1 - 1 / ((d * c) / w + 1)) * w;
}

function velocityOf(samples: { t: number; x: number }[], now: number) {
  const recent = samples.filter((sample) => now - sample.t <= VELOCITY_WINDOW);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0;
}

/**
 * White on the action color, unless white falls under 3:1 against it (amber,
 * yellow, light greens): then near-black. Only hex colors are read; anything
 * else keeps white.
 */
function inkOn(color: string) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return "#fff";
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05) >= 3 ? "#fff" : "#0a0a0a";
}

function hintFor(leading: SwipeAction[], trailing: SwipeAction[]) {
  const keys = [trailing.length ? "Left" : "", leading.length ? "Right" : ""]
    .filter(Boolean)
    .join(" or ");
  const parts: string[] = [];
  if (keys) parts.push(`Press ${keys} arrow to show actions.`);
  const primary = trailing[0];
  if (primary?.dismiss) parts.push(`Press Delete to ${primary.label.toLowerCase()}.`);
  return parts.join(" ");
}
