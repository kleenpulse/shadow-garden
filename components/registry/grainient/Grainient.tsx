'use client'

import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Triangle } from 'ogl'
import { useAnimationLoop, type Metrics } from '@/hooks/use-animation-loop'

interface GrainientProps {
  timeSpeed?: number
  colorBalance?: number
  warpStrength?: number
  warpFrequency?: number
  warpSpeed?: number
  warpAmplitude?: number
  blendAngle?: number
  blendSoftness?: number
  rotationAmount?: number
  noiseScale?: number
  grainAmount?: number
  grainScale?: number
  grainAnimated?: boolean
  contrast?: number
  gamma?: number
  saturation?: number
  centerX?: number
  centerY?: number
  zoom?: number
  color1?: string
  color2?: string
  color3?: string
  paused?: boolean
  className?: string
}

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [1, 1, 1]
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ]
}

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uTimeSpeed;
uniform float uColorBalance;
uniform float uWarpStrength;
uniform float uWarpFrequency;
uniform float uWarpSpeed;
uniform float uWarpAmplitude;
uniform float uBlendAngle;
uniform float uBlendSoftness;
uniform float uRotationAmount;
uniform float uNoiseScale;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uGrainAnimated;
uniform float uContrast;
uniform float uGamma;
uniform float uSaturation;
uniform vec2 uCenterOffset;
uniform float uZoom;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
out vec4 fragColor;
#define S(a,b,t) smoothstep(a,b,t)
mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}
void mainImage(out vec4 o, vec2 C){
  float t=iTime*uTimeSpeed;
  vec2 uv=C/iResolution.xy;
  float ratio=iResolution.x/iResolution.y;
  vec2 tuv=uv-0.5+uCenterOffset;
  tuv/=max(uZoom,0.001);

  float degree=noise(vec2(t*0.1,tuv.x*tuv.y)*uNoiseScale);
  tuv.y*=1.0/ratio;
  tuv*=Rot(radians((degree-0.5)*uRotationAmount+180.0));
  tuv.y*=ratio;

  float frequency=uWarpFrequency;
  float ws=max(uWarpStrength,0.001);
  float amplitude=uWarpAmplitude/ws;
  float warpTime=t*uWarpSpeed;
  tuv.x+=sin(tuv.y*frequency+warpTime)/amplitude;
  tuv.y+=sin(tuv.x*(frequency*1.5)+warpTime)/(amplitude*0.5);

  vec3 colLav=uColor1;
  vec3 colOrg=uColor2;
  vec3 colDark=uColor3;
  float b=uColorBalance;
  float s=max(uBlendSoftness,0.0);
  mat2 blendRot=Rot(radians(uBlendAngle));
  float blendX=(tuv*blendRot).x;
  float edge0=-0.3-b-s;
  float edge1=0.2-b+s;
  float v0=0.5-b+s;
  float v1=-0.3-b-s;
  vec3 layer1=mix(colDark,colOrg,S(edge0,edge1,blendX));
  vec3 layer2=mix(colOrg,colLav,S(edge0,edge1,blendX));
  vec3 col=mix(layer1,layer2,S(v0,v1,tuv.y));

  vec2 grainUv=uv*max(uGrainScale,0.001);
  if(uGrainAnimated>0.5){grainUv+=vec2(iTime*0.05);}
  float grain=fract(sin(dot(grainUv,vec2(12.9898,78.233)))*43758.5453);
  col+=(grain-0.5)*uGrainAmount;

  col=(col-0.5)*uContrast+0.5;
  float luma=dot(col,vec3(0.2126,0.7152,0.0722));
  col=mix(vec3(luma),col,uSaturation);
  col=pow(max(col,0.0),vec3(1.0/max(uGamma,0.001)));
  col=clamp(col,0.0,1.0);

  o=vec4(col,1.0);
}
void main(){
  vec4 o=vec4(0.0);
  mainImage(o,gl_FragCoord.xy);
  fragColor=o;
}
`

// Keep renderer/program alive across re-renders so Effect 2 can update
// uniforms without ever rebuilding the WebGL context.
type GrainientCtx = {
  renderer: InstanceType<typeof Renderer>
  program: InstanceType<typeof Program>
  mesh: InstanceType<typeof Mesh>
}
const ctxMap = new WeakMap<HTMLDivElement, GrainientCtx>()

// Defaults baked from the tuned Knowledge-Center palette (see the slider
// config in the design hand-off). `<Grainient />` with no props reproduces it.
const Grainient = ({
  blendAngle = 0.0,
  blendSoftness = 0.5,
  centerX = 0.0,
  centerY = 0.0,
  color1 = '#f754f1',
  color2 = '#6d28d9',
  color3 = '#22d3ee',
  colorBalance = 0.0,
  contrast = 1,
  gamma = 1.0,
  grainAmount = 0.12,
  grainAnimated = false,
  grainScale = 1.6,
  noiseScale = 1.2,
  rotationAmount = 800.0,
  saturation = 1.1,
  timeSpeed = 1,
  warpAmplitude = 50.0,
  warpFrequency = 2,
  warpSpeed = 2.0,
  warpStrength = 0.8,
  zoom = 1,
  paused = false,
  className = '',
}: GrainientProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Mirror `paused` for the loop's start/stop gate without rebuilding the context.
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const drawRef = useRef<((t: number) => void | false) | null>(null)
  const measureRef = useRef<((m: Metrics) => void) | null>(null)
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
    null
  )

  // `halted` stays false — the frame body halts on off-screen, backgrounded or
  // paused, three conditions the host has no business knowing about. `gl` is
  // supplied because this component leaked a context per unmount.
  const loop = useAnimationLoop({
    target: containerRef,
    halted: false,
    dpr: 'auto',
    onResize: (metrics) => measureRef.current?.(metrics),
    onFrame: ({ now }) => drawRef.current?.(now) ?? false,
    gl: () => glRef.current,
  })

  // Effect 1: build WebGL context once, pause when offscreen / tab hidden
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new Renderer({
      webgl: 2,
      alpha: true,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    })

    const gl = renderer.gl
    glRef.current = gl
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    container.appendChild(canvas)

    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uTimeSpeed: { value: 0.9 },
        uColorBalance: { value: 0.0 },
        uWarpStrength: { value: 1.6 },
        uWarpFrequency: { value: 5.0 },
        uWarpSpeed: { value: 2.0 },
        uWarpAmplitude: { value: 50.0 },
        uBlendAngle: { value: 0.0 },
        uBlendSoftness: { value: 0.22 },
        uRotationAmount: { value: 500.0 },
        uNoiseScale: { value: 0.25 },
        uGrainAmount: { value: 0.0 },
        uGrainScale: { value: 1.6 },
        uGrainAnimated: { value: 0.0 },
        uContrast: { value: 1.5 },
        uGamma: { value: 1.0 },
        uSaturation: { value: 1.1 },
        uCenterOffset: { value: new Float32Array([0, 0]) },
        uZoom: { value: 0.95 },
        uColor1: { value: new Float32Array(hexToRgb('#FF9FFC')) },
        uColor2: { value: new Float32Array(hexToRgb('#2754ff')) },
        uColor3: { value: new Float32Array(hexToRgb('#ee27af')) },
      },
    })

    const mesh = new Mesh(gl, { geometry, program })
    ctxMap.set(container, { renderer, program, mesh })

    measureRef.current = ({ width, height, dpr }) => {
      renderer.dpr = dpr
      renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)))
      const res = (program.uniforms.iResolution as { value: Float32Array })
        .value
      res[0] = gl.drawingBufferWidth
      res[1] = gl.drawingBufferHeight
      renderer.render({ scene: mesh })
    }

    let isVisible = true
    let isPageVisible = !document.hidden
    const t0 = performance.now()

    drawRef.current = (t) => {
      ;(program.uniforms.iTime as { value: number }).value = (t - t0) * 0.001
      renderer.render({ scene: mesh })
      // Halt from inside the frame when off-screen, backgrounded or paused.
      if (!isVisible || !isPageVisible || pausedRef.current) return false
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting
        if (isVisible) loop.start()
      },
      { threshold: 0 }
    )
    io.observe(container)

    const onVisibility = () => {
      isPageVisible = !document.hidden
      if (isPageVisible) loop.start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    loop.resize()
    loop.start()

    return () => {
      drawRef.current = null
      measureRef.current = null
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      ctxMap.delete(container)
      try {
        container.removeChild(canvas)
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // renderer created once

  // Effect 2: sync props to uniforms — zero GPU cost, no teardown
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ctx = ctxMap.get(container)
    if (!ctx) return
    const { program } = ctx
    const u = program.uniforms as Record<string, { value: unknown }>

    u.uTimeSpeed.value = timeSpeed
    u.uColorBalance.value = colorBalance
    u.uWarpStrength.value = warpStrength
    u.uWarpFrequency.value = warpFrequency
    u.uWarpSpeed.value = warpSpeed
    u.uWarpAmplitude.value = warpAmplitude
    u.uBlendAngle.value = blendAngle
    u.uBlendSoftness.value = blendSoftness
    u.uRotationAmount.value = rotationAmount
    u.uNoiseScale.value = noiseScale
    u.uGrainAmount.value = grainAmount
    u.uGrainScale.value = grainScale
    u.uGrainAnimated.value = grainAnimated ? 1.0 : 0.0
    u.uContrast.value = contrast
    u.uGamma.value = gamma
    u.uSaturation.value = saturation
    u.uCenterOffset.value = new Float32Array([centerX, centerY])
    u.uZoom.value = zoom
    u.uColor1.value = new Float32Array(hexToRgb(color1))
    u.uColor2.value = new Float32Array(hexToRgb(color2))
    u.uColor3.value = new Float32Array(hexToRgb(color3))

    // The loop is halted while paused — repaint one frame so tuning stays
    // visible (matters for reduced-motion users, who are always paused).
    if (pausedRef.current) ctx.renderer.render({ scene: ctx.mesh })
  }, [
    timeSpeed,
    colorBalance,
    warpStrength,
    warpFrequency,
    warpSpeed,
    warpAmplitude,
    blendAngle,
    blendSoftness,
    rotationAmount,
    noiseScale,
    grainAmount,
    grainScale,
    grainAnimated,
    contrast,
    gamma,
    saturation,
    centerX,
    centerY,
    zoom,
    color1,
    color2,
    color3,
  ])

  // Resume on unpause. Pausing needs no action: the frame body reads pausedRef
  // and halts itself after painting, so it stops issuing draw calls instead of
  // spinning at speed 0 on a frozen frame.
  useEffect(() => {
    if (!paused) loop.start()
  }, [paused, loop])

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`.trim()}
    />
  )
}

export default Grainient
