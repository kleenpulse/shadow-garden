"use client";

import { useEffect, useRef } from "react";
import { motion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import type { ApprovalOption } from "./types";

// One row, one native input. `radio` and `checkbox` are not reimplemented on
// buttons: the platform already gives arrow-key navigation within a radio group,
// form participation, and the correct "3 of 5, selected" announcement, and an
// ARIA rebuild of all three is code that can only be worse.
//
// The input is transparent and stretched over the whole row rather than hidden,
// so the hit target is the row and the label association is structural. Because
// it is the first child, `peer-*` reaches the visual layer. A `sr-only` input
// would work too, right up until the focus ring lands on a 1px box in the corner.
//
// The escape hatch is not a separate component. It is this row with
// `option.freeform` set: it sits in the group, obeys the group's semantics, and
// grows a field in place when chosen. Anything else — a note field parked under
// the list — has no origin to morph from and clutters every step that has no use
// for it.
export interface OptionRowProps {
  option: ApprovalOption;
  kind: "single" | "multi";
  /** Shared across the group so the browser treats radios as one set. */
  name: string;
  checked: boolean;
  density: "comfortable" | "compact";
  accentColor: string;
  dangerColor: string;
  invalid: boolean;
  reducedMotion: boolean;
  transition: Transition;
  /** Present only on the option whose label flies into the decided rail. */
  travelId?: string;
  other: string;
  onToggle: () => void;
  onOther: (value: string) => void;
}

export default function OptionRow({
  option,
  kind,
  name,
  checked,
  density,
  accentColor,
  dangerColor,
  invalid,
  reducedMotion,
  transition,
  travelId,
  other,
  onToggle,
  onOther,
}: OptionRowProps) {
  const fieldRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  const revertTo = useRef("");

  const hatch = Boolean(option.freeform);
  const open = hatch && checked;
  const compact = density === "compact";

  // Focus follows the reveal, but only on the transition into it — a re-render
  // while the field already holds a caret must not reset the selection.
  useEffect(() => {
    if (open && !wasOpen.current) {
      revertTo.current = other;
      fieldRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open, other]);

  const tick = checked ? 1 : 0;
  const ring = invalid ? dangerColor : accentColor;

  return (
    <div
      // No `overflow-hidden` here. The hatch wrapper below clips its own
      // height animation, so this one was redundant — and it is on the path of
      // the label flying back IN from the rail on Edit, which it would cut in
      // half for most of the trip.
      className={cn(
        "rounded-md border transition-colors",
        checked ? "bg-raised" : "bg-transparent hover:bg-raised/60",
      )}
      style={{
        borderColor: checked || invalid ? ring : "var(--sg-hairline)",
        boxShadow: checked && !invalid ? `inset 0 0 0 1px ${accentColor}33` : undefined,
      }}
    >
      <label
        className={cn(
          "relative flex cursor-pointer items-start outline-none",
          compact ? "gap-2.5 px-3 py-2" : "gap-3 px-4 py-3",
        )}
      >
        <input
          type={kind === "single" ? "radio" : "checkbox"}
          name={name}
          checked={checked}
          onChange={onToggle}
          className="peer absolute inset-0 size-full cursor-pointer opacity-0"
        />

        {/* The ring the hidden input would otherwise take off screen, projected
            back onto the row it actually belongs to (globals.css a11y floor). */}
        <span className="pointer-events-none absolute inset-0 rounded-md peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--sg-accent)]" />

        <svg
          viewBox="0 0 24 24"
          className={cn("mt-px shrink-0", compact ? "size-4" : "size-[18px]")}
          aria-hidden
        >
          {/* One outline for both kinds — the corner radius is the only
              difference, so a radio and a checkbox are the same object seen at
              two settings rather than two icons crossfaded. */}
          <rect
            x="2.5"
            y="2.5"
            width="19"
            height="19"
            rx={kind === "single" ? 9.5 : 5}
            fill="none"
            stroke={checked ? ring : "currentColor"}
            strokeWidth="2"
            className={checked ? undefined : "text-ink-mute"}
          />
          <motion.path
            d="M7.5 12.5 11 16 16.5 8.5"
            fill="none"
            stroke={ring}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            // No `style` opacity anywhere near this: motion writes SVG opacity as
            // an attribute and an inline style would win permanently, pinning the
            // tick invisible while the value animates correctly in the DOM.
            initial={false}
            animate={{ pathLength: tick, opacity: tick }}
            transition={reducedMotion ? { duration: 0 } : transition}
          />
        </svg>

        <span className="min-w-0 flex-1">
          {travelId ? (
            <motion.span
              layoutId={travelId}
              // Without this the flight runs motion's default layout tween — a
              // fixed 450ms ease — and the two props documented as owning it do
              // nothing at all. The rail slot it lands in already springs, so
              // the label and its destination were arriving on different curves.
              transition={transition}
              className={cn(
                "block font-display tracking-[0.1em] text-ink uppercase",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              {option.label}
            </motion.span>
          ) : (
            <span
              className={cn(
                "block font-display tracking-[0.1em] text-ink uppercase",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              {option.label}
            </span>
          )}
          {option.hint ? (
            <span
              className={cn(
                "mt-1 block font-sans text-ink-mute",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              {option.hint}
            </span>
          ) : null}
        </span>
      </label>

      {hatch ? (
        <motion.div
          // Outside the label on purpose — inside it, every click in the field
          // would toggle the option that opened it.
          initial={false}
          animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
          transition={reducedMotion ? { duration: 0 } : transition}
          className="overflow-hidden"
        >
          <div className={cn(compact ? "px-3 pb-2" : "px-4 pb-3")}>
            <input
              ref={fieldRef}
              type="text"
              value={other}
              placeholder={option.placeholder ?? "Type what you need instead"}
              aria-label={option.label}
              aria-invalid={invalid || undefined}
              disabled={!open}
              onChange={(event) => onOther(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  onOther(revertTo.current);
                }
              }}
              className={cn(
                "w-full rounded-sm border bg-surface font-sans text-ink outline-none",
                "placeholder:text-ink-mute/70",
                compact ? "px-2.5 py-1.5 text-[12px]" : "px-3 py-2 text-[13px]",
              )}
              style={{
                borderColor: invalid ? dangerColor : "var(--sg-hairline)",
              }}
            />
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
