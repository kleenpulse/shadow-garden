"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, Geometry, RenderTarget } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Physarum polycephalum — a slime mould transport network, run as a swarm of
// agents rather than as a field equation.
//
// Every other simulation in this catalogue is a PDE on a grid: the state of a
// cell is a function of its neighbours and nothing has an identity. Here the
// population is the state. Each agent carries a position and a heading, samples
// the trail map at three points ahead of itself, turns toward whichever sample
// is strongest, steps forward, and deposits. The trail then blurs and decays.
// That loop — sense, turn, move, deposit, decay — is the whole model, and the
// veins, the anastomoses and the slow reorganisation are emergent. Nothing in
// the code knows what a vein is.
//
// Three decisions carry the component.
//
// **The agents ARE a texture.** One texel per agent, RGBA32F, xy = position and
// z = heading. The update pass is an ordinary full-screen draw over that
// texture, so a million agents cost one draw call and never touch the CPU.
// Deposition is the only pass that needs them as geometry: a point cloud whose
// vertex shader reads its own position back out of the texture.
//
// **The field is decoupled from the canvas.** Resizing touches the display pass
// and nothing else. The alternative wipes a minute of growth every time the
// window moves, which reads as a crash rather than as a reallocation — the same
// line `turing` and `smoke-field` draw.
//
// **Float targets or nothing.** Headings integrate their own output, and at
// eight bits the quantisation is larger than one frame's turn: the swarm locks
// onto the sixteen representable directions and the network comes out as a
// lattice. If EXT_color_buffer_float is missing the honest answer is a still
// image, so the probe throws and the CSS stand-in takes over.
export type MyceliumSpawn = "ring" | "scatter" | "disc";
export type MyceliumAgents = "65k" | "262k" | "1M";

interface MyceliumProps {
  /** How many agents forage the field. */
  agentCount?: MyceliumAgents;
  /** Forward travel, in field pixels per second. */
  speed?: number;
  /** How far ahead an agent samples the trail. */
  sensorDistance?: number;
  /** Angle between the centre sensor and the two flanking ones. */
  sensorAngle?: number;
  /** How fast an agent can steer, in radians per second. */
  turnSpeed?: number;
  /** Random walk on each heading, in radians per second. What stops the colony
   *  collapsing onto a handful of trunks. */
  wander?: number;
  /** Trail left after one 60th of a second. Lower forgets sooner. */
  decay?: number;
  /** How much each cell blends toward its neighbours — the blur that lets
   *  separate trails find each other. */
  diffuse?: number;
  /** Trail laid down per agent per step. */
  deposit?: number;
  /** Radius the pointer draws agents toward. 0 turns the attractant off. */
  attract?: number;
  /** Where the population starts, and which way it faces. */
  spawn?: MyceliumSpawn;
  /** The trail. */
  trailColor?: string;
  /** The dark the network grows against. */
  background?: string;
  /** Extra light on the densest strands. */
  glow?: number;
  /** Halt the loop. The network stays exactly where it was. */
  paused?: boolean;
  /** The network stops foraging. What has already grown stays on screen. */
  reducedMotion?: boolean;
  className?: string;
}

/** Side of the trail map, and the unit every distance in the panel is quoted
 *  against. Fixed rather than scaled with `agentCount`, which was tried and is
 *  wrong: a vein is a few texels wide however many agents drew it, so a half-size
 *  field does not make a smaller picture, it makes the same picture out of texels
 *  twice as large — the strands come out as thick ropes and the network stops
 *  reading as filigree. Resolution belongs to the field; population belongs to
 *  `agentCount`; they are separate knobs and only one of them is on the panel. */
const FIELD = 1024;

/** Side of the agent texture — one texel per agent. Against the fixed field
 *  above this is a density, and density is what decides how much of the network
 *  survives decay: a quarter of the agents is a sparser, coarser web rather than
 *  the same web drawn faintly. */
const AGENT_SIDE: Record<string, number> = { "65k": 256, "262k": 512, "1M": 1024 };

/** Reach of the food source, as a fraction of the field. Not a control: the
 *  interesting question is how strong the source is, not how wide — a wide weak
 *  source and a narrow strong one produce the same routing, and two props that
 *  trade against each other are one prop wearing a disguise. */
const FOOD_RADIUS = 0.055;

/** Trail the food source lays down per 60th of a second at full strength. It is
 *  an order of magnitude above what one agent deposits on purpose: the source
 *  has to out-shout the network to be worth routing to, and it is one cell
 *  against a quarter of a million of them. */
const FOOD_RATE = 0.09;

/** Simulation steps the colony is fast-forwarded through the first time the
 *  loop halts, so a still frame shows a network rather than the noise it grows
 *  from. Two and a half seconds is enough for the veins to close, and it is
 *  paid once, on a path where nothing is being animated anyway. */
const SETTLE_STEPS = 150;

/** Wall-clock ceiling on that fast-forward. It is one blocking stretch on the
 *  main thread, so it is capped at roughly the length of a slow page transition
 *  — long enough to be worth it, short enough not to read as a hang. */
const SETTLE_BUDGET_MS = 300;

const SPAWN_ID: Record<string, number> = { ring: 0, scatter: 1, disc: 2 };

const TAU = 6.283185307179586;

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const vertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const HASH = `
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}`;

const spawnFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform float uSpawn;
uniform float uJitter;
${HASH}

void main() {
  float r1 = hash21(vUv * 313.7 + uJitter);
  float r2 = hash21(vUv * 71.3 + uJitter + 19.0);
  vec2 pos;
  float ang;

  if (uSpawn < 0.5) {
    // A ring facing inward. The population collides with itself at the centre
    // and has to resolve the jam, which is what produces the first branches.
    float t = r1 * ${TAU};
    pos = 0.5 + vec2(cos(t), sin(t)) * (0.36 + (r2 - 0.5) * 0.03);
    ang = t + ${TAU / 2};
  } else if (uSpawn < 1.5) {
    pos = vec2(r1, r2);
    ang = hash21(vUv * 97.1 + uJitter + 41.0) * ${TAU};
  } else {
    // sqrt on the radius, or the disc packs everything into the middle — area
    // grows with r², so a uniform radius is not a uniform disc.
    float t = r1 * ${TAU};
    pos = 0.5 + vec2(cos(t), sin(t)) * (sqrt(r2) * 0.3);
    ang = t;
  }

  fragColor = vec4(pos, ang, 1.0);
}`;

const agentFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uAgents;
uniform sampler2D uTrail;
uniform float uDt;
uniform float uSpeed;
uniform float uSensorDist;
uniform float uSensorAngle;
uniform float uTurn;
uniform float uWander;
uniform float uSeed;
${HASH}

float sense(vec2 pos, float ang, float dist) {
  return texture(uTrail, pos + vec2(cos(ang), sin(ang)) * dist).r;
}

void main() {
  vec4 a = texture(uAgents, vUv);
  vec2 pos = a.xy;
  float ang = a.z;

  float c = sense(pos, ang, uSensorDist);
  float l = sense(pos, ang + uSensorAngle, uSensorDist);
  float r = sense(pos, ang - uSensorAngle, uSensorDist);

  float turn = uTurn * uDt;

  if (c > l && c > r) {
    // Straight on. Doing nothing here is what makes a trail a trail.
  } else if (c < l && c < r) {
    // Both flanks beat the centre: the agent is straddling a ridge and there is
    // no correct answer. A deterministic tie-break would send every straddling
    // agent the same way and the field would grow a grain; a coin flip is the
    // only thing that keeps the network isotropic.
    ang += (hash21(vUv * 511.0 + uSeed) - 0.5) * 2.0 * turn;
  } else if (l > r) {
    ang += turn;
  } else if (r > l) {
    ang -= turn;
  }

  // Wander. Trail-following is pure positive feedback — a vein that wins takes
  // the agents that would have kept its rivals alive, so left alone the colony
  // converges onto two or three trunks and the rest of the field goes black.
  // That collapse is real slime-mould behaviour and it is also a dead
  // background, so the agents are given the noise a real one has: a small random
  // walk on the heading that constantly leaks explorers off the trunk roads into
  // empty space, where they seed the next generation of branches. Exploration
  // against exploitation, and it is the reason this never settles.
  ang += (hash21(vUv * 733.0 + uSeed * 1.7) - 0.5) * 2.0 * uWander * uDt;

  // No term here steers toward the pointer. The attractant is laid into the
  // trail map as food and the colony has to *find* it — sensors pick up the
  // gradient diffusion spreads out from it, and the veins thicken toward your
  // cursor over a few seconds the way they would toward an oat flake. A direct
  // heading force would be instantaneous and would make this a brush.

  // Headings integrate forever. Left unbounded the accumulated angle outgrows
  // float32's fraction and the turn quantises into visible steps after a few
  // minutes on screen — the drift is slow enough to look like a design choice.
  ang = mod(ang, ${TAU});

  pos = fract(pos + vec2(cos(ang), sin(ang)) * uSpeed * uDt);

  fragColor = vec4(pos, ang, 1.0);
}`;

const zeroFragment = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(0.0, 0.0, 0.0, 1.0); }`;

const diffuseFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTrail;
uniform vec2  uTexel;
uniform float uDecay;
uniform float uDiffuse;
uniform vec2  uPointer;
uniform float uFood;
uniform float uFoodRadius;

void main() {
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      sum += texture(uTrail, vUv + vec2(float(x), float(y)) * uTexel).r;
    }
  }
  float here = texture(uTrail, vUv).r;

  // The food source, folded into the pass that already walks every cell rather
  // than costing a draw of its own. Shortest path across the seam, because the
  // field is a torus and a cell at the left edge is adjacent to the right one.
  float food = 0.0;
  if (uFood > 0.0) {
    vec2 d = vUv - uPointer;
    d -= round(d);
    food = uFood * (1.0 - smoothstep(0.0, uFoodRadius, length(d)));
  }
  // Saturating, not unbounded. Deposit is the only source and decay the only
  // sink, so a cell settles at deposit/(1 - decay) — which for any deposit worth
  // seeing is far above one. Unclamped, that number runs to the hundreds and
  // every tone map flattens the whole field to one colour. Clamped, the ratio
  // instead decides *where* the ceiling is reached: a vein carrying fifty agents
  // pins at 1 while open ground a few texels away sits near 0.05, and the
  // structure is legible because it is spatial rather than magnitudinal.
  fragColor = vec4(clamp(mix(here, sum / 9.0, uDiffuse) * uDecay + food, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

// Deposition is the one pass that needs the agents as geometry rather than as a
// field: a point per agent, positioned by reading its own texel back.
const depositVertex = `#version 300 es
in float aIndex;
uniform sampler2D uAgents;
uniform float uSide;

void main() {
  float y = floor(aIndex / uSide);
  vec2 uv = (vec2(aIndex - y * uSide, y) + 0.5) / uSide;
  gl_Position = vec4(texture(uAgents, uv).xy * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

const depositFragment = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform float uDeposit;
void main() {
  // Alpha stays at zero. The blend is additive on every channel, so a nonzero
  // alpha here would ramp the target's alpha toward infinity over a session for
  // a channel nothing ever reads.
  fragColor = vec4(uDeposit, 0.0, 0.0, 0.0);
}`;

const displayFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTrail;
uniform vec2  uResolution;
uniform vec3  uInk;
uniform vec3  uBg;
uniform float uGlow;

void main() {
  float ar = uResolution.x / max(uResolution.y, 1.0);
  // Cover, not stretch. The field is square and the container is not; stretching
  // turns every strand into an ellipse and the anisotropy reads as a bug.
  vec2 k = ar > 1.0 ? vec2(1.0, 1.0 / ar) : vec2(ar, 1.0);
  float t = texture(uTrail, (vUv - 0.5) * k + 0.5).r;

  // The interesting range of a saturating field is its bottom: a fresh strand
  // sits near zero and a trunk sits near one, so a linear ramp spends most of
  // the palette on ground that is merely warm. The curve lifts the faint end
  // and leaves headroom at the top for the glow to mean something.
  float v = 1.0 - exp(-t * 3.4);

  vec3 col = mix(uBg, uInk, v);
  col += uInk * pow(v, 3.0) * uGlow;

  fragColor = vec4(col, 1.0);
}`;

const Mycelium = memo(
  ({
    agentCount = "1M",
    speed = 55,
    sensorDistance = 7,
    sensorAngle = 24,
    turnSpeed = 24,
    wander = 13,
    decay = 0.97,
    diffuse = 0.35,
    deposit = 0.03,
    attract = 0.6,
    spawn = "scatter",
    trailColor = "#a855f7",
    background = "#07060c",
    glow = 0.8,
    paused = false,
    reducedMotion = false,
    className,
  }: MyceliumProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
    const respawnRef = useRef(true);
    const pointer = useRef({ x: 0.5, y: 0.5, on: false });

    const [fallback, setFallback] = useState(false);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
      gl: () => glRef.current,
    });

    const live = useRef({
      speed, sensorDistance, sensorAngle, turnSpeed, wander, decay, diffuse, deposit,
      attract, spawn, trailColor, background, glow,
    });
    live.current = {
      speed, sensorDistance, sensorAngle, turnSpeed, wander, decay, diffuse, deposit,
      attract, spawn, trailColor, background, glow,
    };

    const settleRef = useRef<(() => void) | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (fallback || !container) return;

      const side = AGENT_SIDE[agentCount] ?? 1024;
      const population = side * side;

      let renderer: Renderer;
      try {
        renderer = new Renderer({
          webgl: 2,
          alpha: false,
          antialias: false,
          powerPreference: "high-performance",
          dpr: Math.min(window.devicePixelRatio || 1, 2),
        });
        const probe = renderer.gl as unknown as WebGL2RenderingContext;
        if (!probe.getExtension("EXT_color_buffer_float")) {
          throw new Error("Mycelium requires EXT_color_buffer_float");
        }
      } catch {
        setFallback(true);
        return;
      }

      const glc = renderer.gl;
      const gl2 = glc as unknown as WebGL2RenderingContext;
      glRef.current = gl2;

      const canvas = glc.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      // Out of flow — ogl's setSize writes an explicit pixel width, and in flow
      // that raises the container's min-content width so it never shrinks again.
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      container.appendChild(canvas);

      // Half float, and the choice is about filtering rather than about memory.
      // The three sensors read at fractional offsets, so bilinear is not a nicety
      // — without it agents chase the texel lattice and the network grows on a
      // grid. Linear on a *full* float texture is its own extension
      // (OES_texture_float_linear) and not everywhere; linear on half float is
      // core in WebGL2. The trail is clamped to [0,1], where half float's
      // relative precision is far finer than anything the eye resolves, so the
      // cheaper format is also the more compatible one.
      const makeTrail = () =>
        new RenderTarget(glc, {
          width: FIELD,
          height: FIELD,
          depth: false,
          type: gl2.HALF_FLOAT,
          format: gl2.RGBA,
          internalFormat: gl2.RGBA16F,
          minFilter: gl2.LINEAR,
          magFilter: gl2.LINEAR,
          // The field wraps. Clamping instead would let trail pile up against
          // four walls and the network would grow a frame around itself.
          wrapS: gl2.REPEAT,
          wrapT: gl2.REPEAT,
        });

      // Agent state is data, never a field: NEAREST always, or an agent's
      // position is interpolated with an unrelated neighbour's. Full float here
      // and not half, for the opposite reason the trail is half: near uv 1.0 a
      // half resolves about 4.9e-4, and one texel of a 1024 field is 9.8e-4 —
      // two units in the last place. Agents would quantise onto a lattice and
      // stall against the far edges, which reads as a logic error rather than as
      // the precision problem it is.
      const makeAgents = () =>
        new RenderTarget(glc, {
          width: side,
          height: side,
          depth: false,
          type: gl2.FLOAT,
          format: gl2.RGBA,
          internalFormat: gl2.RGBA32F,
          minFilter: gl2.NEAREST,
          magFilter: gl2.NEAREST,
          wrapS: gl2.CLAMP_TO_EDGE,
          wrapT: gl2.CLAMP_TO_EDGE,
        });

      let trailRead = makeTrail();
      let trailWrite = makeTrail();
      let agentRead = makeAgents();
      let agentWrite = makeAgents();

      const quad = new Triangle(glc);

      const indices = new Float32Array(population);
      for (let i = 0; i < population; i++) indices[i] = i;
      const cloud = new Geometry(glc, { aIndex: { size: 1, data: indices } });

      const spawnProgram = new Program(glc, {
        vertex,
        fragment: spawnFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uSpawn: { value: SPAWN_ID[spawn] ?? 0 },
          uJitter: { value: 0 },
        },
      });

      const agentProgram = new Program(glc, {
        vertex,
        fragment: agentFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uAgents: { value: agentRead.texture },
          uTrail: { value: trailRead.texture },
          uDt: { value: 0 },
          uSpeed: { value: speed / FIELD },
          uSensorDist: { value: sensorDistance / FIELD },
          uSensorAngle: { value: (sensorAngle * Math.PI) / 180 },
          uTurn: { value: turnSpeed },
          uWander: { value: wander },
          uSeed: { value: 0 },
        },
      });

      const diffuseProgram = new Program(glc, {
        vertex,
        fragment: diffuseFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTrail: { value: trailRead.texture },
          uTexel: { value: new Float32Array([1 / FIELD, 1 / FIELD]) },
          uDecay: { value: decay },
          uDiffuse: { value: diffuse },
          uPointer: { value: new Float32Array([0.5, 0.5]) },
          uFood: { value: 0 },
          uFoodRadius: { value: FOOD_RADIUS },
        },
      });

      const depositProgram = new Program(glc, {
        vertex: depositVertex,
        fragment: depositFragment,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        uniforms: {
          uAgents: { value: agentRead.texture },
          uSide: { value: side },
          uDeposit: { value: deposit },
        },
      });
      // Additive, so overlapping strands actually sum. The default alpha blend
      // would make the newest agent the only one that counts.
      depositProgram.setBlendFunc(glc.ONE, glc.ONE);

      const displayProgram = new Program(glc, {
        vertex,
        fragment: displayFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTrail: { value: trailRead.texture },
          uResolution: { value: new Float32Array([1, 1]) },
          uInk: { value: new Float32Array(hexToRgb01(trailColor)) },
          uBg: { value: new Float32Array(hexToRgb01(background)) },
          uGlow: { value: glow },
        },
      });

      const zeroProgram = new Program(glc, {
        vertex,
        fragment: zeroFragment,
        depthTest: false,
        depthWrite: false,
      });

      const zeroMesh = new Mesh(glc, { geometry: quad, program: zeroProgram });
      const spawnMesh = new Mesh(glc, { geometry: quad, program: spawnProgram });
      const agentMesh = new Mesh(glc, { geometry: quad, program: agentProgram });
      const diffuseMesh = new Mesh(glc, { geometry: quad, program: diffuseProgram });
      const displayMesh = new Mesh(glc, { geometry: quad, program: displayProgram });
      const depositMesh = new Mesh(glc, {
        geometry: cloud,
        program: depositProgram,
        mode: glc.POINTS,
        frustumCulled: false,
      });

      type U = Record<string, { value: number | Float32Array | unknown }>;
      const sp = spawnProgram.uniforms as U;
      const ag = agentProgram.uniforms as U;
      const df = diffuseProgram.uniforms as U;
      const dp = depositProgram.uniforms as U;
      const ds = displayProgram.uniforms as U;

      let jitter = 0;
      // Kept inside the unit interval by a golden-ratio walk rather than left to
      // climb. hash21 multiplies its input by ~127 before taking a fraction, so
      // a seed in the thousands has already spent float32's mantissa and every
      // agent draws the same "random" number.
      let seed = 0;

      const respawn = () => {
        sp.uSpawn.value = SPAWN_ID[live.current.spawn] ?? 0;
        sp.uJitter.value = jitter;
        jitter = (jitter + 17.13) % 991;
        // Both halves of each pair, so a swap can never surface an
        // uninitialised target as one frame of garbage.
        renderer.render({ scene: spawnMesh, target: agentRead });
        renderer.render({ scene: spawnMesh, target: agentWrite });
        renderer.render({ scene: zeroMesh, target: trailRead });
        renderer.render({ scene: zeroMesh, target: trailWrite });
      };

      const paint = () => {
        const l = live.current;
        ds.uTrail.value = trailRead.texture;
        (ds.uInk.value as Float32Array).set(hexToRgb01(l.trailColor));
        (ds.uBg.value as Float32Array).set(hexToRgb01(l.background));
        ds.uGlow.value = l.glow;
        renderer.render({ scene: displayMesh });
      };

      let stepsRun = 0;
      let lastDt = 1 / 60;
      const simulate = (step: number) => {
        const l = live.current;
        stepsRun++;
        seed = (seed + 0.6180339887) % 1;

        ag.uAgents.value = agentRead.texture;
        ag.uTrail.value = trailRead.texture;
        ag.uDt.value = step;
        ag.uSpeed.value = l.speed / FIELD;
        ag.uSensorDist.value = l.sensorDistance / FIELD;
        ag.uSensorAngle.value = (l.sensorAngle * Math.PI) / 180;
        ag.uTurn.value = l.turnSpeed;
        ag.uWander.value = l.wander;
        ag.uSeed.value = seed;

        renderer.render({ scene: agentMesh, target: agentWrite });
        let t = agentRead;
        agentRead = agentWrite;
        agentWrite = t;

        // Decay is quoted per 60th of a second, so the look survives a 30 Hz
        // display. Multiplying by dt instead would make the same control mean
        // two different things on two different machines.
        df.uTrail.value = trailRead.texture;
        df.uDecay.value = Math.pow(l.decay, step * 60);
        df.uDiffuse.value = l.diffuse;
        df.uFood.value = pointer.current.on ? l.attract * FOOD_RATE * step * 60 : 0;
        const p = df.uPointer.value as Float32Array;
        p[0] = pointer.current.x;
        p[1] = pointer.current.y;
        renderer.render({ scene: diffuseMesh, target: trailWrite });

        // Deposit lands on the freshly blurred field, and must not clear it.
        dp.uAgents.value = agentRead.texture;
        dp.uDeposit.value = l.deposit * step * 60;
        renderer.render({ scene: depositMesh, target: trailWrite, clear: false });

        t = trailRead;
        trailRead = trailWrite;
        trailWrite = t;
      };

      // A halted colony has to arrive already grown. The frame after seeding is
      // undifferentiated noise — it is the *loop* that turns it into a network,
      // so anyone who asked for no motion would otherwise be shown a purple fog
      // and nothing else, permanently.
      //
      // It cannot be decided at mount. `usePrefersReducedMotion` reports false
      // on the first render and only tells the truth from an effect, so a latch
      // taken during setup reads "not halted" for exactly the person this is
      // for. Instead it runs the first time the loop is actually stopped, and
      // counts what the loop has already drawn — so pausing something you have
      // been watching for a minute costs nothing.
      settleRef.current = () => {
        if (stepsRun >= SETTLE_STEPS) return;
        if (respawnRef.current) {
          respawn();
          respawnRef.current = false;
        }
        // Whether this machine can afford the fast-forward at all, judged by
        // what the loop has already been managing. A deadline alone is not
        // enough: it can only be checked *between* steps, and where a single
        // step costs seconds — a million agents on a software GL implementation,
        // which is exactly what the loop verifier runs — the first one has
        // already frozen the tab before anything gets to say stop. The frame
        // delta the host hands us is the honest signal, and below about twenty
        // frames a second the answer is to show the seed and leave the machine
        // alone.
        if (lastDt > 1 / 20) {
          paint();
          return;
        }
        const deadline = performance.now() + SETTLE_BUDGET_MS;
        while (stepsRun < SETTLE_STEPS && performance.now() < deadline) {
          simulate(1 / 60);
        }
        paint();
      };

      drawRef.current = (dt) => {
        if (respawnRef.current) {
          respawn();
          respawnRef.current = false;
        }
        // Clamped, not raw. The host already caps dt, but a single long frame
        // still teleports an agent past several sensor distances, and an agent
        // that jumps its own sensor range is navigating by a trail it never
        // laid — the network tears.
        lastDt = dt > 0 ? dt : lastDt;
        simulate(Math.min(dt, 1 / 30));
        paint();
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        const res = ds.uResolution.value as Float32Array;
        res[0] = glc.drawingBufferWidth;
        res[1] = glc.drawingBufferHeight;
        // Display only. The field is untouched — that is the point of holding
        // the simulation apart from the canvas.
        paint();
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback, agentCount]);

    // Grow the colony on demand the moment the loop stops, so a still frame is
    // the network rather than the noise it starts from.
    useEffect(() => {
      if (!(paused || reducedMotion)) return;
      settleRef.current?.();
    }, [paused, reducedMotion]);

    // Re-seed the population. paint() is what makes it visible while paused —
    // the frame body does the work, the host just runs one.
    useEffect(() => {
      respawnRef.current = true;
      loop.paint();
    }, [spawn, loop]);

    useEffect(() => {
      loop.paint();
    }, [trailColor, background, glow, loop]);

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const nx = (e.clientX - r.left) / r.width;
      // GL uv runs from the bottom; the pointer runs from the top.
      const ny = 1 - (e.clientY - r.top) / r.height;
      const ar = r.width / r.height;
      pointer.current.x = (nx - 0.5) * (ar > 1 ? 1 : ar) + 0.5;
      pointer.current.y = (ny - 0.5) * (ar > 1 ? 1 / ar : 1) + 0.5;
      pointer.current.on = true;
      loop.start();
    };
    const release = () => {
      pointer.current.on = false;
    };

    if (fallback) {
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor: background,
            backgroundImage: `radial-gradient(ellipse 40% 22% at 34% 42%, ${trailColor}3a 0%, transparent 70%), radial-gradient(ellipse 30% 34% at 66% 58%, ${trailColor}2e 0%, transparent 70%), radial-gradient(circle at 50% 50%, ${trailColor}22 0%, transparent 62%)`,
          }}
        />
      );
    }

    // The canvas is appended by ogl, so the touch lock is scoped to it through
    // the container: a finger drag steers the swarm and the page stays put.
    return (
      <div
        ref={containerRef}
        className={`[&_canvas]:touch-none ${className ?? "relative h-full w-full overflow-hidden"}`}
        onPointerMove={track}
        onPointerLeave={release}
        onPointerCancel={release}
      />
    );
  },
);

Mycelium.displayName = "Mycelium";

export default Mycelium;
