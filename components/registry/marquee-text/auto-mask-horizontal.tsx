'use client'

import type React from 'react'

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

export interface AutoMaskHorizontalProps extends React.ComponentPropsWithoutRef<'div'> {
  leftThreshold?: number
  rightThreshold?: number
  fadeSizePercent?: number
  transitionDurationMs?: number
}

export const AutoMaskHorizontal = forwardRef<
  HTMLDivElement,
  AutoMaskHorizontalProps
>(
  (
    {
      children,
      className,
      style,
      leftThreshold = 14,
      rightThreshold = 14,
      fadeSizePercent = 10,
      transitionDurationMs = 300,
      onScroll,
      ...rest
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const frameRef = useRef<number | null>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)
    // Auto-hiding scrollbar: true while actively scrolling, reset to false ~1s idle.
    const [scrolling, setScrolling] = useState(false)
    const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node
        if (!ref) return
        if (typeof ref === 'function') {
          ref(node)
        } else {
          ref.current = node
        }
      },
      [ref]
    )

    const updateScrollState = useCallback(() => {
      const element = containerRef.current
      if (!element) return
      const { scrollLeft, scrollWidth, clientWidth } = element
      const normalizedScrollLeft = Math.max(0, scrollLeft)
      const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
      const resolvedLeftThreshold = Math.max(0, leftThreshold)
      const resolvedRightThreshold = Math.max(0, rightThreshold)
      setCanScrollLeft(normalizedScrollLeft > resolvedLeftThreshold)
      setCanScrollRight(
        maxScrollLeft - normalizedScrollLeft > resolvedRightThreshold
      )
    }, [leftThreshold, rightThreshold])

    useEffect(() => {
      updateScrollState()
    }, [updateScrollState, children])

    useEffect(() => {
      const element = containerRef.current
      if (!element) return

      const handleScroll = (event: Event) => {
        // The DOM `scroll` event uses the plain `Event` interface (not
        // `UIEvent`), so never gate the forward on `instanceof UIEvent` — that
        // silently drops every scroll and the parent's onScroll never fires.
        onScroll?.(event as unknown as React.UIEvent<HTMLDivElement>)
        // Reveal the scrollbar while scrolling; hide it after a short idle.
        setScrolling(true)
        if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current)
        scrollHideTimer.current = setTimeout(() => setScrolling(false), 1000)
        if (frameRef.current !== null) return
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null
          updateScrollState()
        })
      }

      const handleResize = () => {
        updateScrollState()
      }

      element.addEventListener('scroll', handleScroll, { passive: true })
      window.addEventListener('resize', handleResize)

      return () => {
        element.removeEventListener('scroll', handleScroll)
        window.removeEventListener('resize', handleResize)
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current)
          frameRef.current = null
        }
        if (scrollHideTimer.current) {
          clearTimeout(scrollHideTimer.current)
          scrollHideTimer.current = null
        }
      }
    }, [onScroll, updateScrollState])

    const maskImage = useMemo(() => {
      const resolvedFade = Math.min(49, Math.max(0, fadeSizePercent))
      const leftStop = `${resolvedFade}%`
      const rightStop = `${100 - resolvedFade}%`

      if (canScrollLeft && canScrollRight) {
        return `linear-gradient(to right, transparent 0%, black ${leftStop}, black ${rightStop}, transparent 100%)`
      }
      if (canScrollLeft) {
        return `linear-gradient(to right, transparent 0%, black ${leftStop}, black 100%)`
      }
      if (canScrollRight) {
        return `linear-gradient(to right, black 0%, black ${rightStop}, transparent 100%)`
      }
      return 'none'
    }, [canScrollLeft, canScrollRight, fadeSizePercent])

    const mergedStyle = useMemo<React.CSSProperties>(
      () => ({
        ...style,
        maskImage,
        WebkitMaskImage: maskImage,
        transition:
          transitionDurationMs <= 0
            ? style?.transition
            : `mask-image ${transitionDurationMs}ms ease, -webkit-mask-image ${transitionDurationMs}ms ease`,
      }),
      [maskImage, style, transitionDurationMs]
    )

    return (
      <div
        {...rest}
        ref={setRefs}
        className={cn(
          'min-w-0 overflow-x-auto transition-[mask-image] duration-300',
          // Auto-hiding scrollbar: invisible by default, revealed on hover or
          // while actively scrolling (md+ only), never rendered below md.
          'scrollbar-thin max-md:scrollbar-none [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:transition-colors',
          '[scrollbar-color:transparent_transparent] [&::-webkit-scrollbar-thumb]:bg-transparent',
          'md:hover:[scrollbar-color:rgba(0,0,0,0.25)_transparent] dark:md:hover:[scrollbar-color:rgba(255,255,255,0.25)_transparent] md:hover:[&::-webkit-scrollbar-thumb]:bg-black/25 dark:md:hover:[&::-webkit-scrollbar-thumb]:bg-white/25',
          scrolling &&
            'md:[scrollbar-color:rgba(0,0,0,0.25)_transparent] dark:md:[scrollbar-color:rgba(255,255,255,0.25)_transparent] md:[&::-webkit-scrollbar-thumb]:bg-black/25 dark:md:[&::-webkit-scrollbar-thumb]:bg-white/25',
          className
        )}
        style={mergedStyle}
      >
        {children}
      </div>
    )
  }
)

AutoMaskHorizontal.displayName = 'AutoMaskHorizontal'

export default AutoMaskHorizontal
