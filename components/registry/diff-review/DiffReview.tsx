"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LayoutGroup, motion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";

// A review surface for a patch an agent has proposed: read the hunks, flip
// between unified and split, accept or reject each one.
//
// It takes hunks already diffed and does not compute a diff. A Myers
// implementation would be ~150 lines of pure data work before a single pixel
// moves, and it would make this entry a diff library wearing an animation
// costume. Whatever produced the patch — git, a language server, an agent —
// already knows what changed; this is the part that argues about it.
//
// The morph is a shared element per line. Switching views tears the whole tree
// down and builds a different one, so the only thing connecting the two is a
// stable `layoutId`, and the travelling element is deliberately the TEXT RUN
// rather than the row: the same string in the same monospace font has the same
// intrinsic box in both views, so the flight is a pure translation with no
// scale correction to stretch the glyphs. Handing the layoutId to the row
// instead would animate a full-width box into a half-width column, and motion
// would faithfully squash every character on the way.
export type DiffLineKind = "add" | "del" | "context";

export interface DiffLine {
  /** Stable across a view switch — this is what the shared element is keyed by. */
  id: string;
  kind: DiffLineKind;
  text: string;
  /** Line number in the original file. Absent on an added line. */
  oldNo?: number;
  /** Line number in the revised file. Absent on a removed line. */
  newNo?: number;
}

export interface DiffHunk {
  id: string;
  file: string;
  /** The `@@ -1,7 +1,9 @@` line, or any label for the region. */
  header?: string;
  lines: DiffLine[];
}

export type HunkVerdict = "pending" | "accepted" | "rejected";

export interface DiffReviewProps {
  /** Pre-diffed. Order is preserved exactly as given. */
  hunks?: DiffHunk[];
  /** Fired when a hunk is accepted, once per transition into that verdict. */
  onAccept?: (hunk: DiffHunk) => void;
  /** Fired when a hunk is rejected. */
  onReject?: (hunk: DiffHunk) => void;
  /** Starting layout. The toolbar toggle overrides it live. */
  defaultView?: "unified" | "split";
  /** Fold, verdict and reveal timings, in ms. The line flight is a spring and
   *  ignores this — stiffness and damping own that one. */
  morphDuration?: number;
  /** How hard a line is pulled toward its slot in the other view. */
  stiffness?: number;
  /** How fast that flight settles. */
  damping?: number;
  /** Delay added per line as a hunk first appears, in ms. */
  stagger?: number;
  /** Row height and type size throughout. */
  density?: "comfortable" | "compact";
  /** Old/new line numbers in the gutter. */
  showLineNumbers?: boolean;
  /** Unchanged lines kept around each change; the rest fold behind an expander. */
  contextLines?: number;
  /** Fold a hunk's body away once it has a verdict. */
  collapseDecided?: boolean;
  /** Added lines. */
  addColor?: string;
  /** Removed lines. */
  delColor?: string;
  /** Toolbar, focus rings and the reviewed counter. */
  accentColor?: string;
  /** Drops the flight, the stagger and the fold tweens. Every line stays
   *  readable and every control keeps working. */
  reducedMotion?: boolean;
  className?: string;
}

/** Row height in px. Fixed per density, and load-bearing in split view: the two
 *  columns are independent scroll panes, so equal row heights are the only
 *  thing keeping an old line level with the new line that replaced it. */
const ROW = { comfortable: 24, compact: 20 } as const;

/** Ceiling on the reveal stagger index. A batch is however many lines happen to
 *  mount at once — uncapped, expanding a 60-line fold leaves the last row
 *  waiting the better part of a second in plain sight (the Masonry lesson). */
const STAGGER_CAP = 12;

const EASE = [0.22, 1, 0.36, 1] as const;

type Segment =
  | { kind: "lines"; key: string; lines: DiffLine[] }
  | { kind: "fold"; key: string; lines: DiffLine[] };

/**
 * Collapse long runs of unchanged lines. A run keeps `contextLines` on the side
 * that faces a change and nothing on a side that faces the edge of the hunk —
 * context above the first change is only interesting where it meets the change.
 * A fold that would hide one line is left alone: the expander row costs as much
 * space as the line it hides.
 */
function foldContext(lines: DiffLine[], contextLines: number): Segment[] {
  const out: Segment[] = [];
  const push = (run: DiffLine[]) => {
    if (run.length > 0) out.push({ kind: "lines", key: run[0].id, lines: run });
  };

  let i = 0;
  while (i < lines.length) {
    const start = i;
    const context = lines[i].kind === "context";
    while (i < lines.length && (lines[i].kind === "context") === context) i++;
    const run = lines.slice(start, i);

    if (!context) {
      push(run);
      continue;
    }

    const leading = start === 0 && i < lines.length;
    const trailing = i === lines.length && start > 0;
    const head = leading ? 0 : contextLines;
    const tail = trailing ? 0 : contextLines;
    const hiddenCount = run.length - head - tail;
    if (hiddenCount <= 1) {
      push(run);
      continue;
    }

    push(run.slice(0, head));
    out.push({
      kind: "fold",
      key: `fold:${run[head].id}`,
      lines: run.slice(head, run.length - tail),
    });
    push(run.slice(run.length - tail));
  }
  return out;
}

/**
 * Zip a run of lines into side-by-side rows. A removal and the addition that
 * replaced it share a row; an unpaired one gets an empty cell opposite. Context
 * occupies both cells of its row, which is why it needs the mirror below.
 */
function pairRows(lines: DiffLine[]) {
  const rows: Array<{ key: string; left: DiffLine | null; right: DiffLine | null }> =
    [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind === "context") {
      rows.push({ key: lines[i].id, left: lines[i], right: lines[i] });
      i++;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === "del") dels.push(lines[i++]);
    while (i < lines.length && lines[i].kind === "add") adds.push(lines[i++]);
    const span = Math.max(dels.length, adds.length);
    for (let k = 0; k < span; k++) {
      const left = dels[k] ?? null;
      const right = adds[k] ?? null;
      rows.push({ key: (left ?? right)!.id, left, right });
    }
  }
  return rows;
}

function tally(lines: DiffLine[]) {
  let add = 0;
  let del = 0;
  for (const line of lines) {
    if (line.kind === "add") add++;
    else if (line.kind === "del") del++;
  }
  return { add, del };
}

const SIGN: Record<DiffLineKind, string> = { add: "+", del: "−", context: " " };
const SPOKEN: Record<DiffLineKind, string> = {
  add: "Added, ",
  del: "Removed, ",
  context: "",
};

interface CellProps {
  line: DiffLine | null;
  /** Which number the gutter shows. Split view has one column per side. */
  number: "old" | "new" | "both";
  /** False on the duplicated context in split view's right column. */
  travels: boolean;
  uid: string;
  compact: boolean;
  showLineNumbers: boolean;
  addColor: string;
  delColor: string;
  spring: Transition;
  reveal: Transition | false;
}

function LineCell({
  line,
  number,
  travels,
  uid,
  compact,
  showLineNumbers,
  addColor,
  delColor,
  spring,
  reveal,
}: CellProps) {
  const height = compact ? ROW.compact : ROW.comfortable;

  if (!line) {
    // An unpaired slot. It still occupies a row so the two split panes stay in
    // step, and it is hatched rather than blank so the gap reads as "nothing
    // here" instead of "content failed to load".
    return (
      <div
        style={{ height }}
        aria-hidden
        className="bg-[repeating-linear-gradient(135deg,var(--sg-hairline)_0px,var(--sg-hairline)_1px,transparent_1px,transparent_6px)] opacity-40"
      />
    );
  }

  const tint = line.kind === "add" ? addColor : line.kind === "del" ? delColor : null;
  const gutter = compact ? "w-8" : "w-10";

  return (
    <div
      className="relative flex items-center"
      style={{ height, backgroundColor: tint ? `${tint}1a` : undefined }}
      aria-hidden={travels ? undefined : true}
      // Read back after commit to mark this line as revealed. Doing it during
      // render would mutate a ref mid-render, and StrictMode's double pass
      // would then mark every line seen on the first pass and cancel the
      // entrance on the second — an animation that only breaks in dev.
      data-line={travels ? line.id : undefined}
    >
      {showLineNumbers ? (
        <span
          className={cn(
            "shrink-0 border-r border-hairline pr-1.5 text-right font-mono tabular-nums text-ink-mute/70 select-none",
            gutter,
            compact ? "text-[10px]" : "text-[11px]",
          )}
        >
          {number === "old"
            ? (line.oldNo ?? "")
            : number === "new"
              ? (line.newNo ?? "")
              : (line.newNo ?? line.oldNo ?? "")}
        </span>
      ) : null}

      <span
        className={cn(
          "shrink-0 px-1.5 text-center font-mono select-none",
          compact ? "text-[11px]" : "text-[12px]",
        )}
        style={{ color: tint ?? "var(--sg-ink-mute)" }}
        aria-hidden
      >
        {SIGN[line.kind]}
      </span>

      {travels ? (
        <span className="sr-only">{SPOKEN[line.kind]}</span>
      ) : null}

      {/* The shared element. `inline-block` and `whitespace-pre` keep its box
          exactly as wide as the text, which is the same in both views — so the
          FLIP resolves to a translation and nothing is scaled. Only one copy of
          a given line may carry the id at a time, which is what the `travels`
          flag decides for context lines in split view. */}
      {travels ? (
        <motion.span
          layoutId={`${uid}/${line.id}`}
          initial={reveal ? { opacity: 0, x: -6 } : false}
          animate={{ opacity: 1, x: 0 }}
          // Two clocks on one element. The entrance owns opacity and x; the
          // `layout` key owns the flight between views, which is a spring the
          // two documented props actually reach. Collapsing them into one
          // transition is what makes stiffness and damping inert props.
          // They never overlap in practice: a line only reveals on its first
          // appearance, and by the time a view switch can fly it, `reveal` is
          // already false.
          transition={reveal ? { ...reveal, layout: spring } : { layout: spring }}
          className={cn(
            "inline-block pr-4 pl-1 font-mono whitespace-pre text-ink",
            compact ? "text-[11px]" : "text-[12px]",
          )}
        >
          {line.text || " "}
        </motion.span>
      ) : (
        <span
          className={cn(
            "inline-block pr-4 pl-1 font-mono whitespace-pre text-ink/70",
            compact ? "text-[11px]" : "text-[12px]",
          )}
        >
          {line.text || " "}
        </span>
      )}
    </div>
  );
}

export default function DiffReview({
  hunks = [],
  onAccept,
  onReject,
  defaultView = "unified",
  morphDuration = 380,
  stiffness = 420,
  damping = 38,
  stagger = 14,
  density = "comfortable",
  showLineNumbers = true,
  contextLines = 3,
  collapseDecided = true,
  addColor = "#4ade80",
  delColor = "#f87171",
  accentColor = "#a855f7",
  reducedMotion = false,
  className,
}: DiffReviewProps) {
  const uid = useId().replace(/:/g, "");
  const [view, setView] = useState<"unified" | "split">(defaultView);
  const [verdicts, setVerdicts] = useState<Record<string, HunkVerdict>>({});
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});

  // `defaultView` is a live control, so it has to keep working after the user
  // has touched the toggle — otherwise the control silently stops responding
  // the moment anyone clicks the thing it controls.
  //
  // Adjusted during render against a remembered copy, not in an effect. An
  // effect would commit and paint the stale view first and then correct it,
  // which is a visible flash of the old layout; React re-runs this render
  // before anything reaches the screen.
  const [lastDefault, setLastDefault] = useState(defaultView);
  if (defaultView !== lastDefault) {
    setLastDefault(defaultView);
    setView(defaultView);
  }

  // A line animates in once, ever. Without this the entrance re-fires on every
  // view switch and fights the flight it is supposed to accompany: the same
  // element would be sliding in from -6px while motion translates it across
  // the pane.
  //
  // Marked from the DOM after each commit rather than from the data. A line
  // hidden behind a collapsed fold has never been on screen and still deserves
  // its entrance when the fold opens, so "has been rendered" is the only
  // honest test — and it is a fact only the DOM holds.
  const seen = useRef(new Set<string>());
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const node of root.querySelectorAll<HTMLElement>("[data-line]")) {
      if (node.dataset.line) seen.current.add(node.dataset.line);
    }
  });

  const compact = density === "compact";
  const spring = reducedMotion
    ? ({ duration: 0 } as const)
    : ({ type: "spring", stiffness, damping } as const);
  const ease = reducedMotion
    ? ({ duration: 0 } as const)
    : ({ duration: morphDuration / 1000, ease: EASE } as const);

  const segments = useMemo(
    () =>
      hunks.map((hunk) => ({
        hunk,
        stats: tally(hunk.lines),
        segments: foldContext(hunk.lines, contextLines),
      })),
    [hunks, contextLines],
  );

  const totals = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const entry of segments) {
      add += entry.stats.add;
      del += entry.stats.del;
    }
    return { add, del };
  }, [segments]);

  const decided = hunks.filter((h) => (verdicts[h.id] ?? "pending") !== "pending").length;

  const rule = (hunk: DiffHunk, verdict: HunkVerdict) => {
    setVerdicts((prev) => {
      if ((prev[hunk.id] ?? "pending") === verdict) return prev;
      return { ...prev, [hunk.id]: verdict };
    });
    if (verdict === "accepted") onAccept?.(hunk);
    if (verdict === "rejected") onReject?.(hunk);
  };

  /** Reveal transition for a line, or `false` once it has been seen. */
  const revealFor = (id: string, index: number): Transition | false => {
    if (reducedMotion || seen.current.has(id)) return false;
    return {
      duration: (morphDuration / 1000) * 0.5,
      delay: (Math.min(index, STAGGER_CAP) * stagger) / 1000,
      ease: EASE,
    };
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "w-full overflow-hidden rounded-lg border border-hairline bg-panel",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-3 py-2.5">
        <div className="flex items-center gap-3">
          <span className="font-display text-[10px] tracking-[0.24em] text-ink-mute uppercase">
            Proposed patch
          </span>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: addColor }}>
            +{totals.add}
          </span>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: delColor }}>
            &minus;{totals.del}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px] tabular-nums"
            style={{ color: decided === hunks.length ? accentColor : "var(--sg-ink-mute)" }}
            aria-live="polite"
          >
            {decided}/{hunks.length} reviewed
          </span>
          <div
            className="flex overflow-hidden rounded-md border border-hairline"
            role="group"
            aria-label="Diff layout"
          >
            {(["unified", "split"] as const).map((mode) => {
              const active = view === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(mode)}
                  className={cn(
                    "px-2.5 py-1 font-display text-[10px] tracking-[0.16em] uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                    active ? "text-on-accent" : "text-ink-mute hover:bg-raised hover:text-ink",
                  )}
                  style={active ? { backgroundColor: accentColor } : undefined}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* One group around every hunk. A line only ever travels within its own
          hunk, but the group is the boundary motion matches ids inside, and
          scoping it per-hunk would mean one LayoutGroup per hunk for no gain. */}
      <LayoutGroup id={uid}>
        <div className="divide-y divide-hairline">
          {segments.map(({ hunk, stats, segments: parts }) => {
            const verdict = verdicts[hunk.id] ?? "pending";
            const open = !(collapseDecided && verdict !== "pending");
            const edge =
              verdict === "accepted"
                ? addColor
                : verdict === "rejected"
                  ? delColor
                  : null;

            return (
              <section key={hunk.id} aria-label={`${hunk.file} ${hunk.header ?? ""}`}>
                <div
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  style={{
                    borderLeft: `2px solid ${edge ?? "transparent"}`,
                    backgroundColor: edge ? `${edge}0f` : undefined,
                  }}
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-mono text-[12px] text-ink">
                      {hunk.file}
                    </span>
                    {hunk.header ? (
                      <span className="truncate font-mono text-[11px] text-ink-mute">
                        {hunk.header}
                      </span>
                    ) : null}
                    <span
                      className="font-mono text-[10px] tabular-nums"
                      style={{ color: addColor }}
                    >
                      +{stats.add}
                    </span>
                    <span
                      className="font-mono text-[10px] tabular-nums"
                      style={{ color: delColor }}
                    >
                      &minus;{stats.del}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {verdict === "pending" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => rule(hunk, "rejected")}
                          className="rounded-md border border-hairline px-2.5 py-1 font-display text-[10px] tracking-[0.16em] text-ink-dim uppercase transition-colors outline-none hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => rule(hunk, "accepted")}
                          className="rounded-md px-2.5 py-1 font-display text-[10px] tracking-[0.16em] text-on-accent uppercase transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
                          style={{ backgroundColor: accentColor }}
                        >
                          Accept
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className="font-display text-[10px] tracking-[0.16em] uppercase"
                          style={{ color: edge ?? undefined }}
                        >
                          {verdict}
                        </span>
                        <button
                          type="button"
                          onClick={() => rule(hunk, "pending")}
                          className="rounded-md border border-hairline px-2.5 py-1 font-display text-[10px] tracking-[0.16em] text-ink-dim uppercase transition-colors outline-none hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          Undo
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <motion.div
                  initial={false}
                  animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                  transition={ease}
                  className="overflow-hidden"
                  // `inert` and not just `height: 0`: a collapsed hunk is still
                  // in the tab order otherwise, and Tab would walk into a
                  // zero-height box and appear to hang.
                  inert={!open}
                >
                  {view === "unified" ? (
                    <div className="overflow-x-auto">
                      <div className="w-max min-w-full">
                        {parts.map((part) =>
                          part.kind === "fold" && !unfolded[part.key] ? (
                            <FoldRow
                              key={part.key}
                              count={part.lines.length}
                              compact={compact}
                              accentColor={accentColor}
                              onExpand={() =>
                                setUnfolded((prev) => ({ ...prev, [part.key]: true }))
                              }
                            />
                          ) : (
                            part.lines.map((line, i) => (
                              <LineCell
                                key={line.id}
                                line={line}
                                number="both"
                                travels
                                uid={uid}
                                compact={compact}
                                showLineNumbers={showLineNumbers}
                                addColor={addColor}
                                delColor={delColor}
                                spring={spring}
                                reveal={revealFor(line.id, i)}
                              />
                            ))
                          ),
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 divide-x divide-hairline">
                      {(["old", "new"] as const).map((side) => (
                        <div key={side} className="min-w-0 overflow-x-auto">
                          <div className="w-max min-w-full">
                            {parts.map((part) => {
                              if (part.kind === "fold" && !unfolded[part.key]) {
                                return (
                                  <FoldRow
                                    key={part.key}
                                    count={part.lines.length}
                                    compact={compact}
                                    accentColor={accentColor}
                                    // Only the left pane's expander is
                                    // operable; the right one mirrors it, and
                                    // two buttons that do the same thing are
                                    // two tab stops for one action.
                                    onExpand={
                                      side === "old"
                                        ? () =>
                                            setUnfolded((prev) => ({
                                              ...prev,
                                              [part.key]: true,
                                            }))
                                        : undefined
                                    }
                                  />
                                );
                              }
                              return pairRows(part.lines).map((row, i) => {
                                const line = side === "old" ? row.left : row.right;
                                // Context appears in both columns but only one
                                // copy may own the shared id — an element can
                                // be in one place at a time, and a duplicated
                                // layoutId makes motion pick a winner silently.
                                // The old column owns it; the new column shows
                                // a plain, aria-hidden twin.
                                const travels =
                                  line !== null &&
                                  (line.kind !== "context" || side === "old");
                                return (
                                  <LineCell
                                    key={`${side}:${row.key}`}
                                    line={line}
                                    number={side}
                                    travels={travels}
                                    uid={uid}
                                    compact={compact}
                                    showLineNumbers={showLineNumbers}
                                    addColor={addColor}
                                    delColor={delColor}
                                    spring={spring}
                                    reveal={
                                      line && travels ? revealFor(line.id, i) : false
                                    }
                                  />
                                );
                              });
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </section>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}

function FoldRow({
  count,
  compact,
  accentColor,
  onExpand,
}: {
  count: number;
  compact: boolean;
  accentColor: string;
  /** Absent renders an inert mirror — see the split-view call site. */
  onExpand?: () => void;
}) {
  const height = compact ? ROW.compact : ROW.comfortable;
  const label = `Show ${count} unchanged line${count === 1 ? "" : "s"}`;

  if (!onExpand) {
    return (
      <div
        style={{ height }}
        aria-hidden
        className="flex items-center bg-raised/40 px-3 font-mono text-[11px] text-ink-mute/60 select-none"
      >
        {"⋯"}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onExpand}
      style={{ height, color: accentColor }}
      className="flex w-full items-center gap-2 bg-raised/40 px-3 font-mono text-[11px] transition-colors outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
    >
      <span aria-hidden>{"⋯"}</span>
      {label}
    </button>
  );
}
