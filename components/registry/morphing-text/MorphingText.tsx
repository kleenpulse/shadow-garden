'use client'

import React, { useCallback, useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

const morphTime = 1.5
const cooldownTime = 0.5

const useMorphingText = (texts: string[], auto: boolean = true) => {
  const textIndexRef = useRef(0)
  const morphRef = useRef(0)
  const cooldownRef = useRef(0)
  const timeRef = useRef(new Date())

  const text1Ref = useRef<HTMLSpanElement>(null)
  const text2Ref = useRef<HTMLSpanElement>(null)

  const setStyles = useCallback(
    (fraction: number) => {
      const [current1, current2] = [text1Ref.current, text2Ref.current]
      if (!current1 || !current2) return

      current2.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`
      current2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`

      const invertedFraction = 1 - fraction
      current1.style.filter = `blur(${Math.min(
        8 / invertedFraction - 8,
        100
      )}px)`
      current1.style.opacity = `${Math.pow(invertedFraction, 0.4) * 100}%`

      current1.textContent = texts[textIndexRef.current % texts.length]
      current2.textContent = texts[(textIndexRef.current + 1) % texts.length]
    },
    [texts]
  )

  const doMorph = useCallback(() => {
    morphRef.current -= cooldownRef.current
    cooldownRef.current = 0

    let fraction = morphRef.current / morphTime

    if (fraction > 1) {
      cooldownRef.current = cooldownTime
      fraction = 1
    }

    setStyles(fraction)

    if (fraction === 1) {
      textIndexRef.current++
    }
  }, [setStyles])

  const doCooldown = useCallback(() => {
    morphRef.current = 0
    const [current1, current2] = [text1Ref.current, text2Ref.current]
    if (current1 && current2) {
      current2.style.filter = 'none'
      current2.style.opacity = '100%'
      current1.style.filter = 'none'
      current1.style.opacity = '0%'
    }
  }, [])

  useEffect(() => {
    // One-shot mode (auto=false): only meaningful with a [from, to] pair. With a
    // single label there's nothing to morph — paint it and bail (no rAF loop).
    if (!auto && texts.length < 2) {
      const [a, b] = [text1Ref.current, text2Ref.current]
      if (a) {
        a.textContent = texts[0] ?? ''
        a.style.filter = 'none'
        a.style.opacity = '100%'
      }
      if (b) {
        b.textContent = ''
        b.style.opacity = '0%'
      }
      return
    }

    let animationFrameId: number
    // Reset state so the morph always starts from texts[0] (covers remount-by-key).
    textIndexRef.current = 0
    morphRef.current = 0
    cooldownRef.current = 0
    timeRef.current = new Date()

    const animate = () => {
      if (!auto && textIndexRef.current >= 1) {
        doCooldown()
        return
      }
      animationFrameId = requestAnimationFrame(animate)

      const newTime = new Date()
      const dt = (newTime.getTime() - timeRef.current.getTime()) / 1000
      timeRef.current = newTime

      cooldownRef.current -= dt

      if (cooldownRef.current <= 0) doMorph()
      else doCooldown()
    }

    animate()
    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [doMorph, doCooldown, auto, texts])

  return { text1Ref, text2Ref }
}

interface MorphingTextProps {
  className?: string
  texts: string[]
  /**
   * `true` (default): cycle through `texts` forever (original behaviour).
   * `false`: morph once from `texts[0]` → `texts[1]` then settle. Remount the
   * component (e.g. `key={current}`) to trigger a fresh morph on change.
   */
  auto?: boolean
}

const Texts: React.FC<Pick<MorphingTextProps, 'texts' | 'auto'>> = ({
  texts,
  auto,
}) => {
  const { text1Ref, text2Ref } = useMorphingText(texts, auto)
  return (
    <>
      <span
        className="absolute inset-x-0 top-1/2 m-auto inline-block w-full -translate-y-1/2"
        ref={text1Ref}
      />
      <span
        className="absolute inset-x-0 top-1/2 m-auto inline-block w-full -translate-y-1/2"
        ref={text2Ref}
      />
    </>
  )
}

const SvgFilters: React.FC = () => (
  <svg
    id="filters"
    className="fixed h-0 w-0"
    preserveAspectRatio="xMidYMid slice"
  >
    <defs>
      <filter id="threshold">
        <feColorMatrix
          in="SourceGraphic"
          type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 255 -140"
        />
      </filter>
    </defs>
  </svg>
)

export const MorphingText: React.FC<MorphingTextProps> = ({
  texts,
  className,
  auto = true,
}) => (
  <div
    className={cn(
      'relative mx-auto h-16 w-full max-w-3xl text-center font-sans text-[40pt] leading-none font-bold filter-[url(#threshold)_blur(0.6px)] md:h-24 lg:text-[6rem]',
      className
    )}
  >
    <Texts texts={texts} auto={auto} />
    <SvgFilters />
  </div>
)
