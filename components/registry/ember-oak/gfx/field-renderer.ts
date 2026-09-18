import { FRAGMENT_SHADER, VERTEX_SHADER } from "./field-shader";

// A single-quad WebGL2 renderer for the field shader.
//
// Deliberately not a library. Three.js and OGL are both excellent and both are
// several orders of magnitude more than "draw one full-screen triangle with one
// fragment shader" needs — and a template's dependency list is something a buyer
// has to agree to before they can paste it. This is the whole of the machinery:
// compile, bind a quad, set five uniforms, draw.

export interface FieldOptions {
  /** 0..1 dial selecting palette and turbulence. See PRESETS. */
  preset: number;
  /** 0..1, for surfaces scrubbed by scroll rather than looped by time. */
  progress?: number;
  /** Motion scale. 0 freezes the image without tearing down the context. */
  motion?: number;
}

interface Uniforms {
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  preset: WebGLUniformLocation | null;
  progress: WebGLUniformLocation | null;
  motion: WebGLUniformLocation | null;
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // Surfaced rather than swallowed: a silent shader failure looks exactly like
    // a blank section, which is the hardest kind of bug to find later.
    console.error("field shader:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export class FieldRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniforms: Uniforms | null = null;
  private options: FieldOptions;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement, options: FieldOptions) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      // The field is opaque and fills its surface, so the compositor can skip
      // whatever is behind it.
      alpha: false,
      // Nothing here reads back the framebuffer, and not preserving it lets the
      // driver discard rather than copy between frames.
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.options = options;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("field program:", gl.getProgramInfoLog(program));
      return;
    }
    // The shaders are linked into the program; the objects themselves are done.
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    this.program = program;

    // One triangle covering the viewport, not two making a quad: it rasterises in
    // a single pass with no diagonal seam and no shared-edge overdraw.
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const location = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.uniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      preset: gl.getUniformLocation(program, "uPreset"),
      progress: gl.getUniformLocation(program, "uProgress"),
      motion: gl.getUniformLocation(program, "uMotion"),
    };
  }

  get ready(): boolean {
    return this.program !== null;
  }

  set(options: Partial<FieldOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Size the drawing buffer.
   *
   * `width`/`height` are CSS pixels from the element's own box — never from
   * `window`, which inside an embedded frame reports a viewport that has nothing
   * to do with how large this surface actually is.
   *
   * Device pixel ratio is capped at 2. Beyond that the field is indistinguishable
   * and the fragment count is not: a 3x display would be rendering nine times the
   * pixels of a 1x one for no visible gain.
   */
  resize(width: number, height: number): void {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.gl.canvas.width = w;
    this.gl.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  render(timeMs: number): void {
    const { gl, program, uniforms } = this;
    if (!program || !uniforms) return;

    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(uniforms.resolution, this.width, this.height);
    gl.uniform1f(uniforms.time, timeMs * 0.001);
    gl.uniform1f(uniforms.preset, this.options.preset);
    gl.uniform1f(uniforms.progress, this.options.progress ?? 0);
    gl.uniform1f(uniforms.motion, this.options.motion ?? 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /**
   * Release the context.
   *
   * Browsers cap live WebGL contexts at roughly sixteen, and this template mounts
   * one per surface. Without an explicit loss the oldest contexts get reclaimed
   * out from under components that are still on screen.
   */
  dispose(): void {
    const ext = this.gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
    this.program = null;
    this.uniforms = null;
    this.vao = null;
  }
}
