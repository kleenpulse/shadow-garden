"use client";

import { useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import InlineEdit, {
  type InlineEditCommitOn,
  type InlineEditUnderline,
} from "./inline-edit";

export default function InlineEditPreview({
  values,
  reducedMotion,
}: PreviewProps) {
  const [name, setName] = useState("Quarterly rollout");
  // Where the field's own first line starts: its padding plus its border. Every
  // row in the list uses it, so the three values share one baseline whether or
  // not the editable one is currently a field.
  const inset = (values.padY as number) + 1;

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <p className="mb-5 font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
          click the value · nothing moves
        </p>

        <dl className="divide-y divide-hairline border-y border-hairline">
          {/* Top-aligned, not centred. A value long enough to wrap grows
              downward, and a centred row would drag its label down half a line
              with it — the one thing that has to stay put is the label. The
              inset below is the editable row's own padding, applied to the
              static rows so all three still agree on where a value begins. */}
          <div className="flex items-start justify-between gap-4 py-3">
            <dt
              className="font-display text-[10px] tracking-[0.16em] text-ink-mute uppercase"
              style={{ paddingTop: inset }}
            >
              Name
            </dt>
            {/* Negative margin cancels the field's own padding so the display
                text still lines up with the static rows below it. Without it
                the editable row sits inset and reads as a different kind of
                thing before it is ever clicked. */}
            <dd style={{ marginRight: -(values.padX as number) }}>
              <InlineEdit
                value={name}
                onValueChange={setName}
                label="Name"
                commitOn={values.commitOn as InlineEditCommitOn}
                stiffness={values.stiffness as number}
                damping={values.damping as number}
                underline={values.underline as InlineEditUnderline}
                padX={values.padX as number}
                padY={values.padY as number}
                radius={values.radius as number}
                selectOnEdit={values.selectOnEdit as boolean}
                allowEmpty={values.allowEmpty as boolean}
                showPencil={values.showPencil as boolean}
                multiline={values.multiline as boolean}
                accentColor={values.accentColor as string}
                reducedMotion={reducedMotion}
                className="max-w-60"
              />
            </dd>
          </div>

          {/* Static rows, and the whole point of them. Any pixel the editable
              row gains on entering edit pushes these down, so the failure this
              component exists to avoid is visible without measuring anything. */}
          {[
            ["Owner", "Operations"],
            ["Status", "In review"],
          ].map(([term, value]) => (
            <div
              key={term}
              className="flex items-start justify-between gap-4 py-3"
            >
              <dt
                className="font-display text-[10px] tracking-[0.16em] text-ink-mute uppercase"
                style={{ paddingTop: inset }}
              >
                {term}
              </dt>
              <dd
                className="font-sans text-[15px] text-ink-dim"
                style={{ paddingTop: inset }}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 font-sans text-[12px] text-ink-mute">
          enter commits · escape reverts
        </p>
      </div>
    </div>
  );
}
