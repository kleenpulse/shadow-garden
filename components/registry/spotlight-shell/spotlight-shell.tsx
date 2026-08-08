'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from 'motion/react'
import { cn } from '@/lib/utils'
const cardShellStatic =
  'relative isolate overflow-hidden rounded-md border border-hairline bg-panel transition-colors'

/**
 * Spotlight card surface: 3D magnetic tilt, radial aurora tint, hover glow,
 * diagonal shimmer sweep and a growing bottom accent line. Wrap any card
 * content; the decorative layers sit BEHIND it (`z-10`) so opaque media stays
 * clean and the effects bloom through the text instead.
 *
 * `accentColor` is a hex string the gradients reuse at low alpha. Tilt and
 * shimmer are disabled under `prefers-reduced-motion`.
 */
const TILT_MAX = 0.5
const TILT_SPRING = { stiffness: 300, damping: 28 } as const
const GLOW_SPRING = { stiffness: 180, damping: 22 } as const

export function SpotlightShell({
  accentColor,
  children,
  className,
}: {
  accentColor: string
  children: ReactNode
  className?: string
}) {
  // Resolve the motion preference only after hydration: SSR can't know it, so
  // branching markup on it directly would mismatch the server HTML.
  const prefersReducedMotion = useReducedMotion()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const reduce = hydrated ? prefersReducedMotion : false
  const ref = useRef<HTMLDivElement>(null)

  const normX = useMotionValue(0.5)
  const normY = useMotionValue(0.5)
  const rawRotateX = useTransform(normY, [0, 1], [TILT_MAX, -TILT_MAX])
  const rawRotateY = useTransform(normX, [0, 1], [-TILT_MAX, TILT_MAX])
  const rotateX = useSpring(rawRotateX, TILT_SPRING)
  const rotateY = useSpring(rawRotateY, TILT_SPRING)
  const glowOpacity = useSpring(0, GLOW_SPRING)

  // Pointer, not mouse: a touch drag emits no `mousemove`, so a mouse-only
  // binding leaves the tilt inert on a phone.
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    normX.set((e.clientX - rect.left) / rect.width)
    normY.set((e.clientY - rect.top) / rect.height)
  }

  const handlePointerEnter = () => glowOpacity.set(1)
  const handlePointerLeave = () => {
    normX.set(0.5)
    normY.set(0.5)
    glowOpacity.set(0)
  }

  return (
    <motion.div
      ref={ref}
      // touch-none: a finger drag tilts the card instead of scrolling the page.
      className={cn('group/card touch-none', cardShellStatic, className)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      onPointerMove={handlePointerMove}
      style={
        reduce ? undefined : { rotateX, rotateY, transformPerspective: 900 }
      }
    >
      {/* Hover glow — platform bloom from the bottom; nothing tints the card at
          rest, so every card looks the same until hovered. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 [--glow-alpha:5%] dark:[--glow-alpha:18%]"
        style={{
          opacity: glowOpacity,
          background: `radial-gradient(ellipse at 25% 100%, color-mix(in srgb, ${accentColor} var(--glow-alpha), transparent), transparent 60%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10">{children}</div>

      {/* Diagonal shimmer sweep on hover — above the content (z-20) so the glint
          sweeps across the media too, not just the text/footer. */}
      {!reduce && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[55%] -translate-x-full -skew-x-12 bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover/card:translate-x-[280%] dark:via-white/10"
        />
      )}

      {/* Growing bottom accent line. */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 z-20 h-0.5 w-0 rounded-full transition-all duration-500 group-hover/card:w-full"
        style={{
          background: `linear-gradient(to right, ${accentColor}80, transparent)`,
        }}
      />
    </motion.div>
  )
}
