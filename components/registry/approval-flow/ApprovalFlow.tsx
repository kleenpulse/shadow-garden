"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { animate, AnimatePresence, LayoutGroup, motion, useMotionValue } from "motion/react";
import { cn } from "@/lib/utils";
import DecidedRail from "./DecidedRail";
import StepPanel from "./StepPanel";
import { useApprovalFlow } from "./useApprovalFlow";
import {
  freeformOption,
  summarise,
  type ApprovalAnswers,
  type ApprovalStep,
} from "./types";

// A step-by-step approval checklist. Each step is a radio or checkbox group with
// an escape hatch, and committing a step sends the chosen option flying into a
// running record of what has already been decided.
//
// The morph is the point, and three things make it work. One `LayoutGroup` wraps
// the option list AND the rail, because motion only matches a `layoutId` inside
// one group — without it the element crossfades and the whole premise dies with
// nothing to flag it. `AnimatePresence mode="popLayout"` takes the outgoing step
// out of flow so the rail's reflow and the label's flight happen on the same
// frame; `"sync"` leaves a hole that snaps shut afterwards. And every id is
// namespaced by `useId()` — two flows on one page share a document, and an
// un-namespaced layoutId would fly an option out of one and into the other.
//
// Controlled by design: `steps` in, `onSubmit` out. What happens after approval
// is the caller's decision, not the checklist's.
export interface ApprovalFlowProps {
  /** In order. Each needs a stable `id`; the answers are keyed by it. */
  steps?: ApprovalStep[];
  /** Fired once, when the last step commits. */
  onSubmit?: (answers: ApprovalAnswers) => void;
  /** Where the record of decided steps sits relative to the live step. */
  layout?: "rail" | "inline";
  /** Step change, option reveal and field growth, in ms. */
  morphDuration?: number;
  /** How hard the travelling label is pulled to its slot in the record. */
  stiffness?: number;
  /** How fast that flight settles. */
  damping?: number;
  /** Row height and padding throughout. */
  density?: "comfortable" | "compact";
  /** Delay added per option as a step's list arrives, in ms. */
  revealStagger?: number;
  /** Travel of the rejection shake, in px. 0 disables it. */
  shakeIntensity?: number;
  /** Round trips in that shake. */
  shakeCycles?: number;
  /** Show the completion bar above the step. */
  showProgress?: boolean;
  /** Commit a single-choice step as soon as it is answered. */
  autoAdvance?: boolean;
  /** Selection, checked glyph, progress fill. */
  accentColor?: string;
  /** Invalid border and the rejection message. */
  dangerColor?: string;
  /** Drops the flight, the stagger and the shake. The rejection message and the
   *  invalid border stay — they become the whole signal. */
  reducedMotion?: boolean;
  className?: string;
}

/** Stands in for a step id when the receipt is the panel on screen. Prefixed so
 *  it cannot collide with a real step's id. */
const RECEIPT_ID = "__receipt__";

export default function ApprovalFlow({
  steps = [],
  onSubmit,
  layout = "rail",
  morphDuration = 420,
  stiffness = 380,
  damping = 34,
  density = "comfortable",
  revealStagger = 45,
  shakeIntensity = 6,
  shakeCycles = 3,
  showProgress = true,
  autoAdvance = false,
  accentColor = "#a855f7",
  dangerColor = "#f87171",
  reducedMotion = false,
  className,
}: ApprovalFlowProps) {
  const uid = useId().replace(/:/g, "");
  const flow = useApprovalFlow(steps);
  const {
    index,
    step,
    answer,
    answers,
    error,
    rejected,
    direction,
    submitted,
    last,
    passes,
    decided,
  } = flow;

  // False on the first render so arriving at the page does not yank focus out of
  // whatever the reader was doing. True from the first navigation onward, which
  // is exactly when focus must follow the step.
  const [moved, setMoved] = useState(false);

  // Live mirrors: both are read from inside a timer or an effect that would
  // otherwise close over the render that scheduled it.
  const live = useRef({ next: flow.next, onSubmit, answers });
  live.current = { next: flow.next, onSubmit, answers };

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (submitted) live.current.onSubmit?.(live.current.answers);
  }, [submitted]);

  const spring = reducedMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness, damping } as const);

  const go = (run: () => void) => {
    setMoved(true);
    run();
  };

  const handleToggle = (optionId: string) => {
    flow.toggleOption(optionId);
    if (!autoAdvance || reducedMotion || !step || last) return;
    if (step.kind !== "single" || freeformOption(step)?.id === optionId) return;
    // Scheduled rather than run inline because the dispatch above has not
    // committed yet — `next` must validate the answer the click produced, which
    // is what the live mirror is holding. Derived from `morphDuration` so a slow
    // setting does not commit the step while the tick is still drawing.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go(live.current.next), Math.max(180, morphDuration * 0.6));
  };

  // Steps are different heights, and the swap moves everything below the card.
  //
  // `layout` on this box is NOT the fix and was tried: motion implements a
  // layout animation as a transform, so the real box (offsetHeight) still snaps
  // the full delta on the commit frame — measured 471 -> 347 in one frame — and
  // only the painted content glides. It buys a scaleY on the incoming step for
  // nothing. Same lesson as the rail column below: reserve or animate the real
  // property, never scale a lie over the top of it.
  //
  // So the height is measured and animated for real. No ResizeObserver — the
  // read happens once per step in a layout effect, before paint, which keeps
  // `no-hand-rolled-loop` satisfied. Released back to `auto` on arrival so the
  // escape hatch can still grow the box inside a step.
  //
  // Clipped while GROWING and only while growing. A grow pins the box shorter
  // than the panel already rendered inside it, so without a clip the content
  // hangs straight out through the bottom of the card — most visibly on Revise,
  // which expands from the short receipt to a full step. A shrink cannot spill:
  // the box is larger than its content the whole way, and the only thing
  // overhanging is the outgoing ghost, which is absolutely positioned and
  // fading. Keeping the clip off for that half matters, because backward
  // navigation is also when a label is flying from the rail INTO this box.
  const boxRef = useRef<HTMLDivElement>(null);
  const boxH = useMotionValue(0);
  const settled = useRef<number | null>(null);
  const [sizing, setSizing] = useState<null | "grow" | "shrink">(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    // Release any pin from the previous transition FIRST, and release it by
    // touching the node, not by dropping the `style` prop. A MotionValue is
    // written straight to the DOM by motion, so React never knows the height is
    // there and rendering `style={undefined}` does not clear it. Left set, the
    // box stays frozen at whatever the last step measured — the escape hatch
    // then opens underneath a fixed height and pushes its own field out through
    // the bottom of the card. It also poisons the next measurement, which is
    // read back off this same element.
    el.style.height = "";
    // The LIVE panel's own height, never the wrapper's. AnimatePresence has not
    // popped the outgoing panel out of flow yet at this point in the commit, so
    // the wrapper measures both steps stacked — a number that is never on
    // screen for a frame (measured 723px between two panels of 442 and 421).
    // A panel's own box does not care whether its neighbour is in flow.
    // "To" is the arriving panel, found by step id: during the swap both panels
    // are mounted, so anything based on presence or DOM order is ambiguous at
    // exactly the moment it is asked.
    const key = submitted ? RECEIPT_ID : step?.id;
    const panels = Array.from(el.querySelectorAll<HTMLElement>("[data-step-id]"));
    const live = panels.find((node) => node.dataset.stepId === key);

    // "From" is the last height this box actually SETTLED at, recorded below
    // rather than measured here. Measuring it now cannot work: at this point in
    // the commit the outgoing panel has not been popped out of flow yet, so the
    // box reports both steps stacked — a number that is never on screen. It is
    // also why the height must not be remembered as "whatever I measured last
    // time"; only a value taken while the box was quiet is trustworthy.
    const prev = settled.current;
    if (!live || prev === null) return;

    const next = live.offsetHeight;
    if (reducedMotion || prev === next) return;

    // `jump`, never `set`. A MotionValue derives velocity from how fast it has
    // been changing, and a spring inherits that velocity when it starts. Seeding
    // the box with `set` looks identical but registers as an instantaneous leap
    // from the value's previous contents, so the spring launches with enormous
    // momentum and sails past its target — measured overshooting a 442 -> 421
    // change all the way to 738 before coming back. `jump` zeroes velocity.
    //
    // The inline write alongside it is deliberate: the MotionValue's own write
    // is scheduled for the next frame, which would paint one frame at the
    // natural height — a flash of precisely the jump this exists to remove.
    boxH.jump(prev);
    el.style.height = `${prev}px`;
    setSizing(next > prev ? "grow" : "shrink");

    const run = animate(boxH, next, spring);
    const release = () => {
      setSizing(null);
      if (boxRef.current) boxRef.current.style.height = "";
    };
    void run.then(release);
    return () => {
      run.stop();
      release();
    };
    // Step identity only: sampling on every render would re-pin the box while
    // the user is typing into the escape hatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, submitted, reducedMotion]);

  // Records the box's resting height after every commit, and ONLY when it is
  // genuinely at rest: not while pinned by the animation above, and not while
  // two panels are mounted mid-swap. Declared after that effect so a step change
  // reads the previous resting value before this overwrites it. Deliberately
  // dependency-free — the height also changes inside a step when the escape
  // hatch opens, and navigating away from that should animate from where the
  // box really was, not from where the step started.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || el.style.height) return;
    if (el.querySelectorAll("[data-step-id]").length !== 1) return;
    settled.current = el.offsetHeight;
  });

  if (!step) return null;

  const rail = decided.length > 0 || submitted;
  const done = submitted ? steps.length : index;

  const record = (
    <DecidedRail
      steps={submitted ? steps : decided}
      answers={answers}
      uid={uid}
      accentColor={accentColor}
      density={density}
      spring={spring}
      reducedMotion={reducedMotion}
      onEdit={(to) => go(() => flow.edit(to))}
    />
  );

  return (
    <div
      className={cn(
        "w-full rounded-lg border border-hairline bg-panel p-5 sm:p-6",
        className,
      )}
    >
      {showProgress ? (
        <div className="mb-5 flex items-center gap-3">
          <div
            className="h-px flex-1 overflow-hidden bg-hairline"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
            aria-label="Approval progress"
          >
            <motion.div
              className="h-full origin-left"
              style={{ backgroundColor: accentColor }}
              initial={false}
              animate={{ scaleX: steps.length ? done / steps.length : 0 }}
              transition={reducedMotion ? { duration: 0 } : spring}
            />
          </div>
          {/* No numeric readout here. The step line below already says "Step 2
              of 3", and a second counter reading "1/3" beside it — decided, not
              current — reads as a contradiction rather than as two facts. The
              count lives on the progressbar's aria-valuenow instead. */}
        </div>
      ) : null}

      {/* One group, both subtrees. This is the load-bearing line. */}
      <LayoutGroup id={uid}>
        {/* The rail column is reserved from step one, before there is anything
            to put in it. Switching to the grid only once a decision exists
            narrows the step panel mid-transition, and `layout` faithfully
            animates that as a 1.49× horizontal stretch across every word in the
            step. Reserving the column is the fix; counter-scaling the text is
            treating the symptom. */}
        <div
          className={cn(
            layout === "rail"
              ? "grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]"
              : "flex flex-col gap-6",
          )}
        >
          {layout === "inline" && rail ? record : null}

          {/* `relative` is load-bearing, not tidiness. `mode="popLayout"` takes
              the outgoing step out of flow by setting it `position: absolute`,
              and an absolute box anchors to its nearest POSITIONED ancestor —
              with none here it escapes to a container far up the page, so the
              old step keeps its height in the flow and the new one renders
              underneath it. That is the "animates in from the bottom" symptom:
              it was never a direction, it was two steps stacked.

              The height animation is set up above; `sizing` says whether it is
              currently driving, and the box is otherwise left on `auto`. */}
          <motion.div
            ref={boxRef}
            style={sizing ? { height: boxH } : undefined}
            className={cn(
              "relative min-w-0",
              sizing === "grow" && "overflow-hidden",
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {submitted ? (
                <motion.div
                  key="receipt"
                  data-step-live="true"
                  // Enters on x like every step, not y — it is the last panel in
                  // the same sequence, and Revise navigates backward out of it.
                  initial={reducedMotion ? false : { opacity: 0, x: 44 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={
                    reducedMotion ? { duration: 0 } : { duration: morphDuration / 1000 }
                  }
                  className="flex flex-col gap-4"
                >
                  <h3 className="font-display text-[15px] tracking-[0.06em] text-ink uppercase">
                    Authorisation granted
                  </h3>
                  <p className="font-sans text-[13px] leading-relaxed text-ink-dim">
                    {steps.length} decision{steps.length === 1 ? "" : "s"} recorded.
                  </p>
                  <ul className="sr-only">
                    {steps.map((s) => (
                      <li key={s.id}>
                        {s.title}: {summarise(s, answers[s.id] ?? { optionIds: [] })}
                      </li>
                    ))}
                  </ul>
                  <div>
                    <button
                      type="button"
                      onClick={() => go(() => flow.edit(0))}
                      className="rounded-md border border-hairline px-4 py-2 font-display text-[11px] tracking-[0.18em] text-ink-dim uppercase transition-colors outline-none hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Revise
                    </button>
                  </div>
                </motion.div>
              ) : (
                <StepPanel
                  key={step.id}
                  step={step}
                  answer={answer ?? { optionIds: [] }}
                  index={index}
                  total={steps.length}
                  direction={direction}
                  error={error}
                  rejected={rejected}
                  passes={passes}
                  last={last}
                  // Re-armed per step: the panel remounts on every change, so
                  // this is read once on arrival rather than watched.
                  focusHeading={moved}
                  density={density}
                  accentColor={accentColor}
                  dangerColor={dangerColor}
                  shakeIntensity={shakeIntensity}
                  shakeCycles={shakeCycles}
                  revealStagger={revealStagger}
                  morphDuration={morphDuration}
                  spring={spring}
                  reducedMotion={reducedMotion}
                  uid={uid}
                  onToggle={handleToggle}
                  onOther={flow.setOther}
                  onNext={() => go(flow.next)}
                  onBack={() => go(flow.back)}
                />
              )}
            </AnimatePresence>
          </motion.div>

          {layout === "rail" ? (
            <div className="min-w-0 md:border-l md:border-hairline md:pl-6">
              <span className="mb-2.5 block font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
                Decided
              </span>
              {/* The rail renders unconditionally — its own AnimatePresence is
                  inside it, and a component cannot animate its own removal.
                  Gating the whole thing on "is there anything decided" meant
                  Back-ing out of step 1 unmounted the presence tree and the
                  record vanished in a single frame, which is the same layout
                  shift on the same step change, just on the other side. Empty
                  is a state it renders, not a reason not to mount it. */}
              {record}
              {rail ? null : (
                <p className="font-sans text-[12px] text-ink-mute/70">Nothing yet.</p>
              )}
            </div>
          ) : null}
        </div>
      </LayoutGroup>
    </div>
  );
}
