'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AutoMaskHorizontal } from './auto-mask-horizontal'

interface MarqueeTextProps {
  text: string
  className?: string
  style?: CSSProperties
  speed?: number
  gap?: number
  /** Seconds to pause at the start of each cycle (after looping back). */
  pause?: number
}

export function MarqueeText({
  text,
  className,
  style,
  speed = 35,
  gap = 40,
  pause = 5,
}: MarqueeTextProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  // Measures the actual rendered track width for duration calc only
  const trackRef = useRef<HTMLDivElement>(null)

  const [isMarquee, setIsMarquee] = useState(false)
  const [travel, setTravel] = useState(0)
  const [animName] = useState(
    () => `__mq_${Math.random().toString(36).slice(2, 7)}`
  )

  useEffect(() => {
    const wrapper = wrapperRef.current
    const probe = probeRef.current
    if (!wrapper || !probe) return

    const measure = () => {
      const lh = parseFloat(getComputedStyle(probe).lineHeight)
      const wraps = probe.scrollHeight > Math.ceil(lh) + 2
      setIsMarquee(wraps)
    }

    const ro = new ResizeObserver(measure)
    ro.observe(wrapper)
    measure()
    return () => ro.disconnect()
  }, [text])

  // Once marquee track is rendered, measure its real width for timing only
  useEffect(() => {
    if (isMarquee && trackRef.current) {
      // Track = 2 copies + 2 gaps. Half = one cycle length.
      const cycleWidth = trackRef.current.scrollWidth / 2
      setTravel(cycleWidth / speed)
    }
  }, [isMarquee, text, gap, speed])

  // Total cycle = travel time + pause held at start. Hold ratio drives keyframe split.
  const total = travel + pause
  const holdPct = total > 0 ? (pause / total) * 100 : 0

  return (
    <div ref={wrapperRef} className="relative min-w-0 flex-1 overflow-hidden">
      {/* Invisible probe — measures natural wrap height */}
      <span
        ref={probeRef}
        aria-hidden="true"
        className={className}
        style={{
          ...style,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          visibility: 'hidden',
          whiteSpace: 'normal',
          pointerEvents: 'none',
        }}
      >
        {text}
      </span>

      {isMarquee ? (
        <AutoMaskHorizontal className="overflow-hidden">
          <style>{`
            @keyframes ${animName} {
              0%, ${holdPct}% { transform: translateX(0); }
              100%            { transform: translateX(-50%); }
            }
          `}</style>

          <div
            ref={trackRef}
            className="flex w-max whitespace-nowrap"
            style={{
              animation:
                total > 0 ? `${animName} ${total}s linear infinite` : undefined,
              willChange: 'transform',
            }}
          >
            <span className={className} style={style}>
              {text}
            </span>
            <span
              aria-hidden="true"
              style={{ display: 'inline-block', width: gap, flexShrink: 0 }}
            />
            <span className={className} style={style} aria-hidden="true">
              {text}
            </span>
            <span
              aria-hidden="true"
              style={{ display: 'inline-block', width: gap, flexShrink: 0 }}
            />
          </div>
        </AutoMaskHorizontal>
      ) : (
        <h3 className={className} style={style}>
          {text}
        </h3>
      )}
    </div>
  )
}
