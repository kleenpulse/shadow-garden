'use client'

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { gsap } from 'gsap'

import { cn } from '@/lib/utils'

interface PixelTransitionProps {
  firstContent: ReactNode
  secondContent: ReactNode
  gridSize?: number
  pixelColor?: string
  animationStepDuration?: number
  once?: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

export function PixelTransition({
  firstContent,
  secondContent,
  gridSize = 7,
  pixelColor = '#a855f7',
  animationStepDuration = 0.3,
  once = false,
  disabled = false,
  className,
  style,
}: PixelTransitionProps) {
  const pixelGridRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLDivElement | null>(null)
  const delayedCallRef = useRef<gsap.core.Tween | null>(null)

  const [isActive, setIsActive] = useState(false)
  // Computed in an effect so the pre-render never touches `window`/`navigator`.
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    setIsTouchDevice(
      'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches
    )
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(reduceQuery.matches)
    const onChange = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches)
    reduceQuery.addEventListener('change', onChange)
    return () => reduceQuery.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const pixelGridEl = pixelGridRef.current
    if (!pixelGridEl) return

    pixelGridEl.innerHTML = ''

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const pixel = document.createElement('div')
        pixel.classList.add('pixelated-image-card__pixel')
        pixel.classList.add('absolute', 'hidden')
        pixel.style.backgroundColor = pixelColor

        const size = 100 / gridSize
        pixel.style.width = `${size}%`
        pixel.style.height = `${size}%`
        pixel.style.left = `${col * size}%`
        pixel.style.top = `${row * size}%`

        pixelGridEl.appendChild(pixel)
      }
    }
  }, [gridSize, pixelColor])

  const animatePixels = (activate: boolean): void => {
    setIsActive(activate)

    const pixelGridEl = pixelGridRef.current
    const activeEl = activeRef.current
    if (!pixelGridEl || !activeEl) return

    if (prefersReducedMotion) {
      activeEl.style.display = activate ? 'block' : 'none'
      activeEl.style.pointerEvents = activate ? 'none' : ''
      return
    }

    const pixels = pixelGridEl.querySelectorAll<HTMLDivElement>(
      '.pixelated-image-card__pixel'
    )
    if (!pixels.length) return

    gsap.killTweensOf(pixels)
    if (delayedCallRef.current) {
      delayedCallRef.current.kill()
    }

    gsap.set(pixels, { display: 'none' })

    const totalPixels = pixels.length
    const staggerDuration = animationStepDuration / totalPixels

    gsap.to(pixels, {
      display: 'block',
      duration: 0,
      stagger: {
        each: staggerDuration,
        from: 'random',
      },
    })

    delayedCallRef.current = gsap.delayedCall(animationStepDuration, () => {
      activeEl.style.display = activate ? 'block' : 'none'
      activeEl.style.pointerEvents = activate ? 'none' : ''
    })

    gsap.to(pixels, {
      display: 'none',
      duration: 0,
      delay: animationStepDuration,
      stagger: {
        each: staggerDuration,
        from: 'random',
      },
    })
  }

  // On mobile/touch there's no hover, so the pixel toggle is driven by click —
  // which also opens the ImageModal and can leave the overlay stuck visible
  // after the modal closes. When disabled, render only the bare firstContent.
  if (disabled) {
    return (
      <div
        className={cn('relative size-full overflow-hidden', className)}
        style={style}
      >
        {firstContent}
      </div>
    )
  }

  const handleEnter = (): void => {
    if (!isActive) animatePixels(true)
  }
  const handleLeave = (): void => {
    if (isActive && !once) animatePixels(false)
  }
  const handleClick = (): void => {
    if (!isActive) animatePixels(true)
    else if (isActive && !once) animatePixels(false)
  }

  return (
    <div
      className={cn('relative size-full overflow-hidden', className)}
      style={style}
      onMouseEnter={!isTouchDevice ? handleEnter : undefined}
      onMouseLeave={!isTouchDevice ? handleLeave : undefined}
      onClick={isTouchDevice ? handleClick : undefined}
      onFocus={!isTouchDevice ? handleEnter : undefined}
      onBlur={!isTouchDevice ? handleLeave : undefined}
    >
      <div className="absolute inset-0 size-full" aria-hidden={isActive}>
        {firstContent}
      </div>

      <div
        ref={activeRef}
        className="absolute inset-0 z-2 size-full"
        style={{ display: 'none' }}
        aria-hidden={!isActive}
      >
        {secondContent}
      </div>

      <div
        ref={pixelGridRef}
        className="pointer-events-none absolute inset-0 z-3 size-full"
      />
    </div>
  )
}

export default PixelTransition
