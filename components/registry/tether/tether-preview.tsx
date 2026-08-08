"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Tether, {
  type TetherAlign,
  type TetherOpenOn,
  type TetherSide,
} from "./tether";

export default function TetherPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6">
        <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
          watch the corner it grows from
        </p>

        <Tether
          trigger="Details"
          side={values.side as TetherSide}
          align={values.align as TetherAlign}
          offset={values.offset as number}
          stiffness={values.stiffness as number}
          damping={values.damping as number}
          popScale={values.popScale as number}
          arrow={values.arrow as boolean}
          flip={values.flip as boolean}
          openOn={values.openOn as TetherOpenOn}
          closeDelay={values.closeDelay as number}
          radius={values.radius as number}
          accentColor={values.accentColor as string}
          reducedMotion={reducedMotion}
          panelClassName="w-64 p-4"
        >
          <p className="font-display text-[11px] tracking-[0.16em] text-ink uppercase">
            Delivery window
          </p>
          <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-dim">
            Anything scheduled inside this range ships together. Move the start
            and the rest follow.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-sm border border-hairline px-2.5 py-1 font-display text-[10px] tracking-[0.14em] text-ink-dim uppercase transition-colors hover:text-ink"
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-sm border border-hairline px-2.5 py-1 font-display text-[10px] tracking-[0.14em] text-ink-dim uppercase transition-colors hover:text-ink"
            >
              Apply
            </button>
          </div>
        </Tether>

        {/* The panel carries two real buttons so a keyboard pass has somewhere
            to go: an empty popover cannot show that Tab walks into it and that
            Escape hands focus back. */}
        <p className="font-sans text-[12px] text-ink-mute">
          esc closes · focus returns to the trigger
        </p>
      </div>
    </div>
  );
}
