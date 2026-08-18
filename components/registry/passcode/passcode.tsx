"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

// A one-time-code field: cells that answer each keystroke, distribute a paste
// across themselves, shake off a wrong code and fold into a tick on a right one.
//
// The architecture is the part worth copying, and it is not the obvious one.
// **There is exactly one input.** It holds the whole code, it is visually
// hidden, and the cells are presentational spans reading slices of its value.
//
// The version everyone writes first — N inputs with `maxLength={1}` — breaks in
// three ways you will not see on a desktop browser:
//
//   1. Android's SMS autofill and iOS's "From Messages" do not fire a `paste`
//      event. They fire `input` with the entire code at once. A component whose
//      only distribution path is `onPaste` is dead on the platform where
//      one-time codes actually arrive.
//   2. Password managers and `autocomplete="one-time-code"` want one field to
//      fill. Six of them get the first character six times, or nothing.
//   3. Select-all, undo, and a screen reader announcing "edit text, 1 of 6"
//      six separate times.
//
// With one input all of that is the platform's problem again, and the springs
// are free to be purely presentational — which is also why the paste stagger can
// exist at all: the value is already whole, so the cells are animating a
// reveal rather than racing six separate state updates.
export type PasscodeMode = "numeric" | "alphanumeric";
export type PasscodeStatus = "idle" | "error" | "success";

interface PasscodeProps {
  /** The code that counts as correct. The bench supplies a demo value. */
  code?: string;
  /** Cells in the code. */
  length?: number;
  /** What the field accepts, and which on-screen keyboard it asks for. */
  mode?: PasscodeMode;
  /** Render dots instead of characters. */
  mask?: boolean;
  /** Spring tension of the per-digit pop. */
  stiffness?: number;
  /** Spring friction — lower rings longer. */
  damping?: number;
  /** How far a cell compresses before it springs back. */
  anticipation?: number;
  /** Delay between cells as a pasted code distributes. */
  pasteStagger?: number;
  /** Lateral travel of the rejection shake. */
  shakeAmplitude?: number;
  /** Validate the moment the last cell fills. */
  autoSubmit?: boolean;
  /** Pause between the last character landing and validation firing. */
  submitDelay?: number;
  /** The focused ring, the filled border, and the success tick. */
  accentColor?: string;
  /** The rejection. */
  errorColor?: string;
  /** Fired when a complete code is judged. */
  onResolve?: (value: string, ok: boolean) => void;
  /** No springs, no shake, no stagger — every state still reachable. */
  reducedMotion?: boolean;
  className?: string;
}

const DIGITS = /[^0-9]/g;
const ALNUM = /[^0-9a-zA-Z]/g;

export default function Passcode({
  code = "424242",
  length = 6,
  mode = "numeric",
  mask = false,
  stiffness = 520,
  damping = 26,
  anticipation = 0.12,
  pasteStagger = 45,
  shakeAmplitude = 10,
  autoSubmit = true,
  submitDelay = 220,
  accentColor = "#a855f7",
  errorColor = "#f87171",
  onResolve,
  reducedMotion = false,
  className,
}: PasscodeProps) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState<PasscodeStatus>("idle");

  const size = Math.max(3, Math.min(12, Math.round(length)));

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // A change of length or mode invalidates whatever is in the field. Keeping it
  // would leave cells holding characters the current mode does not accept.
  useEffect(() => {
    clearTimers();
    setValue("");
    setCaret(0);
    setStatus("idle");
  }, [size, mode]);

  const clean = (raw: string): string => {
    const stripped = raw.replace(mode === "numeric" ? DIGITS : ALNUM, "");
    const cased = mode === "numeric" ? stripped : stripped.toUpperCase();
    return cased.slice(0, size);
  };

  const settle = (next: string) => {
    if (next.length < size) return;
    const ok = next === clean(code);
    const run = () => {
      setStatus(ok ? "success" : "error");
      onResolve?.(next, ok);
      if (!ok) {
        // The wrong code is cleared, but only after the shake has been seen —
        // emptying the field on the same frame steals the feedback.
        timers.current.push(
          setTimeout(
            () => {
              setValue("");
              setCaret(0);
              setStatus("idle");
              inputRef.current?.focus();
            },
            reducedMotion ? 700 : 620,
          ),
        );
      }
    };
    if (!autoSubmit) return;
    // The pause exists so the final cell finishes its own pop before the row is
    // judged. Validating on the same frame steals the confirmation of the
    // keystroke that caused it, and the last character never looks registered.
    timers.current.push(setTimeout(run, reducedMotion ? 0 : Math.max(0, submitDelay)));
  };

  const commit = (raw: string) => {
    const next = clean(raw);
    const grew = next.length - value.length;

    clearTimers();
    setStatus("idle");

    // More than one character at once is a paste, an autofill, or an SMS
    // hand-off — all of which arrive here rather than through `onPaste`. The
    // value is already whole; the stagger only decides how fast the cells admit
    // to knowing it.
    if (grew > 1 && pasteStagger > 0 && !reducedMotion) {
      const from = value.length;
      for (let i = from; i < next.length; i++) {
        const slice = next.slice(0, i + 1);
        timers.current.push(
          setTimeout(
            () => {
              setValue(slice);
              setCaret(slice.length);
              if (slice.length === next.length) settle(next);
            },
            (i - from) * pasteStagger,
          ),
        );
      }
      return;
    }

    setValue(next);
    setCaret(next.length);
    settle(next);
  };

  const focusCell = (index: number) => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const at = Math.min(index, value.length);
    // Deferred by a task, not by a frame. Focusing moves the caret to the end
    // on its own and the correction has to land after that — but reaching for
    // requestAnimationFrame here is how a registry component acquires a
    // hand-rolled loop, and the rule that forbids it does not care that this one
    // only fires once.
    timers.current.push(setTimeout(() => input.setSelectionRange(at, at), 0));
    setCaret(at);
  };

  const spring = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness, damping };

  const active = focused ? Math.min(caret, size - 1) : -1;
  const shake = shakeAmplitude;

  return (
    <div className={cn("inline-flex flex-col items-center gap-4", className)}>
      <div className="relative">
        {/* One real input, holding the whole code. Not `display:none` and not
            `type="hidden"` — it has to stay focusable and it has to stay a
            text field for autofill to recognise it. */}
        <input
          ref={inputRef}
          id={uid}
          value={value}
          onChange={(event) => commit(event.target.value)}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode={mode === "numeric" ? "numeric" : "text"}
          pattern={mode === "numeric" ? "[0-9]*" : undefined}
          autoComplete="one-time-code"
          aria-label={`${size}-character verification code`}
          maxLength={size}
          spellCheck={false}
          className="absolute inset-0 z-10 h-full w-full cursor-default rounded-md text-transparent opacity-0 outline-none"
        />

        <AnimatePresence mode="wait" initial={false}>
          {status === "success" ? (
            <motion.div
              key="done"
              initial={reducedMotion ? false : { scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring}
              className="flex h-14 items-center justify-center gap-3 px-6"
              style={{ color: accentColor }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <motion.path
                  d="M20 6 9 17l-5-5"
                  initial={reducedMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.35, delay: 0.05 }}
                />
              </svg>
              <span className="font-display text-[11px] tracking-[0.22em] uppercase">
                verified
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="cells"
              // The row shakes, never the cells. A row that has been shaken has
              // been judged; cells that each shake independently look broken.
              animate={
                status === "error" && !reducedMotion
                  ? { x: [0, -shake, shake, -shake * 0.6, shake * 0.5, 0] }
                  : { x: 0 }
              }
              transition={
                status === "error" && !reducedMotion
                  ? { duration: 0.42, ease: "easeInOut" }
                  : { duration: 0.15 }
              }
              className="flex items-center gap-2 select-none"
            >
              {Array.from({ length: size }, (_, i) => {
                const char = value[i];
                const filled = char !== undefined;
                const isActive = i === active;
                const border =
                  status === "error"
                    ? errorColor
                    : isActive || filled
                      ? accentColor
                      : undefined;

                return (
                  <div
                    key={i}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      focusCell(i);
                    }}
                    className={cn(
                      "relative flex h-14 w-11 items-center justify-center rounded-md border bg-raised/60 font-mono text-[20px] text-ink tabular-nums transition-colors",
                      border ? "border-transparent" : "border-hairline",
                    )}
                    style={border ? { boxShadow: `inset 0 0 0 1.5px ${border}` } : undefined}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {filled ? (
                        <motion.span
                          key={`${i}-${char}`}
                          // Compressed on arrival, then sprung back. The dip is
                          // the anticipation: a cell that only grows reads as a
                          // resize, one that gathers first reads as a reaction.
                          initial={
                            reducedMotion
                              ? false
                              : { scale: Math.max(0.2, 1 - anticipation * 3), opacity: 0 }
                          }
                          animate={{ scale: 1, opacity: 1 }}
                          exit={reducedMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
                          transition={spring}
                        >
                          {mask ? "•" : char}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>

                    {isActive && !filled ? (
                      <motion.span
                        aria-hidden
                        className="absolute h-6 w-px"
                        style={{ backgroundColor: accentColor }}
                        animate={reducedMotion ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : { duration: 1.1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }
                        }
                      />
                    ) : null}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p
        className="h-4 font-display text-[10px] tracking-[0.22em] uppercase"
        style={{ color: status === "error" ? errorColor : undefined }}
        role="status"
      >
        {status === "error"
          ? "that code is not right"
          : status === "success"
            ? ""
            : " "}
      </p>
    </div>
  );
}
