"use client";

import React, { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, Color } from "ogl";

// Detect iOS (all iOS browsers share WebKit's WebGL limits) for the static fallback.
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Real capability probe — catches blocklisted GPUs before OGL throws on a null context.
function supportsWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

// Hex → normalized RGB for live uniform updates without recreating an ogl Color.
function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length !== 6) return [1, 1, 1];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface ThreadsProps {
  /** Hex color (ogl Color also accepts hex). Adapted from the original RGB tuple. */
  color?: string;
  amplitude?: number;
  opacity?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
  saturation?: number;
  paused?: boolean;
  fallbackSrc?: string;
  className?: string;
}

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uOpacity;
uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;
uniform float uSaturation;

#define PI 3.1415926538

const int u_line_count = 60;
const float u_line_width = 1.2;
const float u_line_blur = 5.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float time_scaled = time / 6.0 + (mouse.x - 0.5) * 1.5;

    float organic_sweep = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 1.5),
        sin(st.x * 2.5 + time_scaled) * cos(st.x * 3.0 - time_scaled * 0.5 + perc * PI * 1.5) * 1.5,
        0.5 + perc * 0.5
    );

    float amplitude_strength = amplitude * (0.2 + (mouse.y - 0.5) * 0.2);

    float base_spread = distance > 0.0 ? (perc - 0.5) * distance : 0.0;

    float line_offset = perc * PI * 2.0;
    float structural_envelope = sin(st.x * 3.0 + time_scaled * 2.0 + line_offset) * 0.15 * amplitude_strength;

    float y = 0.5 + base_spread + organic_sweep * amplitude_strength + structural_envelope;

    float blur = u_line_blur * pixel(1.0, iResolution.xy) * (0.5 + perc * 1.5);
    float width_px = width * (1.2 - perc * 0.4);

    float line_start = smoothstep(y + (width_px / 2.0) + blur, y, st.y);
    float line_end = smoothstep(y, y - (width_px / 2.0) - blur, st.y);

    float depth_alpha = 1.0 - smoothstep(0.4, 1.0, perc);
    float vignette = smoothstep(0.0, 0.08, st.x) * (1.0 - smoothstep(0.92, 1.0, st.x));

    return clamp((line_start - line_end) * depth_alpha * vignette, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    float colorVal = 1.0 - line_strength;

    vec3 W = vec3(0.2125, 0.7154, 0.0721);
    vec3 intensity = vec3(dot(uColor, W));
    vec3 finalColor = mix(intensity, uColor, uSaturation);

    float alpha = colorVal * uOpacity;
    fragColor = vec4(finalColor * alpha, alpha);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

const Threads: React.FC<ThreadsProps> = ({
  color = "#a855f7",
  amplitude = 1.5,
  distance = 0.2,
  opacity = 0.7,
  saturation = 1.0,
  enableMouseInteraction = true,
  paused = false,
  fallbackSrc,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameId = useRef<number>(0);
  // Set inside the init effect; lets the paused effect resume the render loop
  // after it self-halts (the loop stops issuing draw calls once paused settles).
  const startLoopRef = useRef<(() => void) | null>(null);
  // Live-tunable values read each frame — the WebGL context is never rebuilt
  // while a control is dragged, so tuning stays smooth.
  const live = useRef({ color, amplitude, distance, opacity, saturation, paused });
  live.current = { color, amplitude, distance, opacity, saturation, paused };

  const [useFallback, setUseFallback] = useState(false);
  useEffect(() => {
    if (fallbackSrc && (isIOS() || !supportsWebGL())) setUseFallback(true);
  }, [fallbackSrc]);

  useEffect(() => {
    if (useFallback || !containerRef.current) return;
    const container = containerRef.current;

    let gl: Renderer["gl"] | undefined;
    try {
      const renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: true,
        dpr: window.devicePixelRatio || 1,
      });
      gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      container.appendChild(gl.canvas);

      const geometry = new Triangle(gl);
      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          iTime: { value: 0 },
          iResolution: {
            value: new Color(
              gl.canvas.width,
              gl.canvas.height,
              gl.canvas.width / gl.canvas.height,
            ),
          },
          uColor: { value: new Color(color) },
          uOpacity: { value: opacity },
          uAmplitude: { value: amplitude },
          uDistance: { value: distance },
          uMouse: { value: new Float32Array([0.5, 0.5]) },
          uSaturation: { value: saturation },
        },
      });

      if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
        throw new Error("Threads shader program failed to link");
      }

      const mesh = new Mesh(gl, { geometry, program });

      function resize() {
        const { clientWidth, clientHeight } = container;
        if (clientWidth === 0 || clientHeight === 0) return;
        renderer.setSize(clientWidth, clientHeight);
        const bw = renderer.gl.drawingBufferWidth;
        const bh = renderer.gl.drawingBufferHeight;
        program.uniforms.iResolution.value.r = bw;
        program.uniforms.iResolution.value.g = bh;
        program.uniforms.iResolution.value.b = bw / bh;
      }
      const resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(container);
      resize();

      const currentMouse = [0.5, 0.5];
      let targetMouse = [0.5, 0.5];

      function handleMouseMove(e: MouseEvent) {
        const rect = container.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1.0 - (e.clientY - rect.top) / rect.height;
        targetMouse = [x, y];
      }
      function handleMouseLeave() {
        targetMouse = [0.5, 0.5];
      }
      if (enableMouseInteraction) {
        container.addEventListener("mousemove", handleMouseMove);
        container.addEventListener("mouseleave", handleMouseLeave);
      }

      let accumulatedTime = 0;
      let lastTimestamp = -1;
      let timeScale = paused ? 0 : 1;
      let running = false;

      function update(t: number) {
        const dt = lastTimestamp >= 0 ? (t - lastTimestamp) * 0.001 : 0;
        lastTimestamp = t;

        const l = live.current;
        const target = l.paused ? 0 : 1;
        timeScale += (target - timeScale) * 0.05;
        accumulatedTime += dt * timeScale;
        program.uniforms.iTime.value = accumulatedTime;

        // Live uniform updates (no context rebuild).
        const [r, g, b] = hexToRgb01(l.color);
        program.uniforms.uColor.value.r = r;
        program.uniforms.uColor.value.g = g;
        program.uniforms.uColor.value.b = b;
        program.uniforms.uOpacity.value = l.opacity;
        program.uniforms.uAmplitude.value = l.amplitude;
        program.uniforms.uDistance.value = l.distance;
        program.uniforms.uSaturation.value = l.saturation;

        if (enableMouseInteraction) {
          const smoothing = 0.05;
          currentMouse[0] += smoothing * (targetMouse[0] - currentMouse[0]);
          currentMouse[1] += smoothing * (targetMouse[1] - currentMouse[1]);
          program.uniforms.uMouse.value[0] = currentMouse[0];
          program.uniforms.uMouse.value[1] = currentMouse[1];
        } else {
          program.uniforms.uMouse.value[0] = 0.5;
          program.uniforms.uMouse.value[1] = 0.5;
        }

        renderer.render({ scene: mesh });

        // Once paused and the ease-out has settled, stop the loop entirely so a
        // scrolled-past hero stops issuing draw calls (it used to render a
        // frozen frame forever). The paused effect calls startLoop to resume.
        if (l.paused && timeScale < 1e-3) {
          running = false;
          lastTimestamp = -1;
          return;
        }
        animationFrameId.current = requestAnimationFrame(update);
      }

      function startLoop() {
        if (running) return;
        running = true;
        lastTimestamp = -1;
        animationFrameId.current = requestAnimationFrame(update);
      }
      startLoopRef.current = startLoop;
      startLoop();

      return () => {
        running = false;
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        resizeObserver.disconnect();
        if (enableMouseInteraction) {
          container.removeEventListener("mousemove", handleMouseMove);
          container.removeEventListener("mouseleave", handleMouseLeave);
        }
        if (container.contains(gl!.canvas)) container.removeChild(gl!.canvas);
        gl!.getExtension("WEBGL_lose_context")?.loseContext();
      };
    } catch (err) {
      console.warn("Threads: WebGL init failed, falling back to static image", err);
      if (gl) {
        if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      setUseFallback(true);
      return;
    }
    // color/amplitude/distance/opacity/saturation/paused are live via `live` ref.
  }, [enableMouseInteraction, useFallback]);

  // Resume the render loop when unpausing — the loop self-halts once the
  // pause ease-out settles, so it needs an external kick to start again.
  useEffect(() => {
    if (!paused) startLoopRef.current?.();
  }, [paused]);

  if (useFallback && fallbackSrc) {
    return (
      <div className={className ?? "relative h-full w-full"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallbackSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity }}
        />
      </div>
    );
  }

  return <div ref={containerRef} className={className ?? "relative h-full w-full"} />;
};

export default Threads;
