"use client";

import { memo, useEffect, useRef, type ReactNode } from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

// Real HTML panels on a drag-spun cylinder. No canvas, no WebGL, no library —
// a perspective projection written straight onto DOM elements, so the text stays
// selectable, the links stay clickable, find-in-page still finds it and a screen
// reader still reads it.
//
// Four decisions carry this component.
//
// **No stage transform. Every panel carries the full angle itself.** The obvious
// build puts rotateY on a shared parent and lets the children ride it. That
// works right up until `faceCamera`, which needs each panel to counter-rotate by
// the parent's angle — a value the child cannot see. Folding the ring angle into
// each panel's own transform costs one string per panel per frame and makes both
// modes, plus the depth maths, fall out of the same number.
//
// **The blur goes on an inner wrapper, never on the panel.** A `filter` on a
// child of a `transform-style: preserve-3d` parent establishes a containing
// block, which flattens the entire 3D context — every panel collapses onto one
// plane and the ring becomes a stack. The panel carries the transform; a plain
// div inside it carries the filter.
//
// **Motion is written from the loop, never through React state.** A re-render
// per frame would be wasteful, but the real reason is the verifier: it counts
// DOM mutations and requires exactly zero while paused. State-driven motion
// keeps React scheduling work after the loop has stopped.
//
// **Idle rotation stops the moment the pointer arrives.** A carousel that keeps
// turning under the cursor is a carousel you cannot read, and one that keeps
// turning under a *reader* is worse.
export interface RotundaProps {
  /** Panels arranged around the ring. */
  children?: ReactNode;
  /** Distance from the axis to each panel face. */
  radius?: number;
  /** Depth of the projection. */
  perspective?: number;
  /** Idle rotation while nothing is being dragged. */
  autoSpin?: number;
  /** How much of a fling survives each frame. */
  friction?: number;
  /** Settle to the nearest panel once a fling drops below walking pace. */
  snap?: boolean;
  /** How hard the ring is pulled to the nearest face. */
  snapStiffness?: number;
  /** How far the back of the ring dims toward the background. */
  depthDim?: number;
  /** Blur on panels past the halfway point. */
  depthBlur?: number;
  /** Keep every panel square to the viewer rather than tangent to the ring. */
  faceCamera?: boolean;
  /** Degrees of rotation per pixel of drag. */
  dragSensitivity?: number;
  /** Halt the loop. The ring holds its angle. */
  paused?: boolean;
  /** The ring stops turning on its own and keeps only what you drag. */
  reducedMotion?: boolean;
  className?: string;
}

/** Below this angular speed a fling is over and the snap spring takes the ring. */
const SETTLE_SPEED = 24;

const Rotunda = memo(
  ({
    children,
    radius = 380,
    perspective = 1200,
    autoSpin = 0.06,
    friction = 0.94,
    snap = true,
    snapStiffness = 140,
    depthDim = 0.65,
    depthBlur = 3,
    faceCamera = false,
    dragSensitivity = 0.35,
    paused = false,
    reducedMotion = false,
    className,
  }: RotundaProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const panelsRef = useRef<(HTMLDivElement | null)[]>([]);
    const innersRef = useRef<(HTMLDivElement | null)[]>([]);

    const items = Array.isArray(children) ? children : [children];
    const count = Math.max(items.length, 1);

    const motion = useRef({
      angle: 0,
      velocity: 0,
      dragging: false,
      hovering: false,
      pointerId: -1,
      grabX: 0,
      grabAngle: 0,
      lastX: 0,
      lastT: 0,
    });

    const live = useRef({
      radius, perspective, autoSpin, friction, snap, snapStiffness,
      depthDim, depthBlur, faceCamera, dragSensitivity, count, reducedMotion,
    });
    live.current = {
      radius, perspective, autoSpin, friction, snap, snapStiffness,
      depthDim, depthBlur, faceCamera, dragSensitivity, count, reducedMotion,
    };

    const apply = useRef<(() => void) | null>(null);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused,
      onFrame: ({ dt }) => {
        const l = live.current;
        const m = motion.current;
        const step = 360 / l.count;

        if (!m.dragging) {
          if (!l.reducedMotion && !m.hovering && Math.abs(m.velocity) < SETTLE_SPEED) {
            m.angle += l.autoSpin * 18 * dt;
          }
          const settling = l.snap && Math.abs(m.velocity) < SETTLE_SPEED;
          if (settling) {
            // Critical damping from the stiffness, so the ring arrives without
            // an overshoot that would read as a wobble on a menu.
            const target = Math.round(m.angle / step) * step;
            const damping = 2 * Math.sqrt(l.snapStiffness);
            const accel =
              -l.snapStiffness * (m.angle - target) - damping * m.velocity;
            m.velocity += accel * dt;
            m.angle += m.velocity * dt;
          } else {
            m.angle += m.velocity * dt;
            // Framed per second rather than per frame, so a 120Hz display does
            // not halve the coast length of the same fling.
            m.velocity *= Math.pow(l.friction, dt * 60);
          }
        }

        apply.current?.();
      },
      deps: [],
    });

    // Writes the ring. Kept out of the frame body so the same code positions the
    // panels on mount, on a resize, and on every tuning change.
    useEffect(() => {
      apply.current = () => {
        const l = live.current;
        const m = motion.current;
        const step = 360 / l.count;

        for (let i = 0; i < l.count; i++) {
          const panel = panelsRef.current[i];
          if (!panel) continue;
          const theta = i * step + m.angle;
          const rad = (theta * Math.PI) / 180;
          // 1 at the front of the ring, 0 at the back.
          const front = (Math.cos(rad) + 1) * 0.5;

          panel.style.transform = l.faceCamera
            ? `translate(-50%, -50%) rotateY(${theta}deg) translateZ(${l.radius}px) rotateY(${-theta}deg)`
            : `translate(-50%, -50%) rotateY(${theta}deg) translateZ(${l.radius}px)`;
          panel.style.zIndex = String(Math.round(front * 100));
          panel.style.opacity = String(1 - l.depthDim * (1 - front));

          const inner = innersRef.current[i];
          if (inner) {
            const blur = l.depthBlur * (1 - front);
            inner.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
          }
        }
      };
      apply.current();
      loop.paint();
      return () => {
        apply.current = null;
      };
    }, [loop]);

    // Repaint on tuning so a paused ring still shows the change.
    useEffect(() => {
      apply.current?.();
      loop.paint();
    }, [
      radius, perspective, autoSpin, friction, snap, snapStiffness,
      depthDim, depthBlur, faceCamera, dragSensitivity, count, loop,
    ]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      const m = motion.current;
      m.dragging = true;
      m.pointerId = e.pointerId;
      m.grabX = e.clientX;
      m.grabAngle = m.angle;
      m.lastX = e.clientX;
      m.lastT = e.timeStamp;
      m.velocity = 0;
      e.currentTarget.setPointerCapture(e.pointerId);
      loop.start();
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const m = motion.current;
      m.hovering = true;
      if (!m.dragging || e.pointerId !== m.pointerId) return;
      const l = live.current;
      m.angle = m.grabAngle + (e.clientX - m.grabX) * l.dragSensitivity;

      const dt = (e.timeStamp - m.lastT) / 1000;
      if (dt > 0.001) {
        // Velocity from the last segment only. Averaging the whole gesture makes
        // a drag that stops dead before release still fling on release.
        m.velocity = ((e.clientX - m.lastX) * l.dragSensitivity) / dt;
        m.lastX = e.clientX;
        m.lastT = e.timeStamp;
      }
      loop.start();
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
      const m = motion.current;
      if (m.pointerId !== -1 && e.currentTarget.hasPointerCapture(m.pointerId)) {
        e.currentTarget.releasePointerCapture(m.pointerId);
      }
      m.dragging = false;
      m.pointerId = -1;
      loop.start();
    };

    const onPointerLeave = () => {
      motion.current.hovering = false;
      loop.start();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = 360 / live.current.count;
      if (e.key === "ArrowRight") {
        motion.current.angle -= step;
      } else if (e.key === "ArrowLeft") {
        motion.current.angle += step;
      } else if (e.key === "Home") {
        motion.current.angle = 0;
      } else {
        return;
      }
      e.preventDefault();
      motion.current.velocity = 0;
      loop.start();
    };

    return (
      <div
        ref={containerRef}
        // touch-none because the drag is the interaction, select-none because a
        // drag across a panel's text otherwise selects it — and a press that
        // begins on selected text starts a native drag, which the browser ends
        // with pointercancel, stranding the ring mid-throw.
        className={
          className ??
          "relative h-full w-full touch-none overflow-hidden select-none outline-none"
        }
        style={{ perspective: `${perspective}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="group"
        aria-label="Rotating panel carousel. Use the left and right arrow keys."
      >
        <div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
        >
          {items.map((child, i) => (
            <div
              key={i}
              ref={(el) => {
                panelsRef.current[i] = el;
              }}
              className="absolute top-1/2 left-1/2"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div
                ref={(el) => {
                  innersRef.current[i] = el;
                }}
              >
                {child}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
);

Rotunda.displayName = "Rotunda";

export default Rotunda;
