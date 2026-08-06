"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

// A crossing between two views where one element is the same object in both.
//
// This is the View Transitions API and nothing else — no motion, no FLIP, no
// measurement. The browser snapshots the page, you change it, and it animates
// between the two snapshots. Four things decide whether that works, and all
// four fail silently.
//
//   1. React 19 renders asynchronously. `startViewTransition` takes its "after"
//      snapshot when the callback returns, so a bare `setState` inside it has
//      not committed yet and the browser animates the old page to the old page.
//      `flushSync` inside the callback is the whole fix.
//   2. A `view-transition-name` must be unique in the document at snapshot
//      time. Put the same name on all three cards and the transition is not
//      "less correct" — it is aborted outright. Exactly one card carries the
//      name: the one being crossed to.
//   3. The name has to be on the OLD element before the snapshot is taken, and
//      React has not rendered it yet at the moment of the click. So the name is
//      committed in its own `flushSync` first, and the view change happens in a
//      second one inside the transition. Two flushes, in that order.
//   4. Without suppressing it, `::view-transition-group(root)` cross-fades the
//      entire page around the component — every pixel of whatever it is
//      embedded in. The suppression is scoped to an attribute this component
//      sets on `<html>` for the length of its own transition, so it cannot
//      touch a transition anything else on the page is running.
//
//   5. The two halves of every pair are blended with `plus-lighter`, which adds
//      them. Correct for the browser's own cross-fade and wrong for every other
//      timing — the picture brightens toward white for the length of the
//      transition and snaps back at the end.
//
// And one that fails loudly, in the worst way: a cross-fade is the browser's
// default for every captured pair, which means the outgoing view is drawn at
// half opacity on top of the incoming one for the entire duration. Two
// headings, two paragraphs, ghost tiles behind live text. The fix is not a
// shorter duration — it is to separate the two halves in time so only one of
// them is ever on screen. See `sheet` below.
//
// Where the API is missing the state update runs bare — never behind a feature
// detect that silently does nothing. The crossing degrades to an instant swap,
// which is the correct outcome: a view transition cannot be shortened, only
// skipped.
export type CrossingEasing = "expressive" | "standard" | "linear";
export type CrossingExit = "fade" | "hold" | "slide";

export interface CrossingItem {
  id: string;
  title: string;
  meta: string;
  body: string;
  /** Fill of the tile that travels. */
  tone: string;
}

export interface CrossingProps {
  items?: CrossingItem[];
  /** Length of the crossing, in ms. */
  duration?: number;
  easing?: CrossingEasing;
  /** Carry the title across as a second shared element. Off, only the tile
   *  travels and the title cross-fades with the rest of the view. */
  shareTitle?: boolean;
  /** What the outgoing copy of the tile does while the incoming one arrives.
   *  `hold` keeps it opaque underneath and is the default because it is the
   *  only one with no moment where both gradients are half there; `fade` is
   *  the browser's own behaviour, kept so the difference is visible. */
  exit?: CrossingExit;
  /** Corner radius, in px. */
  radius?: number;
  /** Run the API at all. Off takes the same path an unsupported browser
   *  takes — the state update, bare — which is the only honest way to see it. */
  viewTransition?: boolean;
  /** Announce the destination. A view transition is invisible to assistive
   *  tech, so a crossing that says nothing is a dead end. */
  announce?: boolean;
  accentColor?: string;
  /** No transition is started at all. Branching before the call is the only
   *  correct gate — there is no duration to crush. */
  reducedMotion?: boolean;
  className?: string;
}

const EASING: Record<CrossingEasing, string> = {
  expressive: "cubic-bezier(0.22, 1, 0.36, 1)",
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  linear: "linear",
};

/** Pseudo-element rules, scoped to this instance by an ident-safe namespace.
 *  They have to be document-level rules — `::view-transition-*` lives on the
 *  root, not in the component's subtree — so the namespace is the scoping.
 *
 *  The attribute and the pseudo form ONE compound selector, with no space
 *  between them. A descendant combinator reads as "a group pseudo inside an
 *  element matching this", which nothing is, and the entire sheet is dropped in
 *  silence — leaving the crossing on the UA defaults. Measured: 250ms linear
 *  where 380ms expressive was asked for, `exit` doing nothing at all, and the
 *  whole page cross-fading behind the component because the root suppression
 *  never applied either. Three props were dead and it still looked fine. */
function sheet(
  ns: string,
  duration: number,
  easing: string,
  exit: CrossingExit,
): string {
  const at = `:root[data-crossing="${ns}"]`;
  const group = (n: string) => `${at}::view-transition-group(${ns}-${n})`;
  const old = (n: string) => `${at}::view-transition-old(${ns}-${n})`;
  const fresh = (n: string) => `${at}::view-transition-new(${ns}-${n})`;
  const ms = (fraction: number) => `${Math.round(duration * fraction)}ms`;

  // The outgoing tile, once the incoming one is on its way. `hold` keeps it
  // opaque underneath, which is the only one of the three that never shows a
  // moment of transparency where two gradients are both half there.
  const heroExit =
    exit === "hold"
      ? `${old("hero")} { animation-name: none; opacity: 1; }`
      : exit === "slide"
        ? `${old("hero")} { animation-name: ${ns}-slide; }`
        : `${old("hero")} { animation-name: ${ns}-out; }`;

  // `fade` is the one timing the browser's own blend mode was designed for:
  // two halves whose opacities always sum to one. Everything else here has to
  // opt out of it — see the note below.
  const blend =
    exit === "fade"
      ? [old("body"), fresh("body"), old("title"), fresh("title")]
      : [
          old("body"),
          fresh("body"),
          old("title"),
          fresh("title"),
          old("hero"),
          fresh("hero"),
        ];

  return `
${at}::view-transition-old(root),
${at}::view-transition-new(root) { animation-duration: 0s; }

@keyframes ${ns}-out { to { opacity: 0; } }
@keyframes ${ns}-in { from { opacity: 0; transform: translateY(8px); } }
@keyframes ${ns}-fade { from { opacity: 0; } }
@keyframes ${ns}-slide { to { opacity: 0; transform: translateY(-12px); } }

${group("hero")}, ${group("title")}, ${group("body")} {
  animation-duration: ${duration}ms;
  animation-timing-function: ${easing};
  overflow: clip;
}

/* Both halves of every pair are pinned to the box their group is currently at.
   The UA default is a 100% inline size with an AUTO block size, which means a
   snapshot whose aspect ratio differs from its destination grows to whatever
   height that width implies — and the pseudo-elements live in the top layer,
   so nothing clips it. Measured: a 149x169 tile morphing to 470x124 drew its
   outgoing copy 532px tall, straight through the bottom of the panel and over
   the page beneath. Cover crops instead of overflowing; the title gets contain,
   because letterboxing text is the only way to keep it from being scaled to
   three times its size on the way across. */
${old("hero")}, ${fresh("hero")}, ${old("body")}, ${fresh("body")} {
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}
${old("title")}, ${fresh("title")} {
  inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
  object-position: left center;
}

/* The browser blends the two halves of every pair with plus-lighter, which
   ADDS them. That is exactly right for its own cross-fade, where the two
   opacities always sum to one, and exactly wrong for anything else: hold the
   outgoing tile at full opacity and fade the incoming one in over it and the
   sum climbs toward two, so the gradient washes out to pastel and snaps back to
   its real colour the instant the transition ends. It reads as a brightness
   flash on every crossing and there is nothing in the component's own CSS to
   blame for it. Any timing that is not a symmetric cross-fade has to opt out. */
${blend.join(",\n")} {
  mix-blend-mode: normal;
}

${old("hero")}, ${fresh("hero")} {
  animation-duration: ${duration}ms;
  animation-timing-function: ${easing};
}
${heroExit}

/* The body and the title hand over rather than cross-fade. Run both halves at
   once over the whole duration — the browser default — and every word of the
   outgoing view sits at half opacity on top of every word of the incoming one
   for the length of the transition: two headings, two paragraphs, three ghost
   tiles behind a title. Separating them in time costs nothing and the
   double-exposure is simply gone. The gap is where the tile does its work. */
${old("body")} {
  animation-name: ${ns}-out;
  animation-duration: ${ms(0.4)};
  animation-timing-function: ease-out;
  animation-fill-mode: both;
}
${fresh("body")} {
  animation-name: ${ns}-in;
  animation-duration: ${ms(0.55)};
  animation-delay: ${ms(0.45)};
  animation-timing-function: ${easing};
  animation-fill-mode: both;
}
${old("title")} {
  animation-name: ${ns}-out;
  animation-duration: ${ms(0.3)};
  animation-fill-mode: both;
}
${fresh("title")} {
  animation-name: ${ns}-fade;
  animation-duration: ${ms(0.35)};
  animation-delay: ${ms(0.45)};
  animation-fill-mode: both;
}
`;
}

export default function Crossing({
  items = [],
  duration = 380,
  easing = "expressive",
  shareTitle = true,
  exit = "hold",
  radius = 12,
  viewTransition = true,
  announce = true,
  accentColor = "#a855f7",
  reducedMotion = false,
  className,
}: CrossingProps) {
  // `useId` is not a valid custom-ident — React 19 wraps it in guillemets — and
  // an invalid `view-transition-name` is dropped without a word, taking the
  // whole shared element with it.
  const ns = `sg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [openId, setOpenId] = useState<string | null>(null);
  const [crossing, setCrossing] = useState<string | null>(null);
  // True for exactly the length of a transition. Anything drawn on the shared
  // element while this is set gets baked into a snapshot and flies across the
  // frame with it — which is how the "where you were" ring ended up reading as
  // a stray purple outline crossing the panel.
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const backRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const open = items.find((item) => item.id === openId) ?? null;

  useEffect(() => {
    const root = document.documentElement;
    return () => root.removeAttribute("data-crossing");
  }, []);

  const cross = (nextId: string | null, id: string, label: string) => {
    setSaid(label);
    const commit = () => setOpenId(nextId);
    const root = document.documentElement;

    if (
      !viewTransition ||
      reducedMotion ||
      typeof document.startViewTransition !== "function"
    ) {
      setCrossing(id);
      commit();
      return;
    }

    // Phase one: name the outgoing element and let React put it in the DOM.
    // The snapshot in phase two reads the DOM, not the render queue.
    flushSync(() => {
      setCrossing(id);
      setBusy(true);
    });
    root.setAttribute("data-crossing", ns);
    const transition = document.startViewTransition(() => {
      flushSync(commit);
    });
    const done = () => {
      root.removeAttribute("data-crossing");
      setBusy(false);
    };
    // `then(done, done)` rather than `finally`: an aborted transition rejects
    // `finished`, and a bare `finally` re-throws it as an unhandled rejection
    // in the console of anyone who clicks twice quickly.
    if (transition && transition.finished) {
      transition.finished.then(done, done);
    } else {
      done();
    }
  };

  // Focus follows the crossing. The API animates pixels and moves nothing else,
  // so a keyboard user who opened a card would otherwise be left on a button
  // that no longer exists, with focus back on <body> — and coming back, on
  // nothing at all.
  useEffect(() => {
    if (openId) {
      backRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!crossing) return;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-card="${crossing}"]`)
      ?.focus({ preventScroll: true });
  }, [openId, crossing]);

  const heroName = (id: string) =>
    crossing === id ? `${ns}-hero` : undefined;
  const titleName = (id: string) =>
    shareTitle && crossing === id ? `${ns}-title` : undefined;

  return (
    <>
      <style>{sheet(ns, duration, EASING[easing], exit)}</style>

      <div
        ref={rootRef}
        className={cn(
          "relative flex w-full flex-col overflow-hidden border border-hairline bg-panel p-5",
          className,
        )}
        style={{ borderRadius: radius }}
      >
        {/* The frame is deliberately NOT named. Name it and its border and
            background go into the snapshot with everything else, so the moment
            the outgoing copy fades the panel itself blinks out and the tile
            finishes its travel over bare page. Naming the content instead
            leaves the frame live and static, which is what a frame is. */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{ viewTransitionName: `${ns}-body` }}
        >
          {/* One header slot, occupied in both views. Captured with the rest of
              the body rather than named, so it hands over — which is the
              contrast the component is for: everything here is replaced, and
              the one named element travels. */}
          <div className="mb-4 flex h-5 items-center">
            {open ? (
              <button
                ref={backRef}
                type="button"
                onClick={() => cross(null, open.id, "Back to the gallery")}
                className="inline-flex items-center gap-1.5 font-display text-[10px] tracking-[0.18em] text-ink-dim uppercase transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ outlineColor: accentColor }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M15 5 8 12l7 7" />
                </svg>
                Back
              </button>
            ) : (
              <span className="font-display text-[10px] tracking-[0.18em] text-ink-mute uppercase">
                {items.length} areas
              </span>
            )}
          </div>

          {open ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div
                className="mb-4 w-full flex-1"
                style={{
                  background: open.tone,
                  borderRadius: radius - 3,
                  viewTransitionName: heroName(open.id),
                }}
              />

              <h3
                className="font-display text-[13px] tracking-[0.16em] text-ink uppercase"
                style={{ viewTransitionName: titleName(open.id) }}
              >
                {open.title}
              </h3>
              <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-dim">
                {open.body}
              </p>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-card={item.id}
                  onClick={() =>
                    cross(item.id, item.id, `${item.title}, detail`)
                  }
                  className="group/card flex min-h-0 flex-col text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ borderRadius: radius - 3, outlineColor: accentColor }}
                >
                  <div
                    className="w-full flex-1 transition-transform duration-200 group-hover/card:-translate-y-0.5"
                    style={{
                      background: item.tone,
                      borderRadius: radius - 3,
                      viewTransitionName: heroName(item.id),
                      // Marks where you came back from — and only once you are
                      // back. Drawn during the flight it is captured into the
                      // snapshot and travels as a loose outline of nothing.
                      boxShadow:
                        crossing === item.id && !busy && !openId
                          ? `0 0 0 2px ${accentColor}`
                          : undefined,
                    }}
                  />
                  <p
                    className="mt-2 font-display text-[10px] tracking-[0.14em] text-ink uppercase"
                    style={{ viewTransitionName: titleName(item.id) }}
                  >
                    {item.title}
                  </p>
                  <p className="mt-0.5 font-sans text-[11px] text-ink-mute">
                    {item.meta}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {announce ? (
        <span aria-live="polite" className="sr-only">
          {said}
        </span>
      ) : null}
    </>
  );
}
