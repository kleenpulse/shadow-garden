"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// Scroll-in reveal for landing sections. Server-rendered children pass through.
// The initial style never branches on the motion preference — SSR can't know it,
// so branching there causes hydration mismatches. Reduced motion instead lands
// the same animation instantly (duration 0).
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={reduce ? { duration: 0 } : { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
