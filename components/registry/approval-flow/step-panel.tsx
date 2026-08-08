"use client";

import { forwardRef, useEffect, useRef } from "react";
import {
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  type Transition,
} from "motion/react";
import { cn } from "@/lib/utils";
import OptionRow from "./option-row";
import { freeformOption, travelId, type ApprovalAnswer, type ApprovalStep } from "./types";

// One step. It owns three things the flow above it deliberately does not: where
// focus lands when the step arrives, how a rejection is announced, and the
// stagger the options arrive on.
//
// Next is `aria-disabled`, never `disabled`. A truly disabled button leaves the
// tab order, gives a screen reader nothing to read, and can never explain what
// is missing — and it makes the rejection animation unreachable, since a control
// nobody can press cannot reject anything. Muted-but-pressable states the same
// thing and answers when asked.
export interface StepPanelProps {
  step: ApprovalStep;
  answer: ApprovalAnswer;
  index: number;
  total: number;
  direction: 1 | -1;
  error: string | null;
  rejected: number;
  passes: boolean;
  last: boolean;
  focusHeading: boolean;
  density: "comfortable" | "compact";
  accentColor: string;
  dangerColor: string;
  shakeIntensity: number;
  shakeCycles: number;
  revealStagger: number;
  morphDuration: number;
  spring: Transition;
  reducedMotion: boolean;
  uid: string;
  onToggle: (optionId: string) => void;
  onOther: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

/** How far a step travels on the way in. Enough to read as a direction rather
 *  than a twitch, short enough not to look like a page change. */
const SLIDE = 44;

/** Rows past this index all share the last delay. A cascade is a wave, not a
 *  queue — past about half a second nobody reads it as one gesture. */
const STAGGER_CAP = 7;

const EASE = [0.22, 1, 0.36, 1] as const;

/** A decaying side-to-side, built rather than hardcoded so `shakeCycles` means
 *  something. Ends on 0 so the element cannot be stranded off its own axis. */
function shakeKeyframes(intensity: number, cycles: number): number[] {
  const out: number[] = [0];
  for (let i = 0; i < cycles; i += 1) {
    const decay = 1 - i / (cycles + 1);
    out.push(-intensity * decay, intensity * decay);
  }
  out.push(0);
  return out;
}

// forwardRef is not ceremony here, it is what makes `mode="popLayout"` work at
// all. AnimatePresence pops an exiting child by cloneElement-ing a ref onto it,
// stamping `data-motion-pop-id` on the resolved node, and injecting a stylesheet
// rule that positions THAT id absolutely. Hand it a plain function component and
// the ref resolves to nothing: no attribute, no matching rule, and the outgoing
// step keeps its space in the flow while the incoming one renders underneath —
// which reads as a step sliding up from the bottom.
const StepPanel = forwardRef<HTMLElement, StepPanelProps>(function StepPanel(
  {
    step,
    answer,
    index,
    total,
    direction,
    error,
    rejected,
    passes,
    last,
    focusHeading,
    density,
    accentColor,
    dangerColor,
    shakeIntensity,
    shakeCycles,
    revealStagger,
    morphDuration,
    spring,
    reducedMotion,
    uid,
    onToggle,
    onOther,
    onNext,
    onBack,
  },
  ref,
) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRejection = useRef(rejected);
  const shakeX = useMotionValue(0);
  const present = useIsPresent();

  // Focus moves with the step, or a keyboard user is left standing on a button
  // that no longer belongs to what is on screen. `preventScroll` because the
  // browser's own scroll-into-view fights the shared element mid-flight.
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus({ preventScroll: true });
  }, [focusHeading]);

  // The shake is driven imperatively off a counter rather than declaratively off
  // a flag: the same step can be rejected twice in a row, and a declarative
  // keyframe array whose contents never change would not re-run.
  //
  // It animates a MotionValue bound to `style.x`, never the element directly.
  // `animate(element, …)` writes `element.style.transform` behind motion's back,
  // so the offset never lands in the node's own values — and this element is an
  // ancestor of every option label, each of which is a shared-element source.
  // motion measures those against the ancestor chain and can only subtract
  // transforms it knows about, so a commit landing mid-shake would launch the
  // flight from a position up to `shakeIntensity` px away from the truth.
  useEffect(() => {
    if (rejected === firstRejection.current) return;
    firstRejection.current = rejected;
    if (reducedMotion || shakeIntensity <= 0 || shakeCycles <= 0) return;
    const run = animate(shakeX, shakeKeyframes(shakeIntensity, shakeCycles), {
      duration: 0.09 * shakeCycles + 0.12,
      ease: "easeInOut",
    });
    return () => run.stop();
  }, [rejected, reducedMotion, shakeIntensity, shakeCycles, shakeX]);

  const errorId = `${uid}-error-${step.id}`;
  const morph = !reducedMotion;

  // Which row the error is ABOUT, which is not the same as which row is
  // selected. "Describe what you need instead" is a complaint about the escape
  // hatch; painting it on whichever option happens to be first in the group
  // points the user at a row that is perfectly fine. When the complaint is that
  // nothing is chosen, no single row is at fault and none is marked.
  const hatch = freeformOption(step);
  const hatchBlank = hatch
    ? answer.optionIds.includes(hatch.id) && !(answer.other ?? "").trim()
    : false;
  const invalidId = error && hatch && hatchBlank ? hatch.id : null;

  return (
    <motion.section
      ref={ref}
      // The panel travels but does NOT fade. Its opacity would multiply with
      // every row's own fade underneath it, and a product of two curves is one
      // curve: the rows all sit near zero together while the parent is dark,
      // then arrive as a block. That flattening is what reads as "the stagger
      // isn't working" — the offsets were always there, they were just hidden
      // inside the parent's ramp. The fade is owned one level down, once.
      initial={reducedMotion ? false : { x: SLIDE * direction }}
      animate={{ x: 0 }}
      // Exit does not translate, because `AnimatePresence` re-renders the
      // element as it was last rendered: the leaving panel still holds the
      // `direction` it MOUNTED with, not the one that is navigating away from
      // it. Going Back, that stale value sends both panels the same way and the
      // pair slides together instead of past each other. Reading the live
      // direction here needs `custom` on AnimatePresence plus a variant, since
      // an `exit` object literal cannot see it — a fade sidesteps the whole
      // thing and keeps the outgoing step from competing with the label that is
      // flying to the rail.
      exit={{
        opacity: 0,
        transition: { duration: reducedMotion ? 0 : (morphDuration / 1000) * 0.34 },
      }}
      transition={
        reducedMotion ? { duration: 0 } : { duration: morphDuration / 1000, ease: EASE }
      }
      aria-labelledby={`${uid}-title-${step.id}`}
      // The popped ghost is absolutely positioned ON TOP of the live panel for
      // the length of its fade, with a working Back/Next and a second "Step N
      // of M" heading in the accessibility tree — while focus has just been
      // moved to the new heading. `inert` takes the corpse out of both the tab
      // order and the a11y tree without touching how it looks.
      inert={!present}
      // How the host finds the panel whose height it should animate to. Keyed
      // by step id rather than by presence: during the swap both panels are
      // mounted, and `useIsPresent()` flips a render later than this commit, so
      // "which one is live" is ambiguous exactly when it is being asked. Which
      // step each panel is showing never is.
      data-step-id={step.id}
      className="flex min-w-0 flex-col gap-5"
    >
      <header className="flex flex-col gap-1.5">
        <span className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
          Step {index + 1} of {total}
        </span>
        <h3
          id={`${uid}-title-${step.id}`}
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[15px] tracking-[0.06em] text-ink uppercase outline-none"
        >
          {step.title}
        </h3>
        {step.prompt ? (
          <p className="font-sans text-[13px] leading-relaxed text-ink-dim">
            {step.prompt}
          </p>
        ) : null}
      </header>

      <motion.div style={{ x: shakeX }}>
        <div
          role={step.kind === "single" ? "radiogroup" : "group"}
          aria-labelledby={`${uid}-title-${step.id}`}
          aria-describedby={error ? errorId : undefined}
          className="flex flex-col gap-2"
        >
          {step.options.map((option, i) => (
            <motion.div
              key={option.id}
              // `initial={false}` under reduced motion, not a shortened duration:
              // the backstop in globals.css crushes CSS durations and reaches
              // none of this, so an opacity-0 start would simply stay there.
              initial={reducedMotion ? false : { opacity: 0, x: SLIDE * 0.4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : {
                      // Short enough that `revealStagger` is a real fraction of
                      // it. Against the old 302ms row, a 45ms offset was 15% —
                      // 85% overlap, which is one block arriving, not a wave.
                      duration: (morphDuration / 1000) * 0.5,
                      // Capped. A consumer step with 20 options at the schema's
                      // top stagger would otherwise start its last row 3.8s
                      // after the panel had finished arriving.
                      delay: (Math.min(i, STAGGER_CAP) * revealStagger) / 1000,
                      ease: EASE,
                    }
              }
            >
              <OptionRow
                option={option}
                kind={step.kind}
                name={`${uid}-${step.id}`}
                checked={answer.optionIds.includes(option.id)}
                density={density}
                accentColor={accentColor}
                dangerColor={dangerColor}
                invalid={invalidId === option.id}
                reducedMotion={reducedMotion}
                transition={spring}
                // EVERY row gets its own permanent id, not one id handed to
                // whichever row happens to be selected. A single shared id that
                // moves when the selection moves is a shared-element transition
                // between two rows of the same list: motion sees the id leave
                // row A and appear in row B on the same frame and dutifully
                // flies the text across, which reads as the label jumping. Ids
                // that never migrate cannot do that, and the rail still finds
                // its one match on commit because it builds the same string.
                //
                // The house idiom (MorphDialog): a real morph only happens when
                // motion is allowed. Dropping the `layoutId` entirely is the
                // gate — a "shortened" shared-element flight is still travel.
                travelId={morph ? travelId(uid, step.id, option.id) : undefined}
                other={answer.other ?? ""}
                onToggle={() => onToggle(option.id)}
                onOther={onOther}
              />
            </motion.div>
          ))}
        </div>

        {/* Assertive, because it is the answer to something the user just did.
            Under reduced motion this line and the red border are the ENTIRE
            rejection signal — deleting the shake without replacing it would
            leave a sighted mouse user with no feedback at all. */}
        <p
          id={errorId}
          role="alert"
          aria-live="assertive"
          className={cn(
            "mt-3 font-sans text-[12px] transition-opacity",
            error ? "opacity-100" : "opacity-0",
          )}
          style={{ color: dangerColor }}
        >
          {error ?? " "}
        </p>
      </motion.div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={index === 0}
          className="rounded-md border border-hairline px-4 py-2 font-display text-[11px] tracking-[0.18em] text-ink-dim uppercase transition-colors outline-none hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-disabled={!passes}
          // Not-ready is a different button, not a faded one. Fading the accent
          // fill takes the label with it, and on a light surface 45% amethyst
          // under white text is unreadable — the state that most needs to be
          // legible becomes the least. The border is always present so the box
          // does not resize between the two.
          className={cn(
            "rounded-md border px-5 py-2 font-display text-[11px] tracking-[0.18em] uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
            passes ? "border-transparent" : "border-hairline bg-raised text-ink-mute",
          )}
          style={
            passes
              ? { backgroundColor: accentColor, color: "var(--sg-on-accent)" }
              : undefined
          }
        >
          {last ? "Approve" : "Next"}
        </button>
      </div>
    </motion.section>
  );
});

export default StepPanel;
