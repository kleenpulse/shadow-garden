"use client";

import { AnimatePresence, motion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import {
  answerFor,
  freeformActive,
  summarise,
  travelId,
  travellingOption,
  type ApprovalAnswers,
  type ApprovalStep,
} from "./types";

// Where a decision lands. The label that flew up from the option list is
// reproduced here VERBATIM under the same `layoutId` — the travelling text is
// identical at both ends, and the count and the typed detail arrive as separate
// siblings that fade in. Change the string mid-flight and motion still animates
// the box, but the text swaps in the air and the illusion of one object moving
// is gone.
export interface DecidedRailProps {
  steps: ApprovalStep[];
  answers: ApprovalAnswers;
  uid: string;
  accentColor: string;
  density: "comfortable" | "compact";
  spring: Transition;
  reducedMotion: boolean;
  onEdit: (index: number) => void;
}

export default function DecidedRail({
  steps,
  answers,
  uid,
  accentColor,
  density,
  spring,
  reducedMotion,
  onEdit,
}: DecidedRailProps) {
  const compact = density === "compact";

  return (
    <ol className="flex flex-col gap-1.5">
      <AnimatePresence initial={false} mode="popLayout">
        {steps.map((step, i) => {
          const answer = answerFor(answers, step.id);
          const lead = travellingOption(step, answer);
          const extra = Math.max(0, answer.optionIds.length - 1);
          const typed = freeformActive(step, answer) ? (answer.other ?? "").trim() : "";

          return (
            <motion.li
              key={step.id}
              // Full `layout`, not `"position"`: a row grows when its typed
              // detail or its `+N` count appears, and position-only would
              // resize it in a single frame while its siblings glide.
              layout={!reducedMotion}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reducedMotion ? { duration: 0 } : spring}
              className={cn(
                "group flex items-start gap-3 rounded-md border border-hairline bg-raised/50",
                compact ? "px-3 py-2" : "px-3.5 py-2.5",
              )}
            >
              <svg viewBox="0 0 24 24" className="mt-0.5 size-3.5 shrink-0" aria-hidden>
                <path
                  d="M5 12.5 10 17 19 7"
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <div className="min-w-0 flex-1">
                <span className="block font-display text-[9px] tracking-[0.24em] text-ink-mute uppercase">
                  {step.title}
                </span>

                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                  <motion.span
                    // Built from the CHOSEN option's id, so out of the four
                    // labels the step offered, exactly one has a partner here.
                    layoutId={
                      reducedMotion || !lead
                        ? undefined
                        : travelId(uid, step.id, lead.id)
                    }
                    transition={spring}
                    className="block font-display text-[11px] tracking-[0.1em] text-ink uppercase"
                  >
                    {lead?.label ?? "Skipped"}
                  </motion.span>
                  {extra > 0 ? (
                    <motion.span
                      initial={reducedMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={reducedMotion ? { duration: 0 } : spring}
                      className="font-display text-[10px] tracking-[0.1em] text-ink-mute"
                    >
                      +{extra}
                    </motion.span>
                  ) : null}
                </span>

                {typed ? (
                  <motion.span
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={reducedMotion ? { duration: 0 } : spring}
                    className="mt-1 block truncate font-sans text-[12px] text-ink-dim"
                  >
                    {typed}
                  </motion.span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onEdit(i)}
                aria-label={`Edit ${step.title} — ${summarise(step, answer)}`}
                className="shrink-0 rounded-sm px-1.5 py-0.5 font-display text-[9px] tracking-[0.2em] text-ink-mute uppercase transition-colors outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
              >
                Edit
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
