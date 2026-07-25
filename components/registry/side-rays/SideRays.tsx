"use client";

import { useRef, useEffect, useState } from 'react'
import { Renderer, Program, Triangle, Mesh } from 'ogl'
import { useAnimationLoop } from '@/hooks/use-animation-loop'

type Origin = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

interface SideRaysProps {
  speed?: number
  rayColor1?: string
  rayColor2?: string
  intensity?: number
  spread?: number
  origin?: Origin
  tilt?: number
  saturation?: number
  blend?: number
  falloff?: number
  opacity?: number
  paused?: boolean
  className?: string
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m
    ? [
        parseInt(m[1], 16) / 255,
        parseInt(m[2], 16) / 255,
        parseInt(m[3], 16) / 255,
      ]
    : [1, 1, 1]
}

const originToFlip = (origin: Origin): [number, number] => {
  switch (origin) {
    case 'top-left':
      return [1, 0]
    case 'bottom-right':
      return [0, 1]
    case 'bottom-left':
      return [1, 1]
    default:
      return [0, 0]
  }
}

const SideRays = ({
  speed = 1,
  rayColor1 = '#a855f7',
  rayColor2 = '#22d3ee',
  intensity = 2,
  spread = 1,
  origin = 'top-right',
  tilt = 0,
  saturation = 1,
  blend = 0.5,
  falloff = 1,
  opacity = 0.9,
  paused = false,
  className = '',
}: SideRaysProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const uniformsRef = useRef<Record<
    string,
    { value: number | number[] }
  > | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const meshRef = useRef<Mesh | null>(null)
  const cleanupFunctionRef = useRef<(() => void) | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // The runtime host owns the rAF loop, the ResizeObserver, dpr and teardown.
  // Everything below it is the animation body: the shader and its uniforms.
  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused,
    dpr: 2,
    onResize: ({ width, height, dpr, bufferWidth, bufferHeight }) => {
      const renderer = rendererRef.current
      const uniforms = uniformsRef.current
      if (!renderer || !uniforms) return
      renderer.dpr = dpr
      renderer.setSize(width, height)
      uniforms.iResolution.value = [bufferWidth, bufferHeight]
    },
    onFrame: ({ now }) => {
      const renderer = rendererRef.current
      const mesh = meshRef.current
      const uniforms = uniformsRef.current
      // Not initialised yet, or the context went away — halt rather than spin.
      if (!renderer || !mesh || !uniforms) return false
      uniforms.iTime.value = now * 0.001
      try {
        renderer.render({ scene: mesh })
      } catch {
        return false
      }
    },
    gl: () => rendererRef.current?.gl,
  })

  useEffect(() => {
    if (!containerRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setIsVisible(entry.isIntersecting)
      },
      { threshold: 0.1 }
    )

    observerRef.current.observe(containerRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!isVisible || !containerRef.current) return

    if (cleanupFunctionRef.current) {
      cleanupFunctionRef.current()
      cleanupFunctionRef.current = null
    }

    const initializeWebGL = async () => {
      if (!containerRef.current) return

      await new Promise<void>((resolve) => setTimeout(resolve, 10))

      if (!containerRef.current) return

      const renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio, 2),
        alpha: true,
        // Premultiplied alpha (paired with the premultiplied gl_FragColor below).
        // Safari's compositor mishandles a premultipliedAlpha:false canvas — it
        // paints the raw RGB and ignores the alpha gate, so these HDR-bright rays
        // blew out to near-white. Premultiplied output composites identically on
        // Chrome (rgb*a + bg*(1-a)) and correctly on Safari.
        premultipliedAlpha: true,
      })
      rendererRef.current = renderer

      const gl = renderer.gl
      gl.canvas.style.width = '100%'
      gl.canvas.style.height = '100%'

      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild)
      }
      containerRef.current.appendChild(gl.canvas)

      const vert = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`

      const frag = `precision highp float;

uniform float iTime;
uniform vec2 iResolution;
uniform float iSpeed;
uniform vec3 iRayColor1;
uniform vec3 iRayColor2;
uniform float iIntensity;
uniform float iSpread;
uniform float iFlipX;
uniform float iFlipY;
uniform float iTilt;
uniform float iSaturation;
uniform float iBlend;
uniform float iFalloff;
uniform float iOpacity;

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  float cosAngle = dot(normalize(sourceToCoord), rayRefDirection);
  return clamp(
    (0.45 + 0.15 * sin(cosAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-cosAngle * seedB + iTime * speed)),
    0.0, 1.0) *
    clamp((iResolution.x - length(sourceToCoord)) / iResolution.x, 0.5, 1.0);
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  if (iFlipX > 0.5) fragCoord.x = iResolution.x - fragCoord.x;
  if (iFlipY > 0.5) fragCoord.y = iResolution.y - fragCoord.y;

  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
  vec2 rayPos = vec2(iResolution.x * 1.1, -0.5 * iResolution.y);

  float tiltRad = iTilt * 3.14159265 / 180.0;
  float cs = cos(tiltRad);
  float sn = sin(tiltRad);
  vec2 rel = coord - rayPos;
  vec2 tiltedCoord = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs) + rayPos;

  float halfSpread = iSpread * 0.275;
  vec2 rayRefDir1 = normalize(vec2(cos(0.785398 + halfSpread), sin(0.785398 + halfSpread)));
  vec2 rayRefDir2 = normalize(vec2(cos(0.785398 - halfSpread), sin(0.785398 - halfSpread)));

  vec4 rays1 = vec4(iRayColor1, 1.0) * rayStrength(rayPos, rayRefDir1, tiltedCoord, 36.2214, 21.11349, iSpeed);
  vec4 rays2 = vec4(iRayColor2, 1.0) * rayStrength(rayPos, rayRefDir2, tiltedCoord, 22.3991, 18.0234, iSpeed * 0.2);

  vec4 color = rays1 * (1.0 - iBlend) * 0.9 + rays2 * iBlend * 0.9;

  float distanceToLight = length(fragCoord.xy - vec2(rayPos.x, iResolution.y - rayPos.y)) / iResolution.y;
  float brightness = iIntensity * 0.4 / pow(max(distanceToLight, 0.001), iFalloff);
  color.rgb *= brightness;

  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(gray), color.rgb, iSaturation);

  color.a = max(color.r, max(color.g, color.b)) * iOpacity;
  // Premultiplied output — pairs with premultipliedAlpha:true so Safari
  // composites the alpha-gated glow instead of painting the raw HDR RGB.
  gl_FragColor = vec4(color.rgb * color.a, color.a);
}`

      const [flipX, flipY] = originToFlip(origin)
      const uniforms = {
        iTime: { value: 0 },
        iResolution: { value: [1, 1] as number[] },
        iSpeed: { value: speed },
        iRayColor1: { value: hexToRgb(rayColor1) as number[] },
        iRayColor2: { value: hexToRgb(rayColor2) as number[] },
        iIntensity: { value: intensity },
        iSpread: { value: spread },
        iFlipX: { value: flipX },
        iFlipY: { value: flipY },
        iTilt: { value: tilt },
        iSaturation: { value: saturation },
        iBlend: { value: blend },
        iFalloff: { value: falloff },
        iOpacity: { value: opacity },
      }
      uniformsRef.current = uniforms

      const geometry = new Triangle(gl)
      const program = new Program(gl, {
        vertex: vert,
        fragment: frag,
        uniforms,
      })
      const mesh = new Mesh(gl, { geometry, program })
      meshRef.current = mesh

      // The context is live: measure it and put a frame on screen. From here
      // the loop host owns sizing, arming and teardown.
      loop.resize()
      loop.start()

      cleanupFunctionRef.current = () => {
        try {
          const canvas = renderer.gl.canvas
          if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
        } catch {
          // ignore cleanup errors
        }
        rendererRef.current = null
        uniformsRef.current = null
        meshRef.current = null
      }
    }

    initializeWebGL()

    return () => {
      if (cleanupFunctionRef.current) {
        cleanupFunctionRef.current()
        cleanupFunctionRef.current = null
      }
    }
    // Only visibility rebuilds the context. Every prop here is a uniform, and
    // the effect below pushes those without a rebuild — the old dep list tore
    // down and recreated the whole GL program on every slider drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible])

  useEffect(() => {
    if (!uniformsRef.current) return
    const u = uniformsRef.current
    u.iSpeed.value = speed
    u.iRayColor1.value = hexToRgb(rayColor1)
    u.iRayColor2.value = hexToRgb(rayColor2)
    u.iIntensity.value = intensity
    u.iSpread.value = spread
    const [flipX, flipY] = originToFlip(origin)
    u.iFlipX.value = flipX
    u.iFlipY.value = flipY
    u.iTilt.value = tilt
    u.iSaturation.value = saturation
    u.iBlend.value = blend
    u.iFalloff.value = falloff
    u.iOpacity.value = opacity
  }, [
    speed,
    rayColor1,
    rayColor2,
    intensity,
    spread,
    origin,
    tilt,
    saturation,
    blend,
    falloff,
    opacity,
  ])

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none relative z-[3] h-full w-full overflow-hidden ${className}`.trim()}
    />
  )
}

export default SideRays
