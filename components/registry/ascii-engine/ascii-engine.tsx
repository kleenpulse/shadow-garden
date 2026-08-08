"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, RenderTarget, Texture } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A lit 3D solid, rendered at one pixel per character cell, then quantised into
// a glyph ramp. Real geometry underneath, terminal on top.
//
// Four decisions carry this.
//
// **The first pass renders at exactly one texel per cell, not at screen
// resolution.** The output only ever carries one glyph per cell, so shading the
// full canvas and then averaging it down is work thrown away — at a ten-pixel
// cell that is a hundred times the fragments for the same picture. It also makes
// `cellSize` a genuine performance control rather than a cosmetic one.
//
// **The solid is a raymarched distance field, not a mesh.** No scene graph, no
// camera rig, no second library, and the silhouette stays exact at any cell size
// because it is evaluated rather than rasterised.
//
// **The glyph atlas is drawn once with fillText and uploaded as one texture.**
// The shader indexes it, so a longer ramp costs nothing per frame. Rebuilding it
// per frame — or worse, laying out real DOM characters — is how this effect
// usually ends up costing more than the 3D it is replacing.
//
// **Edge is added back before quantising.** Pure luminance loses the silhouette:
// a ramp of ten steps cannot hold both the shading and the outline, and without
// the outline the form dissolves into its own gradient.
export type AsciiSolid = "torus-knot" | "cube" | "sphere" | "gyroid" | "column";
export type AsciiCharset = "classic" | "blocks" | "minimal" | "binary" | "dots";

interface AsciiEngineProps {
  /** Which distance field is raymarched. */
  solid?: AsciiSolid;
  /** The glyph ramp, darkest to lightest. */
  charset?: AsciiCharset;
  /** Width of one character cell. */
  cellSize?: number;
  /** Rotation speed of the solid. */
  spinSpeed?: number;
  /** Camera elevation. */
  tilt?: number;
  /** How much of the frame the solid fills. */
  zoom?: number;
  /** Gamma on the luminance before it picks a glyph. */
  contrast?: number;
  /** How much silhouette is added back before quantising. */
  edgeBoost?: number;
  /** Bloom around the lit glyphs. */
  glow?: number;
  /** The glyph colour. */
  inkColor?: string;
  /** The dead terminal behind them. */
  backgroundColor?: string;
  /** Halt the loop. One still frame stays painted. */
  paused?: boolean;
  /** The solid parks. The picture stays on screen. */
  reducedMotion?: boolean;
  className?: string;
}

const SOLID_ID: Record<string, number> = {
  "torus-knot": 0,
  cube: 1,
  sphere: 2,
  gyroid: 3,
  column: 4,
};

/** Darkest first. The shader maps luminance onto the index, so the order here is
 *  the ramp — reversing it inverts the image. */
const RAMPS: Record<AsciiCharset, string> = {
  classic: " .:-=+*#%@",
  blocks: " .:oO0@#",
  minimal: " .:*#",
  binary: " .01",
  dots: " .·:•●",
};

const ATLAS_CELL = 32;

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const supportsWebGL2 = () => {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
};

function buildAtlas(ramp: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_CELL * ramp.length;
  canvas.height = ATLAS_CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = `${Math.round(ATLAS_CELL * 0.78)}px ui-monospace, "Cascadia Mono", Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < ramp.length; i++) {
    ctx.fillText(ramp[i], i * ATLAS_CELL + ATLAS_CELL / 2, ATLAS_CELL / 2 + 1);
  }
  return canvas;
}

const vertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const sceneFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec2  uGrid;
uniform float uSolid;
uniform float uSpin;
uniform float uTilt;
uniform float uZoom;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float sdTorusKnot(vec3 p) {
  float a = atan(p.z, p.x);
  vec2 q = vec2(length(p.xz) - 1.05, p.y);
  q *= rot(a * 1.5);
  q.x = abs(q.x) - 0.34;
  return length(q) - 0.13;
}
float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}
float sdGyroid(vec3 p) {
  p *= 2.4;
  // Gyroid is not a true distance field, so the march is scaled down to keep it
  // from stepping straight through the surface.
  return (abs(dot(sin(p), cos(p.zxy))) - 0.42) * 0.22;
}
float sdColumn(vec3 p) {
  vec3 q = p;
  q.xz *= rot(q.y * 1.1);
  float flutes = length(max(abs(q.xz) - 0.10, 0.0)) - 0.30;
  return max(flutes, abs(p.y) - 1.05);
}

float map(vec3 p) {
  if (uSolid < 0.5) return sdTorusKnot(p);
  if (uSolid < 1.5) return sdBox(p, vec3(0.78));
  if (uSolid < 2.5) return length(p) - 1.05;
  if (uSolid < 3.5) return sdGyroid(p);
  return sdColumn(p);
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= uGrid.x / max(uGrid.y, 1.0);

  vec3 ro = vec3(0.0, 0.0, 3.4);
  // Narrowing the field of view rather than moving the camera. Dollying in
  // would clip the near face of the solid long before the silhouette filled
  // the frame.
  vec3 rd = normalize(vec3(uv / max(uZoom, 0.05), -1.9));

  float pitch = uTilt * 0.9;
  ro.yz *= rot(pitch); rd.yz *= rot(pitch);
  ro.xz *= rot(uSpin); rd.xz *= rot(uSpin);

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.0015) { hit = 1.0; break; }
    t += d;
    if (t > 7.0) break;
  }

  float lum = 0.0;
  float edge = 0.0;
  if (hit > 0.5) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 l = normalize(vec3(0.6, 0.8, 0.45));
    float diff = max(dot(n, l), 0.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
    lum = 0.12 + diff * 0.85;
    // The silhouette term, carried in G so the display pass can add it back
    // without it polluting the shading it is meant to rescue.
    edge = rim;
  }
  fragColor = vec4(lum, edge, 0.0, 1.0);
}`;

const displayFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2  uResolution;
uniform vec2  uGrid;
uniform float uCell;
uniform float uCount;
uniform float uContrast;
uniform float uEdgeBoost;
uniform float uGlow;
uniform vec3  uInk;
uniform vec3  uBg;

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 cell = floor(px / uCell);
  vec2 inCell = fract(px / uCell);

  vec2 sceneUv = (cell + 0.5) / uGrid;
  vec4 s = texture(uScene, sceneUv);
  float lum = clamp(s.r + s.g * uEdgeBoost, 0.0, 1.0);
  lum = pow(lum, 1.0 / max(uContrast, 0.05));

  float idx = floor(lum * (uCount - 0.001));
  // gl_FragCoord runs bottom-up and the atlas was drawn top-down, so the glyph
  // is sampled upside down unless y is flipped here. Everything still "works"
  // without this and every letter is silently mirrored.
  vec2 atlasUv = vec2((idx + inCell.x) / uCount, 1.0 - inCell.y);
  float g = texture(uAtlas, atlasUv).r;

  vec3 col = mix(uBg, uInk, g);
  col += uInk * lum * uGlow * 0.22;
  fragColor = vec4(col, 1.0);
}`;

const AsciiEngine = memo(
  ({
    solid = "torus-knot",
    charset = "classic",
    cellSize = 10,
    spinSpeed = 0.35,
    tilt = 0.4,
    zoom = 1,
    contrast = 1.1,
    edgeBoost = 0.5,
    glow = 0.3,
    inkColor = "#7ef0c0",
    backgroundColor = "#04060a",
    paused = false,
    reducedMotion = false,
    className,
  }: AsciiEngineProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
    const atlasRef = useRef<((ramp: string) => void) | null>(null);
    // Orbit state. Yaw is unbounded and wrapped; pitch is clamped short of the
    // poles, because a camera that rolls over the top of a solid reads as a bug
    // rather than as a rotation you asked for.
    const orbit = useRef({
      yaw: 0, pitch: 0, vYaw: 0, vPitch: 0,
      dragging: false, pointerId: -1, lastX: 0, lastY: 0, lastT: 0,
    });

    const [fallback, setFallback] = useState(false);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: 1,
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
      gl: () => glRef.current,
    });

    const live = useRef({
      solid, charset, cellSize, spinSpeed, tilt, zoom, contrast,
      edgeBoost, glow, inkColor, backgroundColor,
    });
    live.current = {
      solid, charset, cellSize, spinSpeed, tilt, zoom, contrast,
      edgeBoost, glow, inkColor, backgroundColor,
    };

    useEffect(() => {
      if (!supportsWebGL2()) setFallback(true);
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (fallback || !container) return;

      const renderer = new Renderer({
        webgl: 2,
        alpha: false,
        antialias: false,
        powerPreference: "high-performance",
        dpr: 1,
      });
      const glc = renderer.gl;
      const gl2 = glc as unknown as WebGL2RenderingContext;
      glRef.current = gl2;

      const canvas = glc.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      // Out of flow — ogl's setSize writes an explicit pixel width, and in flow that
      // raises the container's min-content width so it never shrinks again.
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      container.appendChild(canvas);

      const geometry = new Triangle(glc);

      let scene = new RenderTarget(glc, {
        width: 64,
        height: 64,
        depth: false,
        minFilter: gl2.NEAREST,
        magFilter: gl2.NEAREST,
        wrapS: gl2.CLAMP_TO_EDGE,
        wrapT: gl2.CLAMP_TO_EDGE,
      });

      const atlasTexture = new Texture(glc, {
        image: buildAtlas(RAMPS[charset]),
        generateMipmaps: false,
        minFilter: gl2.LINEAR,
        magFilter: gl2.LINEAR,
        wrapS: gl2.CLAMP_TO_EDGE,
        wrapT: gl2.CLAMP_TO_EDGE,
        flipY: false,
      });
      let glyphCount = RAMPS[charset].length;

      const sceneProgram = new Program(glc, {
        vertex,
        fragment: sceneFragment,
        uniforms: {
          uGrid: { value: new Float32Array([64, 64]) },
          uSolid: { value: SOLID_ID[solid] ?? 0 },
          uSpin: { value: 0 },
          uTilt: { value: tilt },
          uZoom: { value: zoom },
        },
      });
      const displayProgram = new Program(glc, {
        vertex,
        fragment: displayFragment,
        uniforms: {
          uScene: { value: scene.texture },
          uAtlas: { value: atlasTexture },
          uResolution: { value: new Float32Array([1, 1]) },
          uGrid: { value: new Float32Array([64, 64]) },
          uCell: { value: cellSize },
          uCount: { value: glyphCount },
          uContrast: { value: contrast },
          uEdgeBoost: { value: edgeBoost },
          uGlow: { value: glow },
          uInk: { value: new Float32Array(hexToRgb01(inkColor)) },
          uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
        },
      });

      const sceneMesh = new Mesh(glc, { geometry, program: sceneProgram });
      const displayMesh = new Mesh(glc, { geometry, program: displayProgram });
      const su = sceneProgram.uniforms as Record<string, { value: number | Float32Array }>;
      const du = displayProgram.uniforms as Record<string, { value: unknown }>;

      atlasRef.current = (ramp: string) => {
        atlasTexture.image = buildAtlas(ramp);
        atlasTexture.needsUpdate = true;
        glyphCount = ramp.length;
      };

      let spin = 0;
      let cols = 64;
      let rows = 64;

      const renderAll = () => {
        const l = live.current;
        const o = orbit.current;
        su.uSolid.value = SOLID_ID[l.solid] ?? 0;
        su.uSpin.value = spin + o.yaw;
        // The prop is the resting elevation and the drag is an offset from it,
        // so tuning the control still means something after you have orbited.
        su.uTilt.value = Math.max(-1.45, Math.min(1.45, l.tilt + o.pitch));
        su.uZoom.value = l.zoom;
        (su.uGrid.value as Float32Array)[0] = cols;
        (su.uGrid.value as Float32Array)[1] = rows;
        renderer.render({ scene: sceneMesh, target: scene });

        du.uScene.value = scene.texture;
        (du.uGrid as { value: Float32Array }).value[0] = cols;
        (du.uGrid as { value: Float32Array }).value[1] = rows;
        (du.uCell as { value: number }).value = Math.max(l.cellSize, 2);
        (du.uCount as { value: number }).value = glyphCount;
        (du.uContrast as { value: number }).value = l.contrast;
        (du.uEdgeBoost as { value: number }).value = l.edgeBoost;
        (du.uGlow as { value: number }).value = l.glow;
        ((du.uInk as { value: Float32Array }).value).set(hexToRgb01(l.inkColor));
        ((du.uBg as { value: Float32Array }).value).set(hexToRgb01(l.backgroundColor));
        renderer.render({ scene: displayMesh });
      };

      drawRef.current = (dt) => {
        const o = orbit.current;
        if (!o.dragging) {
          // Auto-spin only resumes when nothing is being held. Coasting momentum
          // is applied first so a fling hands off to the idle rotation instead
          // of fighting it.
          o.yaw += o.vYaw * dt;
          o.pitch = Math.max(-1.45, Math.min(1.45, o.pitch + o.vPitch * dt));
          const decay = Math.pow(0.92, dt * 60);
          o.vYaw *= decay;
          o.vPitch *= decay;
          spin = (spin + dt * live.current.spinSpeed * 0.6) % (Math.PI * 2);
        }
        o.yaw %= Math.PI * 2;
        renderAll();
      };

      measureRef.current = ({ width, height }) => {
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        const cell = Math.max(live.current.cellSize, 2);
        cols = Math.max(2, Math.ceil(width / cell));
        rows = Math.max(2, Math.ceil(height / cell));
        scene.setSize(cols, rows);
        const res = du.uResolution as { value: Float32Array };
        res.value[0] = width;
        res.value[1] = height;
        // Bake one corrected frame so a halted picture is never stale after a
        // resize; the host then paints its own on top (§V2).
        renderAll();
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        atlasRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback]);

    // The grid is a function of cellSize, so a change has to go through the
    // resize path rather than just the repaint one.
    useEffect(() => {
      loop.resize();
    }, [cellSize, loop]);

    useEffect(() => {
      atlasRef.current?.(RAMPS[charset]);
      loop.paint();
    }, [charset, loop]);

    useEffect(() => {
      loop.paint();
    }, [solid, spinSpeed, tilt, zoom, contrast, edgeBoost, glow, inkColor, backgroundColor, loop]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      const o = orbit.current;
      o.dragging = true;
      o.pointerId = e.pointerId;
      o.lastX = e.clientX;
      o.lastY = e.clientY;
      o.lastT = e.timeStamp;
      o.vYaw = 0;
      o.vPitch = 0;
      e.currentTarget.setPointerCapture(e.pointerId);
      loop.start();
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const o = orbit.current;
      if (!o.dragging || e.pointerId !== o.pointerId) return;
      const dx = e.clientX - o.lastX;
      const dy = e.clientY - o.lastY;
      const dt = (e.timeStamp - o.lastT) / 1000;
      const dYaw = dx * 0.008;
      // Negated. Screen y grows downward while the camera's pitch grows upward,
      // so passing the raw delta through makes the vertical axis fight the hand:
      // you drag down and the solid tips away from you. Grabbing an object and
      // pulling down should bring its top toward you.
      const dPitch = -dy * 0.006;
      o.yaw += dYaw;
      o.pitch = Math.max(-1.45, Math.min(1.45, o.pitch + dPitch));
      if (dt > 0.001) {
        // Velocity from the last segment only. Averaging the whole gesture makes
        // a drag that stops dead before release still fling on release.
        o.vYaw = dYaw / dt;
        o.vPitch = dPitch / dt;
      }
      o.lastX = e.clientX;
      o.lastY = e.clientY;
      o.lastT = e.timeStamp;
      loop.start();
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
      const o = orbit.current;
      if (o.pointerId !== -1 && e.currentTarget.hasPointerCapture(o.pointerId)) {
        e.currentTarget.releasePointerCapture(o.pointerId);
      }
      o.dragging = false;
      o.pointerId = -1;
      loop.start();
    };

    if (fallback) {
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor,
            color: inkColor,
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: `${Math.max(cellSize, 6)}px`,
            lineHeight: 1,
            padding: "1rem",
            overflow: "hidden",
            whiteSpace: "pre",
          }}
        >
          {Array.from({ length: 14 }, () => "=+*#%@#*+=".repeat(12)).join("\n")}
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        // The canvas is appended imperatively, so touch-action is set through it
        // rather than on the JSX element. Without it a finger orbiting the solid
        // scrolls the page instead.
        className={
          className ??
          "relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing [&_canvas]:touch-none"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    );
  },
);

AsciiEngine.displayName = "AsciiEngine";

export default AsciiEngine;
