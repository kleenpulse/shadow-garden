/** One choice in a step.
 *
 *  `freeform` marks the escape hatch. It is not a separate control living below
 *  the list — it is an option inside the group, obeying that group's own
 *  semantics: in a `single` step choosing it clears the rest, in a `multi` step
 *  it accumulates alongside them. Selecting it opens a field in place. */
export interface ApprovalOption {
  id: string;
  label: string;
  hint?: string;
  freeform?: boolean;
  /** Placeholder for the field the escape hatch opens. Ignored otherwise. */
  placeholder?: string;
}

export interface ApprovalStep {
  id: string;
  /** `single` clears the group on select (radio); `multi` accumulates (checkbox). */
  kind: "single" | "multi";
  title: string;
  prompt?: string;
  options: ApprovalOption[];
  /** Lets the step advance unanswered. */
  optional?: boolean;
  /** Return a message to block the step, or null to let it through. This
   *  REPLACES the default rule rather than running after it, so a step that
   *  still wants "must pick something" has to say so itself. */
  validate?: (answer: ApprovalAnswer, step: ApprovalStep) => string | null;
}

export interface ApprovalAnswer {
  optionIds: string[];
  /** Text typed into the escape hatch. Kept across a deselect on purpose — an
   *  accidental toggle should not destroy a sentence the user typed. It is only
   *  read back when a freeform option is actually selected. */
  other?: string;
}

export type ApprovalAnswers = Record<string, ApprovalAnswer>;

export const EMPTY_ANSWER: ApprovalAnswer = { optionIds: [] };

export function answerFor(answers: ApprovalAnswers, stepId: string): ApprovalAnswer {
  return answers[stepId] ?? EMPTY_ANSWER;
}

export function freeformOption(step: ApprovalStep): ApprovalOption | undefined {
  return step.options.find((option) => option.freeform);
}

/** Whether the escape hatch is currently the live answer — the only state in
 *  which its typed text counts toward validation or the summary. */
export function freeformActive(step: ApprovalStep, answer: ApprovalAnswer): boolean {
  const hatch = freeformOption(step);
  return Boolean(hatch && answer.optionIds.includes(hatch.id));
}

/** The default rule. A step is answerable when it holds at least one option,
 *  and an escape hatch selected but left blank is not an answer — it is an
 *  unfinished sentence. */
export function defaultValidate(
  answer: ApprovalAnswer,
  step: ApprovalStep,
): string | null {
  if (step.optional) return null;
  if (answer.optionIds.length === 0) return "Choose an option to continue.";
  if (freeformActive(step, answer) && !(answer.other ?? "").trim()) {
    return "Describe what you need instead.";
  }
  return null;
}

export function validateStep(
  answer: ApprovalAnswer,
  step: ApprovalStep,
): string | null {
  return step.validate ? step.validate(answer, step) : defaultValidate(answer, step);
}

/** What the decided rail shows once a step is behind you. The escape-hatch text
 *  wins when it is live, because "Other" alone says nothing. */
export function summarise(step: ApprovalStep, answer: ApprovalAnswer): string {
  if (answer.optionIds.length === 0) return "Skipped";

  if (freeformActive(step, answer)) {
    const typed = (answer.other ?? "").trim();
    const rest = answer.optionIds.length - 1;
    if (typed) return rest > 0 ? `${typed} +${rest}` : typed;
  }

  const chosen = step.options.filter((option) => answer.optionIds.includes(option.id));
  const [first, ...others] = chosen;
  if (!first) return "Skipped";
  return others.length > 0 ? `${first.label} +${others.length}` : first.label;
}

/** The one place the shared-element id is spelled. The option row puts it on a
 *  label and the decided rail puts it on the summary; if those two ever disagree
 *  by a single character the flight degrades to a crossfade, looks *fine*, and
 *  nothing anywhere reports it. Both call this. */
export function travelId(uid: string, stepId: string, optionId: string): string {
  // Segments are encoded, not just joined. Any separator can legally appear
  // inside an author's id: with a plain hyphen, step "a" + option "b-c" and
  // step "a-b" + option "c" build the same string. Encoding makes the split
  // points unambiguous no matter what the ids contain.
  //
  // Worth the four extra characters because motion ships no duplicate-layoutId
  // warning: the loser of a collision is rendered at opacity 0 with
  // pointer-events off, so it presents as "one label is invisible and
  // unclickable" with a completely clean console.
  return [uid, stepId, optionId].map(encodeURIComponent).join("/");
}

/** The option whose label physically travels into the rail. One element flies,
 *  never all of them: a multi-select committing four cards at once reads as a
 *  scatter, and the rail only has room for one line anyway. */
export function travellingOption(
  step: ApprovalStep,
  answer: ApprovalAnswer,
): ApprovalOption | undefined {
  return step.options.find((option) => answer.optionIds.includes(option.id));
}
