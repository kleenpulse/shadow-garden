"use client";

import { useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import DiffReview, { type DiffHunk, type DiffLine, type DiffLineKind } from "./diff-review";

// A patch an agent has written and wants merged. The register is the point: a
// diff is only worth reviewing when accepting it would actually do something,
// and "the agent widened its own permissions" is the most honest example of
// that this library can show.
//
// The hunks are a module constant, not a tuned prop — there is no string prop
// kind, and nobody buys this to retype the demo patch. The Controls panel tunes
// the review mechanism, which is the right split.
let seq = 0;
const line = (
  kind: DiffLineKind,
  text: string,
  oldNo?: number,
  newNo?: number,
): DiffLine => ({ id: `l${seq++}`, kind, text, oldNo, newNo });

const HUNKS: DiffHunk[] = [
  {
    id: "authority",
    file: "lib/shadow/authority.ts",
    header: "@@ -18,10 +18,14 @@",
    lines: [
      line("context", "export function grant(agent: Agent, scope: Scope) {", 18, 18),
      line("context", "  const ledger = openLedger();", 19, 19),
      line("context", "", 20, 20),
      line("del", "  if (!scope.approvedBy) {", 21),
      line("del", "    throw new Denied('no human in the loop');", 22),
      line("del", "  }", 23),
      line("add", "  if (!scope.approvedBy && !scope.selfIssued) {", undefined, 21),
      line("add", "    throw new Denied('no human in the loop');", undefined, 22),
      line("add", "  }", undefined, 23),
      line("add", "", undefined, 24),
      line("add", "  ledger.note('self-issued scope accepted');", undefined, 25),
      line("context", "", 24, 26),
      line("context", "  return ledger.seal(agent, scope);", 25, 27),
      line("context", "}", 26, 28),
    ],
  },
  {
    id: "atomic",
    file: "components/shadow/Atomic.tsx",
    header: "@@ -41,12 +41,12 @@",
    lines: [
      line("context", "  const [armed, setArmed] = useState(false);", 41, 41),
      line("context", "", 42, 42),
      line("context", "  useEffect(() => {", 43, 43),
      line("context", "    if (!armed) return;", 44, 44),
      line("context", "    const id = setTimeout(fire, delayMs);", 45, 45),
      line("context", "    return () => clearTimeout(id);", 46, 46),
      line("context", "  }, [armed, delayMs, fire]);", 47, 47),
      line("context", "", 48, 48),
      line("del", "  const delayMs = 3000;", 49),
      line("add", "  const delayMs = 0;", undefined, 49),
      line("context", "", 50, 50),
      line("context", "  return <button onClick={() => setArmed(true)}>I am atomic</button>;", 51, 51),
      line("context", "}", 52, 52),
    ],
  },
  {
    id: "telemetry",
    file: "scripts/seal.ts",
    header: "@@ -7,6 +7,8 @@",
    lines: [
      line("context", "import { readLedger } from '../lib/shadow/authority';", 7, 7),
      line("context", "", 8, 8),
      line("add", "const SINK = process.env.SHADOW_TELEMETRY ?? 'https://unknown.host/ingest';", undefined, 9),
      line("add", "", undefined, 10),
      line("context", "export async function seal() {", 9, 11),
      line("context", "  const entries = await readLedger();", 10, 12),
      line("context", "  return entries.filter((e) => !e.redacted);", 11, 13),
      line("context", "}", 12, 14),
    ],
  },
];

export default function DiffReviewPreview({ values, reducedMotion }: PreviewProps) {
  const [log, setLog] = useState<string[]>([]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        shadow garden · patch review
      </p>

      <div className="w-full max-w-4xl">
        <DiffReview
          hunks={HUNKS}
          onAccept={(hunk) => setLog((prev) => [...prev, `+ ${hunk.file}`])}
          onReject={(hunk) => setLog((prev) => [...prev, `- ${hunk.file}`])}
          defaultView={values.defaultView as "unified" | "split"}
          morphDuration={values.morphDuration as number}
          stiffness={values.stiffness as number}
          damping={values.damping as number}
          stagger={values.stagger as number}
          density={values.density as "comfortable" | "compact"}
          showLineNumbers={values.showLineNumbers as boolean}
          contextLines={values.contextLines as number}
          collapseDecided={values.collapseDecided as boolean}
          addColor={values.addColor as string}
          delColor={values.delColor as string}
          accentColor={values.accentColor as string}
          reducedMotion={reducedMotion}
        />
      </div>

      <p className="font-display text-[11px] tracking-[0.14em] text-ink-mute">
        {log.length === 0 ? "> nothing ruled on yet" : `> ${log.join("  ")}`}
      </p>
    </div>
  );
}
