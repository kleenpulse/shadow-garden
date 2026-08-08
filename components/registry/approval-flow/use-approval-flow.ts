"use client";

import { useCallback, useMemo, useReducer } from "react";
import {
  answerFor,
  freeformOption,
  validateStep,
  type ApprovalAnswer,
  type ApprovalAnswers,
  type ApprovalStep,
} from "./types";

interface FlowState {
  index: number;
  answers: ApprovalAnswers;
  error: string | null;
  /** A counter, not a boolean. The rejection animation has to be able to fire
   *  twice in a row on the same step, and a flag would already be true the
   *  second time and silently do nothing. Nothing has to clear it, either. */
  rejected: number;
  /** Which way the step content travels. Read by the panel so going back slides
   *  the opposite way from going forward. */
  direction: 1 | -1;
  submitted: boolean;
}

type FlowAction =
  | { type: "toggle"; step: ApprovalStep; optionId: string }
  | { type: "other"; stepId: string; value: string }
  | { type: "advance"; error: string | null; last: boolean }
  | { type: "back" }
  | { type: "edit"; index: number }
  | { type: "reset" };

const INITIAL: FlowState = {
  index: 0,
  answers: {},
  error: null,
  rejected: 0,
  direction: 1,
  submitted: false,
};

function toggle(state: FlowState, step: ApprovalStep, optionId: string): FlowState {
  const current = answerFor(state.answers, step.id);
  const held = current.optionIds.includes(optionId);
  const hatch = freeformOption(step);

  let optionIds: string[];
  if (step.kind === "single") {
    optionIds = held ? [] : [optionId];
  } else if (held) {
    optionIds = current.optionIds.filter((id) => id !== optionId);
  } else {
    // Preserve the declared order rather than appending. The rail summarises by
    // taking the first selected option, so an append-ordered list would make the
    // summary depend on the order the user happened to click.
    const next = new Set([...current.optionIds, optionId]);
    optionIds = step.options.filter((option) => next.has(option.id)).map((o) => o.id);
  }

  const answer: ApprovalAnswer = { ...current, optionIds };

  return {
    ...state,
    answers: { ...state.answers, [step.id]: answer },
    // Clear the block the moment the user acts on it. Leaving an error visible
    // while its cause is being fixed reads as the form arguing back.
    error: state.error && optionIds.length > 0 ? null : state.error,
    // Touching any other row abandons the hatch; keep the text, drop the error.
    ...(hatch && optionId !== hatch.id && step.kind === "single" ? { error: null } : {}),
  };
}

function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "toggle":
      return toggle(state, action.step, action.optionId);

    case "other": {
      const current = answerFor(state.answers, action.stepId);
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.stepId]: { ...current, other: action.value },
        },
        error: action.value.trim() ? null : state.error,
      };
    }

    case "advance":
      if (action.error) {
        return { ...state, error: action.error, rejected: state.rejected + 1 };
      }
      return {
        ...state,
        error: null,
        direction: 1,
        index: action.last ? state.index : state.index + 1,
        submitted: action.last ? true : state.submitted,
      };

    case "back":
      if (state.index === 0) return state;
      return { ...state, index: state.index - 1, direction: -1, error: null };

    case "edit":
      return {
        ...state,
        index: action.index,
        direction: action.index > state.index ? 1 : -1,
        error: null,
        submitted: false,
      };

    case "reset":
      return INITIAL;

    default:
      return state;
  }
}

/** The step machine. Validation lives here rather than in the reducer because it
 *  needs the step object, and threading the whole step array through every
 *  action just to re-derive it would make the reducer the wrong shape. */
export function useApprovalFlow(steps: ApprovalStep[]) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const index = Math.min(state.index, Math.max(0, steps.length - 1));
  const step = steps[index];
  const answer = step ? answerFor(state.answers, step.id) : undefined;
  const last = index === steps.length - 1;

  /** Whether Next would go through right now. Drives the disabled state, so it
   *  runs the same predicate the commit does — two rules would drift. */
  const passes = useMemo(
    () => (step && answer ? validateStep(answer, step) === null : true),
    [step, answer],
  );

  const next = useCallback(() => {
    if (!step || !answer) return;
    dispatch({ type: "advance", error: validateStep(answer, step), last });
  }, [step, answer, last]);

  const toggleOption = useCallback(
    (optionId: string) => {
      if (!step) return;
      dispatch({ type: "toggle", step, optionId });
    },
    [step],
  );

  const setOther = useCallback(
    (value: string) => {
      if (!step) return;
      dispatch({ type: "other", stepId: step.id, value });
    },
    [step],
  );

  const back = useCallback(() => dispatch({ type: "back" }), []);
  const edit = useCallback((to: number) => dispatch({ type: "edit", index: to }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return {
    index,
    step,
    answer,
    answers: state.answers,
    error: state.error,
    rejected: state.rejected,
    direction: state.direction,
    submitted: state.submitted,
    last,
    passes,
    decided: steps.slice(0, index),
    toggleOption,
    setOther,
    next,
    back,
    edit,
    reset,
  };
}
