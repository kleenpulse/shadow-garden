"use client";

import { useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import ApprovalFlow from "./ApprovalFlow";
import { summarise, type ApprovalAnswers, type ApprovalStep } from "./types";

// An agent asking for permission is the honest demo: it is a real checklist with
// real consequences, it needs both a single-choice and a multi-choice step to be
// itself, and "none of these" is something a person genuinely wants to say to it.
//
// The content is a module constant, not a tuned prop. There is no string prop
// kind — the four are number, enum, boolean and colour — so the checklist itself
// lives here and the Controls panel tunes the mechanism, which is the right split
// anyway: nobody buys this to retype the demo copy.
const STEPS: ApprovalStep[] = [
  {
    id: "scope",
    kind: "single",
    title: "Scope",
    prompt: "How far may the agent reach into the working tree?",
    options: [
      { id: "repo", label: "Repo only", hint: "Tracked files in this checkout." },
      { id: "submodules", label: "Repo + submodules", hint: "Follows every pinned ref." },
      { id: "workspace", label: "Entire workspace", hint: "Sibling checkouts included." },
      {
        id: "scope-other",
        label: "Other…",
        freeform: true,
        placeholder: "e.g. packages/core and nothing else",
      },
    ],
  },
  {
    id: "tools",
    kind: "multi",
    title: "Tool access",
    prompt: "Every capability granted here runs without a second prompt.",
    options: [
      { id: "read", label: "Read files" },
      { id: "write", label: "Write files", hint: "Creates, edits and deletes." },
      { id: "shell", label: "Execute shell", hint: "No sandbox." },
      {
        id: "tools-other",
        label: "Other…",
        freeform: true,
        placeholder: "e.g. network egress to the artifact store",
      },
    ],
  },
  {
    id: "window",
    kind: "single",
    title: "Approval window",
    prompt: "When does this authorisation lapse?",
    options: [
      { id: "session", label: "This session" },
      { id: "day", label: "24 hours" },
      { id: "revoked", label: "Until revoked", hint: "Survives restarts." },
    ],
  },
];

export default function ApprovalFlowPreview({ values, reducedMotion }: PreviewProps) {
  const [granted, setGranted] = useState<ApprovalAnswers | null>(null);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-6">
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        shadow garden · agent authorisation
      </p>

      <div className="w-full max-w-3xl">
        <ApprovalFlow
          steps={STEPS}
          onSubmit={setGranted}
          layout={values.layout as "rail" | "inline"}
          morphDuration={values.morphDuration as number}
          stiffness={values.stiffness as number}
          damping={values.damping as number}
          density={values.density as "comfortable" | "compact"}
          revealStagger={values.revealStagger as number}
          shakeIntensity={values.shakeIntensity as number}
          shakeCycles={values.shakeCycles as number}
          showProgress={values.showProgress as boolean}
          autoAdvance={values.autoAdvance as boolean}
          accentColor={values.accentColor as string}
          dangerColor={values.dangerColor as string}
          reducedMotion={reducedMotion}
        />
      </div>

      <p
        className={
          granted
            ? "font-display text-[11px] tracking-[0.14em] text-accent"
            : "font-display text-[11px] tracking-[0.14em] text-ink-mute"
        }
      >
        {granted
          ? `> granted · ${STEPS.map((step) => summarise(step, granted[step.id] ?? { optionIds: [] })).join(" · ")}`
          : "> awaiting authorisation"}
      </p>
    </div>
  );
}
