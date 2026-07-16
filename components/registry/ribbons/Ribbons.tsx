'use client'

import React, { useEffect, useRef } from 'react'

interface RibbonsOptions {
  colorSaturation: string
  colorBrightness: string
  colorAlpha: number
  colorCycleSpeed: number
  verticalPosition: 'top' | 'middle' | 'bottom' | 'random'
  horizontalSpeed: number
  ribbonCount: number
  strokeSize: number
  parallaxAmount: number
  animateSections: boolean
  color?: string
}

interface Point {
  x: number
  y: number
}

interface RibbonSection {
  point1: Point
  point2: Point
  point3: Point
  color: number | string
  delay: number
  dir: 'left' | 'right'
  alpha: number
  phase: number
}

const Ribbons: React.FC<RibbonsOptions> = (options) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    let scroll = 0
    let rafId = 0
    const ribbons: RibbonSection[][] = []

    const random = (min: number, max: number): number => {
      return Math.random() * (max - min) + min
    }

    const screenInfo = (): {
      width: number
      height: number
      scrolly: number
    } => {
      const w = window
      const d = document.documentElement
      const b = document.body
      return {
        width: w.innerWidth || d.clientWidth || b.clientWidth,
        height: w.innerHeight || d.clientHeight || b.clientHeight,
        scrolly: w.scrollY || d.scrollTop || b.scrollTop,
      }
    }

    const createPoint = (x: number, y: number): Point => ({ x, y })

    const addRibbon = () => {
      const dir = Math.round(random(1, 9)) > 5 ? 'right' : 'left'
      const stop = 1000
      const hide = 200
      const min = 0 - hide
      const max = width + hide
      const startx = dir === 'right' ? min : max
      let starty = Math.round(random(0, height))

      if (/^(top|min)$/i.test(options.verticalPosition)) {
        starty = 0 + hide
      } else if (/^(middle|center)$/i.test(options.verticalPosition)) {
        starty = height / 2
      } else if (/^(bottom|max)$/i.test(options.verticalPosition)) {
        starty = height - hide
      }

      const ribbon: RibbonSection[] = []
      let point1 = createPoint(startx, starty)
      let point2 = createPoint(startx, starty)

      const color = options.color || Math.round(random(35, 40))
      let delay = 0

      for (let i = 0; i < stop; i++) {
        const movex = Math.round(random(-0.2, 0.8) * options.horizontalSpeed)
        const movey = Math.round(random(-0.5, 0.5) * (height * 0.25))

        const point3 = createPoint(
          point2.x + (dir === 'right' ? movex : -movex),
          point2.y + movey
        )

        if (
          (dir === 'right' && point2.x >= max) ||
          (dir === 'left' && point2.x <= min)
        ) {
          break
        }

        ribbon.push({
          point1: createPoint(point1.x, point1.y),
          point2: createPoint(point2.x, point2.y),
          point3,
          color,
          delay,
          dir,
          alpha: 0,
          phase: 0,
        })

        point1 = createPoint(point2.x, point2.y)
        point2 = createPoint(point3.x, point3.y)

        delay += 4
      }

      ribbons.push(ribbon)
    }

    const drawRibbonSection = (section: RibbonSection): boolean => {
      if (section.phase >= 1 && section.alpha <= 0) {
        return true
      }

      if (section.delay <= 0) {
        section.phase += 0.02
        section.alpha = Math.sin(section.phase) * 1
        section.alpha = Math.max(0, Math.min(section.alpha, 1))

        if (options.animateSections) {
          const mod = Math.sin(1 + (section.phase * Math.PI) / 2) * 0.1

          if (section.dir === 'right') {
            section.point1.x += mod
            section.point2.x += mod
            section.point3.x += mod
          } else {
            section.point1.x -= mod
            section.point2.x -= mod
            section.point3.x -= mod
          }

          section.point1.y += mod
          section.point2.y += mod
          section.point3.y += mod
        }
      } else {
        section.delay -= 0.5
      }

      let c: string
      if (typeof section.color === 'string') {
        c = `${section.color}${Math.round(section.alpha * 255)
          .toString(16)
          .padStart(2, '0')}`
      } else {
        c = `hsla(${section.color}, ${options.colorSaturation}, ${options.colorBrightness}, ${section.alpha})`
      }

      context.save()

      if (options.parallaxAmount !== 0) {
        context.translate(0, scroll * options.parallaxAmount)
      }

      context.beginPath()
      context.moveTo(section.point1.x, section.point1.y)
      context.lineTo(section.point2.x, section.point2.y)
      context.lineTo(section.point3.x, section.point3.y)
      context.fillStyle = c
      context.fill()

      if (options.strokeSize > 0) {
        context.lineWidth = options.strokeSize
        context.strokeStyle = c
        context.lineCap = 'round'
        context.stroke()
      }

      context.restore()

      return false
    }

    const onDraw = () => {
      for (let i = 0; i < ribbons.length; i++) {
        if (!ribbons[i]) {
          ribbons.splice(i, 1)
          i--
        }
      }

      context.clearRect(0, 0, width, height)

      for (let i = 0; i < ribbons.length; i++) {
        const ribbon = ribbons[i]
        if (ribbon) {
          for (let j = 0; j < ribbon.length; j++) {
            if (drawRibbonSection(ribbon[j])) {
              ribbon.splice(j, 1)
              j--
            }
          }

          if (ribbon.length === 0) {
            // @ts-expect-error next line
            ribbons[i] = null
          }
        }
      }

      if (ribbons.filter(Boolean).length < options.ribbonCount) {
        addRibbon()
      }

      rafId = requestAnimationFrame(onDraw)
    }

    // Bound to the parent stage rather than the whole window.
    const onResize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width || canvas.clientWidth
      height = rect.height || canvas.clientHeight
      canvas.width = width
      canvas.height = height
      context.globalAlpha = options.colorAlpha
    }

    const onScroll = () => {
      scroll = screenInfo().scrolly
    }

    onResize()
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(canvas)
    window.addEventListener('scroll', onScroll)

    onDraw()

    return () => {
      cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [options])

  return (
    <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
  )
}

export default Ribbons
