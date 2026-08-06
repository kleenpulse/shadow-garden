"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

// Editing in place, with nothing moving.
//
// The craft here is entirely negative space: click the text and the *only*
// thing that changes is that a border and a wash arrive. No jump, no reflow,
// nothing below shifting by two pixels. Every inline editor that fails does so
// the same way — a display element and a field element with different metrics,
// swapped, and the eye reads the jump as a page reloading.
//
// Two decisions buy that:
//
//   - One padded box, two contents. The border, background, padding and radius
//     live on a shell that never unmounts, so the metrics cannot disagree — and
//     the border/background fade is a real morph rather than two elements
//     crossfading. The border is `transparent`, not absent: a border that
//     appears on edit adds 2px to every dimension.
//   - The field is sized by an invisible copy of the draft, stacked in the same
//     grid cell. `field-sizing: content` is the modern answer to this and is not
//     in every engine yet; a JS mirror measures on every keystroke and thrashes
//     layout for it. A grid cell sized by its widest child does the same job in
//     CSS, everywhere, and measures nothing.
//
// The affordance and the confirm buttons are absolutely positioned outside the
// shell for the same reason: anything rendered *inside* it changes the width of
// the box the whole component exists to keep still.
export type InlineEditCommitOn = "blur" | "explicit";
export type InlineEditUnderline = "dotted" | "solid" | "none";

export interface InlineEditProps {
  /** Committed value. Leave undefined and the component owns it. */
  value?: string;
  /** Starting value while uncontrolled. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Names the field for assistive tech, and prefixes the button's own name so
   *  "Rename" is not announced as the value itself. */
  label?: string;
  placeholder?: string;
  /** `blur` commits when focus leaves. `explicit` grows a confirm and a cancel
   *  and treats losing focus as a cancel — both are defensible, which is why
   *  it is a prop and not a decision. */
  commitOn?: InlineEditCommitOn;
  /** Spring tension on the border and wash arriving. */
  stiffness?: number;
  /** Spring friction on the same. */
  damping?: number;
  /** How the display state says it is editable. */
  underline?: InlineEditUnderline;
  /** Horizontal padding, in px. Shared by both states by construction. */
  padX?: number;
  /** Vertical padding, in px. */
  padY?: number;
  /** Corner radius, in px. */
  radius?: number;
  /** Select the whole value on entering edit, so typing replaces it. */
  selectOnEdit?: boolean;
  /** Accept an empty commit. Off reverts to the previous value. */
  allowEmpty?: boolean;
  /** Pencil on hover and focus. */
  showPencil?: boolean;
  /** A textarea that grows by line instead of a single-line field. */
  multiline?: boolean;
  /** The border, wash and focus ring of the editing state. Expected as a
   *  6-digit hex — the alpha variants are built by suffix, which keeps the
   *  fade-in and fade-out on one interpolation instead of two colours. */
  accentColor?: string;
  /** The border and wash arrive instantly. Nothing is hidden either way; only
   *  the fade is withheld. */
  reducedMotion?: boolean;
  className?: string;
}

export default function InlineEdit({
  value,
  defaultValue = "",
  onValueChange,
  label = "Value",
  placeholder = "Empty",
  commitOn = "blur",
  stiffness = 460,
  damping = 32,
  underline = "dotted",
  padX = 8,
  padY = 5,
  radius = 6,
  selectOnEdit = true,
  allowEmpty = false,
  showPencil = true,
  multiline = false,
  accentColor = "#a855f7",
  reducedMotion = false,
  className,
}: InlineEditProps) {
  const controlled = value !== undefined;
  const [self, setSelf] = useState(defaultValue);
  const committed = controlled ? value : self;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(committed);

  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const handBack = useRef(false);

  useEffect(() => {
    if (!editing) return;
    const field = fieldRef.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    if (selectOnEdit) field.select();
    // Runs on entering edit only. Re-selecting on every render would fight the
    // caret the moment anyone typed.
  }, [editing, selectOnEdit]);

  // Focus is handed back in an effect, never inline. At the moment Escape runs,
  // the display button does not exist — React has not rendered it — so the ref
  // is null and the call is a silent no-op. Measured: Escape left focus on
  // <body>, and every subsequent keystroke went nowhere. Only deliberate exits
  // set the flag: a commit caused by clicking somewhere else must not yank the
  // caret back out of whatever was clicked.
  useEffect(() => {
    if (editing || !handBack.current) return;
    handBack.current = false;
    buttonRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const begin = () => {
    setDraft(committed);
    setEditing(true);
  };

  const finish = (next: string) => {
    if (!controlled) setSelf(next);
    onValueChange?.(next);
    setEditing(false);
  };

  const commit = (refocus = false) => {
    handBack.current = refocus;
    const next = draft.trim();
    // An empty commit is a mis-click far more often than an intention, so the
    // default is to put the old value back rather than to blank the field.
    finish(!next && !allowEmpty ? committed : draft);
  };

  const cancel = (refocus = false) => {
    handBack.current = refocus;
    setDraft(committed);
    setEditing(false);
  };

  const box = {
    paddingLeft: padX,
    paddingRight: padX,
    paddingTop: padY,
    paddingBottom: padY,
    borderRadius: radius,
  };
  const type = cn(
    "font-sans text-[15px] leading-normal",
    multiline ? "whitespace-pre-wrap" : "whitespace-pre",
  );

  const spring = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness, damping };

  return (
    <span
      ref={rootRef}
      className={cn("group/edit relative inline-block", className)}
    >
      <motion.span
        className="block border border-solid"
        style={box}
        initial={false}
        animate={{
          backgroundColor: editing ? `${accentColor}14` : `${accentColor}00`,
          borderColor: editing ? accentColor : `${accentColor}00`,
          boxShadow: editing
            ? `0 0 0 3px ${accentColor}26`
            : `0 0 0 0px ${accentColor}00`,
        }}
        transition={spring}
      >
        {editing ? (
          <span className="grid *:col-1 *:row-1">
            {/* The sizer. Holds the exact draft so the grid cell is the width
                the text needs, then the field stretches to fill it. The zero
                width space keeps the cell from collapsing on an empty draft,
                and the trailing space keeps a final newline from being the
                one line the box refuses to reserve. */}
            <span aria-hidden className={cn(type, "invisible wrap-break-word")}>
              {draft.endsWith("\n") ? `${draft} ` : draft || "​"}
            </span>
            {multiline ? (
              <textarea
                ref={fieldRef}
                rows={1}
                cols={1}
                value={draft}
                placeholder={placeholder}
                aria-label={label}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    cancel(true);
                  }
                  // Enter belongs to the text in a multiline field, so the
                  // commit moves to the modifier the platform already uses for
                  // "send".
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                    commit(true);
                }}
                onBlur={(event) => {
                  if (rootRef.current?.contains(event.relatedTarget)) return;
                  if (commitOn === "blur") commit();
                  else cancel();
                }}
                // Both axes get the same treatment, and the vertical one is not
                // optional: `rows={1}` is an intrinsic height, and a textarea
                // does not reliably stretch to its grid area the way a plain
                // box does. Left at its intrinsic size it stays exactly one row
                // tall with `overflow-hidden` over it, so a value that wraps has
                // every line after the first clipped and unreachable — the box
                // grows, the field does not.
                className={cn(
                  type,
                  "h-0 min-h-full w-0 min-w-full resize-none overflow-hidden bg-transparent text-ink outline-none placeholder:text-ink-mute/70",
                )}
              />
            ) : (
              <input
                ref={fieldRef}
                type="text"
                size={1}
                value={draft}
                placeholder={placeholder}
                aria-label={label}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    cancel(true);
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit(true);
                  }
                }}
                onBlur={(event) => {
                  if (rootRef.current?.contains(event.relatedTarget)) return;
                  if (commitOn === "blur") commit();
                  else cancel();
                }}
                // `w-0 min-w-full`, and `size={1}` on top of it. A field is the
                // one element that brings its own opinion about width: the
                // default `size` is twenty characters, and a grid cell takes the
                // larger of its children, so the sizer beside it was ignored
                // until the text passed twenty characters. Measured: the box sat
                // at 209px and gained 7px for a further twenty-five characters
                // typed into it. Width zero removes the field from the cell's
                // intrinsic sizing entirely; the percentage minimum puts it back
                // once the cell has a width to fill.
                className={cn(
                  type,
                  "w-0 min-w-full bg-transparent text-ink outline-none placeholder:text-ink-mute/70",
                )}
              />
            )}
          </span>
        ) : (
          <button
            ref={buttonRef}
            type="button"
            onClick={begin}
            aria-label={`${label}: ${committed || placeholder}`}
            className={cn(
              type,
              "block w-full cursor-text text-left text-ink outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              // Single line: the display clips where the field would scroll.
              // Neither changes the box, so the two states still agree — and a
              // value longer than the column spilling out of an unclipped
              // button is the one way this component can visibly move something.
              !multiline && "overflow-hidden text-ellipsis",
              !committed && "text-ink-mute",
            )}
            style={{
              textDecorationLine: underline === "none" ? "none" : "underline",
              textDecorationStyle:
                underline === "dotted" ? "dotted" : ("solid" as const),
              textDecorationColor: `${accentColor}66`,
              textUnderlineOffset: 4,
            }}
          >
            {committed || placeholder}
          </button>
        )}
      </motion.span>

      {showPencil && !editing ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 -right-6 -translate-y-1/2 text-ink-mute opacity-0 transition-opacity duration-150 group-focus-within/edit:opacity-100 group-hover/edit:opacity-100"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </span>
      ) : null}

      {editing && commitOn === "explicit" ? (
        <span className="absolute top-1/2 -right-13 flex -translate-y-1/2 gap-1">
          {/* Outside the shell, so confirming does not widen the box the whole
              component exists to hold still. `onMouseDown` prevents the field
              blurring before the click lands — a blur that cancels would eat
              the very button that was pressed. */}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit(true)}
            aria-label="Save"
            className="rounded-sm border border-hairline p-1 text-ink-dim transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12.5 9.5 18 20 6.5" />
            </svg>
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => cancel(true)}
            aria-label="Cancel"
            className="rounded-sm border border-hairline p-1 text-ink-dim transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 5 19 19M19 5 5 19" />
            </svg>
          </button>
        </span>
      ) : null}
    </span>
  );
}
