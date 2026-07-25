'use client'

import { MotionConfig, motion as m } from 'motion/react'

// Three-bar hamburger that morphs into an X. Presentational only — the `open`
// prop drives it, the surrounding trigger owns the click. Bars use `bg-current`
// so they inherit the parent's text color.
//
// CLOSED_INSET is the one knob for closed-state spacing: the top/bottom bars'
// distance from each edge of the 24px box. It feeds both the resting `style`
// and the matching `closed` keyframe end-value, so the two stay in sync.
const CLOSED_INSET = '30%'

const HAMBURGER_VARIANTS = {
  top: {
    open: {
      rotate: ['0deg', '0deg', '45deg'],
      top: [CLOSED_INSET, '50%', '50%'],
    },
    closed: {
      rotate: ['45deg', '0deg', '0deg'],
      top: ['50%', '50%', CLOSED_INSET],
    },
  },
  middle: {
    open: { rotate: ['0deg', '0deg', '-45deg'] },
    closed: { rotate: ['-45deg', '0deg', '0deg'] },
  },
  bottom: {
    open: {
      rotate: ['0deg', '0deg', '45deg'],
      bottom: [CLOSED_INSET, '50%', '50%'],
      left: '50%',
    },
    closed: {
      rotate: ['45deg', '0deg', '0deg'],
      bottom: ['50%', '50%', CLOSED_INSET],
      left: '50%',
    },
  },
}

export function AnimatedHamburger({ open }: { open: boolean }) {
  return (
    <MotionConfig transition={{ duration: 0.4, ease: 'easeInOut' }}>
      <m.span
        initial={false}
        animate={open ? 'open' : 'closed'}
        className="relative block size-6"
        aria-hidden
      >
        <m.span
          variants={HAMBURGER_VARIANTS.top}
          className="absolute h-0.5 w-4 rounded-full bg-current"
          style={{ y: '-50%', left: '50%', x: '-50%', top: CLOSED_INSET }}
        />
        <m.span
          variants={HAMBURGER_VARIANTS.middle}
          className="absolute h-0.5 w-4 rounded-full bg-current"
          style={{ left: '50%', x: '-50%', top: '50%', y: '-50%' }}
        />
        <m.span
          variants={HAMBURGER_VARIANTS.bottom}
          className="absolute h-0.5 w-4 rounded-full bg-current"
          style={{
            x: '-50%',
            y: '50%',
            bottom: CLOSED_INSET,
            left: '50%',
          }}
        />
      </m.span>
    </MotionConfig>
  )
}
