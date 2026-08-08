"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

/**
 * ShadowCursor — a bounded custom-cursor stage. A crisp dot binds motion values
 * set directly on pointer move; a lagging trail follows via a spring and pools
 * (grows + eases to center) over interactive targets. Containment is the whole
 * point: `cursor: none` and pointer tracking live ONLY on the stage element, so
 * leaving it restores the OS cursor with no window/document listeners.
 */
interface ShadowCursorProps {
  /** Stage content the custom cursor moves over. */
  children?: ReactNode;
  /** Diameter of the crisp lead dot, px. */
  dotSize?: number;
  /** Diameter of the lagging trail ring, px. */
  trailSize?: number;
  /** Trail spring stiffness. */
  stiffness?: number;
  /** Trail spring damping. */
  damping?: number;
  /** Fill color for both cursor layers. */
  cursorColor?: string;
  /** CSS mix-blend-mode for the cursor layers over the stage. */
  blendMode?: "difference" | "screen" | "exclusion" | "normal";
  /** Trail scale multiplier when pooling over an interactive target. */
  poolScale?: number;
  /** Follow instantly (no spring lag) and skip the pooling ease. */
  reducedMotion?: boolean;
  className?: string;
}

export default function ShadowCursor({
  children,
  dotSize = 8,
  trailSize = 36,
  stiffness = 150,
  damping = 15,
  cursorColor = "#a855f7",
  blendMode = "difference",
  poolScale = 2,
  reducedMotion = false,
  className,
}: ShadowCursorProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const dotX = useMotionValue(0);
  const dotY = useMotionValue(0);

  // Trail — spring-smoothed toward whatever we .set(); reduced motion uses
  // .jump() so it snaps without lag while everything else still works.
  const trailX = useSpring(0, { stiffness, damping });
  const trailY = useSpring(0, { stiffness, damping });
  const trailScale = useSpring(1, { stiffness: 260, damping: 26 });

  // Mirror tunables into a ref so pointer handlers always read the latest
  // without rebinding listeners.
  const live = useRef({ poolScale, reducedMotion });
  live.current = { poolScale, reducedMotion };

  const moveTo = (clientX: number, clientY: number, poolCenter?: {
    x: number;
    y: number;
  }) => {
    dotX.set(clientX);
    dotY.set(clientY);
    const tx = poolCenter ? poolCenter.x : clientX;
    const ty = poolCenter ? poolCenter.y : clientY;
    if (live.current.reducedMotion) {
      trailX.jump(tx);
      trailY.jump(ty);
    } else {
      trailX.set(tx);
      trailY.set(ty);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const target = e.target as Element | null;
    const pool =
      target?.closest?.("[data-cursor-pool], button, a") ?? null;

    if (pool) {
      trailScale.set(live.current.poolScale);
      // Ease the trail toward the pooled target's center (full move under
      // reduced motion is still meaningful — it just snaps).
      const pr = pool.getBoundingClientRect();
      const cx = pr.left + pr.width / 2 - rect.left;
      const cy = pr.top + pr.height / 2 - rect.top;
      moveTo(px, py, live.current.reducedMotion ? undefined : { x: cx, y: cy });
    } else {
      trailScale.set(1);
      moveTo(px, py);
    }
  };

  const handlePointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (stage) {
      const rect = stage.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      dotX.set(px);
      dotY.set(py);
      trailX.jump(px);
      trailY.jump(py);
    }
    setVisible(true);
  };

  const handlePointerLeave = () => {
    setVisible(false);
    trailScale.set(1);
  };

  // If reduced motion flips on while the pointer is inside, collapse any
  // outstanding trail lag onto the dot so the still state reads correctly.
  useEffect(() => {
    if (reducedMotion) {
      trailX.jump(dotX.get());
      trailY.jump(dotY.get());
    }
  }, [reducedMotion, trailX, trailY, dotX, dotY]);

  return (
    <div
      ref={stageRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={[
        "relative overflow-hidden cursor-none **:cursor-none",
        className ?? "",
      ].join(" ")}
    >
      {children}

      {/* Trail — spring-lagged ring. The blend + transform live on ONE element
          (centered via negative margins, not a translate) so mix-blend-mode has
          no transformed ancestor isolating it and reads against the stage. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-50 rounded-full transition-opacity duration-200"
        style={{
          x: trailX,
          y: trailY,
          scale: trailScale,
          width: trailSize,
          height: trailSize,
          marginLeft: -trailSize / 2,
          marginTop: -trailSize / 2,
          backgroundColor: cursorColor,
          mixBlendMode: blendMode,
          opacity: visible ? 1 : 0,
        }}
      />

      {/* Dot — crisp, direct-set lead. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-50 rounded-full transition-opacity duration-200"
        style={{
          x: dotX,
          y: dotY,
          width: dotSize,
          height: dotSize,
          marginLeft: -dotSize / 2,
          marginTop: -dotSize / 2,
          backgroundColor: cursorColor,
          mixBlendMode: blendMode,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
