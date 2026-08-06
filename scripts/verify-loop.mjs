/**
 * Visual verification for entries on the animation runtime host (SPEC §V.V1/V2).
 *
 *   bun run build && bun run start          # in one shell
 *   bun run verify:loop side-rays waves   # in another
 *
 * Zero dependencies: Node's native fetch and WebSocket drive headless Chrome
 * over CDP directly. Set CHROME_PATH to override browser discovery.
 *
 * Why this exists: V1 and V2 are the two invariants nothing else can reach.
 * `tsc` and check:registry cannot see whether a canvas actually repaints, and
 * §B.B1/B2 are both bugs that only appear on screen. This drives a real browser
 * with real WebGL and asserts:
 *
 *   1. the canvas has a non-zero backing store after load
 *   2. the loop KEEPS drawing, frame after frame            (V20)
 *   3. resizing the container resizes that backing store   (V1)
 *   4. a resize WHILE PAUSED still repaints                (V2)
 *
 * Check 2 was missing until §B.B7, and its absence is why that bug shipped: a
 * loop that renders exactly one frame and then halts passes every other
 * assertion here. The single frame satisfies "not blank", and the halted
 * repaint path is precisely what V2 exercises. Nineteen entries were frozen and
 * this script called them verified.
 *
 * Blankness is judged from the composited screenshot's byte size — a cleared
 * buffer compresses to almost nothing, a rendered shader does not. Frames are
 * written next to the run so they can be eyeballed as well as asserted.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const slugs = process.argv.slice(2);
if (slugs.length === 0) {
  console.error("usage: bun run verify:loop <slug> [slug…]");
  process.exit(2);
}

const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => existsSync(p));

if (!CHROME) {
  console.error("No Chrome found. Set CHROME_PATH.");
  process.exit(2);
}

const PORT = Number(process.env.CDP_PORT ?? 9333);
const ORIGIN = process.env.VERIFY_ORIGIN ?? "http://localhost:3000";
const OUT = join(tmpdir(), "shadow-garden-verify-loop");
mkdirSync(OUT, { recursive: true });

/** Below this a PNG is a flat fill — i.e. the buffer was cleared and not redrawn. */
const NOT_BLANK_BYTES = 20000;

/** How long to watch a running loop, and the fewest draw calls that window must
 *  produce.
 *
 *  This is a liveness assertion, NOT a frame-rate one, and the floor is low on
 *  purpose. Headless runs on swiftshader with no GPU, where a heavy raymarched
 *  shader manages single-digit fps — waves and aurora legitimately draw 6–7
 *  times a second here. A frozen loop, by contrast, draws exactly zero more
 *  times no matter how long you watch. The signal is zero-versus-nonzero, so
 *  widen the window rather than raise the bar. */
const CONTINUITY_MS = 2000;
const MIN_DRAWS = 3;

/** Entries whose continuity cannot be judged on swiftshader. Skipped loudly, not
 *  quietly passed — an expected failure trains people to ignore the whole run,
 *  which is how §B.B6 went unnoticed for weeks. Verified with VERIFY_GPU=1. */
const NEEDS_GPU = new Map([
  [
    "black-hole",
    "WebGL2 float render targets — swiftshader links the shaders and reports no error, then issues no draws at all (630/2s on a real GPU)",
  ],
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(OUT, "chrome-profile")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1400,900",
    // Headless has no real GPU and every one of these entries is a shader, so
    // swiftshader is the portable default. VERIFY_GPU=1 hands the run to the
    // real driver instead — needed when an entry uses a WebGL2 feature
    // swiftshader implements poorly, where a software failure would otherwise
    // read as a frozen loop.
    ...(process.env.VERIFY_GPU === "1"
      ? []
      : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
    "about:blank",
  ],
  { stdio: "ignore" },
);

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}, sessionId) {
  const id = nextId++;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 30000);
  });
}

async function evaluate(sessionId, expression) {
  const r = await send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.text}`);
  return r.result?.value;
}

async function shot(sessionId, slug, name) {
  const r = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  const buf = Buffer.from(r.data, "base64");
  writeFileSync(join(OUT, `${slug}-${name}.png`), buf);
  return buf.length;
}

// Draw calls are counted PER CANVAS, tagged onto the element itself, not into a
// single page-wide total. The sidebar renders its own live canvases, so a global
// counter would keep climbing while the entry under test sat frozen — the exact
// false pass this check exists to prevent.
//
// Installed via Page.addScriptToEvaluateOnNewDocument so the patch is in place
// before any component script runs and survives every navigation.
const DRAW_INSTRUMENT = `(() => {
  if (window.__sgDrawPatched) return;
  window.__sgDrawPatched = true;
  const patch = (proto, names) => {
    if (!proto) return;
    for (const name of names) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      proto[name] = function (...args) {
        const c = this.canvas;
        if (c) c.__sgDraws = (c.__sgDraws || 0) + 1;
        return original.apply(this, args);
      };
    }
  };
  patch(window.WebGLRenderingContext && WebGLRenderingContext.prototype,
        ['drawArrays', 'drawElements']);
  patch(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype,
        ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']);
  patch(window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype,
        ['clearRect', 'fillRect', 'drawImage', 'stroke', 'fill', 'putImageData']);
})()`;

// The largest canvas, not the first: the sidebar renders thumbnail canvases that
// come earlier in document order, and measuring one of those would silently
// report "no resize happened" for every entry.
//
// Fixed-position canvases are excluded. The intro overlay is a full-viewport
// fixed canvas that only appears on a first visit, so it wins "largest" on a
// fresh browser profile — measuring it made an entry look like it resized when
// it never did. That produced one false pass before this filter existed.
const CANVAS_PROBE = `(() => {
  const fixed = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (getComputedStyle(n).position === 'fixed') return true;
    }
    return false;
  };
  const all = [...document.querySelectorAll('canvas')].filter((c) => !fixed(c));
  if (all.length === 0) return null;
  const c = all.reduce((best, x) => {
    const a = x.getBoundingClientRect();
    const b = best.getBoundingClientRect();
    return a.width * a.height > b.width * b.height ? x : best;
  });
  const r = c.getBoundingClientRect();
  const p = c.parentElement ? c.parentElement.getBoundingClientRect() : r;
  return {
    w: c.width, h: c.height,
    cssW: Math.round(r.width), cssH: Math.round(r.height),
    parentW: Math.round(p.width), parentH: Math.round(p.height),
    count: all.length,
    draws: c.__sgDraws || 0,
    // Every canvas on the page, for diagnosis: a measured canvas sitting at zero
    // while the page total climbs means the probe picked the wrong element.
    pageDraws: [...document.querySelectorAll('canvas')]
      .reduce((n, x) => n + (x.__sgDraws || 0), 0),
  };
})()`;

// Not every loop host paints to a canvas. `ledger` and `teletype` run on the
// same runtime and write to the DOM, where "keeps drawing" has no draw call to
// count — so the equivalent liveness signal is mutation traffic inside the
// preview stage, and the two backing-store invariants (V1/V2) simply do not
// apply: a DOM component reflows natively and there is no buffer to leave
// cleared. Reported as N/A rather than passed, so a run can never be read as
// having checked something it structurally cannot.
//
// Scoped to `[data-preview-stage]`, never the document: the shell animates its
// own chrome, and a page-wide observer would keep counting while the entry
// under test sat frozen — the same false pass the per-canvas draw counter above
// exists to prevent.
const DOM_INSTRUMENT = `(() => {
  const stage = document.querySelector('[data-preview-stage]');
  if (!stage) return false;
  if (window.__sgDomObserver) window.__sgDomObserver.disconnect();
  window.__sgDom = 0;
  window.__sgDomObserver = new MutationObserver((records) => {
    window.__sgDom += records.length;
  });
  window.__sgDomObserver.observe(stage, {
    childList: true, subtree: true, characterData: true, attributes: true,
  });
  return true;
})()`;

const DOM_PROBE = `(() => {
  const stage = document.querySelector('[data-preview-stage]');
  if (!stage) return null;
  const r = stage.getBoundingClientRect();
  return {
    w: Math.round(r.width),
    h: Math.round(r.height),
    mutations: window.__sgDom || 0,
    text: (stage.innerText || '').trim().length,
  };
})()`;

const CLICK_PAUSE = `(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'pause');
  if (!b) return false;
  b.click();
  return true;
})()`;

let failures = 0;
let skipped = 0;

function check(ok, label, detail) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Poll until `ok(probe)` holds, so heavy entries are not judged mid-init. */
async function settle(sessionId, ok, budgetMs = 20000) {
  const deadline = Date.now() + budgetMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(sessionId, CANVAS_PROBE);
    if (last && ok(last)) return last;
    await sleep(400);
  }
  return last;
}

/** The DOM half of §V20 — same runtime host, no canvas to count draws on. */
async function verifyDom(sessionId, slug) {
  const armed = await evaluate(sessionId, DOM_INSTRUMENT);
  check(armed === true, "preview stage found", armed ? "DOM loop host" : "no [data-preview-stage]");
  if (!armed) return;

  const start = await evaluate(sessionId, DOM_PROBE);
  check(
    start.w > 0 && start.h > 0 && start.text > 0,
    "stage rendered content",
    `${start.w}x${start.h}, ${start.text} chars`,
  );
  check(
    (await shot(sessionId, slug, "1-initial")) > NOT_BLANK_BYTES,
    "initial frame is not blank",
  );

  const before = await evaluate(sessionId, DOM_PROBE);
  await sleep(CONTINUITY_MS);
  const later = await evaluate(sessionId, DOM_PROBE);
  const moved = later.mutations - before.mutations;
  check(
    moved >= MIN_DRAWS,
    "V20 — loop keeps mutating the stage",
    `${moved} mutations in ${CONTINUITY_MS}ms (need ${MIN_DRAWS})`,
  );

  const paused = await evaluate(sessionId, CLICK_PAUSE);
  check(paused === true, "pause control found and clicked");
  await sleep(900);

  // Asserted here, unlike the canvas path. A DOM host has no buffer to ease to
  // a stop in: once the runtime halts, nothing writes to the tree at all, so a
  // non-zero count is a loop that ignored the pause.
  const pausedFrom = await evaluate(sessionId, DOM_PROBE);
  await sleep(700);
  const pausedTo = await evaluate(sessionId, DOM_PROBE);
  check(
    pausedTo.mutations - pausedFrom.mutations === 0,
    "pause actually halts the loop",
    `${pausedTo.mutations - pausedFrom.mutations} mutations in 700ms while paused`,
  );

  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 900, height: 760, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await sleep(900);
  const resized = await evaluate(sessionId, DOM_PROBE);
  check(
    resized.w > 0 && resized.w !== start.w,
    "stage followed the viewport resize",
    `${start.w}px -> ${resized.w}px`,
  );
  check(
    (await shot(sessionId, slug, "2-resized-while-paused")) > NOT_BLANK_BYTES,
    "still rendered after resizing while paused",
  );
  console.log("  n/a   V1/V2 — no backing store on a DOM host; reflow is the browser's");
}

async function verify(sessionId, slug) {
  console.log(`\n${slug}`);
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Page.navigate", { url: `${ORIGIN}/components/${slug}` }, sessionId);
  await sleep(2500); // load + IntersectionObserver + async GL init

  // Wait for a laid-out container with a sized canvas rather than a fixed
  // sleep — the fluid sims take markedly longer than the shader entries, and a
  // fixed wait judged them mid-init.
  const initial = await settle(
    sessionId,
    (p) => p.parentW > 0 && p.w > 0 && Math.abs(p.cssW - p.parentW) <= 2,
  );

  // No canvas at all means a DOM loop host, not a broken WebGL entry. A broken
  // shader still renders its <canvas> element — it is in the JSX either way —
  // and keeps failing the assertions below on a zero backing store or zero
  // draws. Absence of the element is the discriminator, and it is the only one
  // that cannot be faked by a component that is merely not working.
  if (initial === null) {
    await verifyDom(sessionId, slug);
    return;
  }

  check(
    initial.w > 0 && initial.h > 0,
    "canvas has a backing store",
    `${initial.w}x${initial.h}`,
  );

  check(
    (await shot(sessionId, slug, "1-initial")) > NOT_BLANK_BYTES,
    "initial frame is not blank",
  );

  // A canvas still at its 300x150 default, or otherwise not filling its
  // container, means the first measure never landed. A zero-sized container is
  // a failure too, not a free pass — it means nothing ever laid out.
  check(
    initial.parentW > 0 &&
      initial.parentH > 0 &&
      Math.abs(initial.cssW - initial.parentW) <= 2 &&
      Math.abs(initial.cssH - initial.parentH) <= 2,
    "canvas fills its container",
    `canvas ${initial.cssW}x${initial.cssH} vs container ${initial.parentW}x${initial.parentH}`,
  );

  // V20 — the loop must still be drawing, not showing one stranded frame.
  const gpuOnly = NEEDS_GPU.get(slug);
  if (gpuOnly && process.env.VERIFY_GPU !== "1") {
    console.log(`  SKIP  V20 — needs VERIFY_GPU=1 — ${gpuOnly}`);
    skipped++;
  } else {
    const before = await evaluate(sessionId, CANVAS_PROBE);
    await sleep(CONTINUITY_MS);
    const later = await evaluate(sessionId, CANVAS_PROBE);
    // A negative delta means the canvas element was swapped mid-window (a
    // re-init), not that drawing went backwards — say so rather than fail on it.
    const drawn = later && before ? later.draws - before.draws : -1;
    check(
      drawn >= MIN_DRAWS,
      "V20 — loop keeps drawing",
      drawn < 0
        ? "canvas was replaced mid-measurement"
        : `${drawn} draw calls in ${CONTINUITY_MS}ms (need ${MIN_DRAWS}); page total +${
            later.pageDraws - before.pageDraws
          }`,
    );
  }

  const paused = await evaluate(sessionId, CLICK_PAUSE);
  check(paused === true, "pause control found and clicked");
  await sleep(900);

  // The other half of the halt path. Reported, not asserted: an entry may ease
  // to a stop over its own timescale, and light-rays halts on raysSpeed rather
  // than on `paused` at all. A number here that never settles is worth a look.
  const pausedFrom = await evaluate(sessionId, CANVAS_PROBE);
  await sleep(700);
  const pausedTo = await evaluate(sessionId, CANVAS_PROBE);
  const whilePaused =
    pausedTo && pausedFrom ? pausedTo.draws - pausedFrom.draws : -1;
  console.log(`  note  ${whilePaused} draw calls in 700ms while paused`);

  await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 760, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(600);

  // Poll rather than sleep: a debounced entry needs longer than an undebounced
  // one, and a fixed wait made the heavier entries flake.
  const after = await settle(sessionId, (p) => p.w !== initial.w, 8000);
  check(
    after !== null && after.w !== initial.w,
    "V1 — backing store followed the container resize",
    after ? `${initial.w}x${initial.h} -> ${after.w}x${after.h}` : "no canvas",
  );

  const bytes = await shot(sessionId, slug, "2-resized-while-paused");
  check(
    bytes > NOT_BLANK_BYTES,
    "V2 — repainted while paused, not a cleared buffer",
    `${bytes} B`,
  );
}

try {
  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      version = await (await fetch(`http://localhost:${PORT}/json/version`)).json();
      break;
    } catch {
      await sleep(300);
    }
  }
  if (!version) throw new Error("chrome debugger never came up");

  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: DRAW_INSTRUMENT },
    sessionId,
  );

  for (const slug of slugs) {
    try {
      await verify(sessionId, slug);
    } catch (err) {
      console.log(`  ERROR  ${slug}: ${err.message}`);
      failures++;
    }
  }
} catch (err) {
  console.log(`  ERROR  ${err.message}`);
  failures++;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
}

// Skips are surfaced in the summary, not just mid-scroll, so a run can never be
// read as "everything checked" when a V20 assertion was stood down.
const note =
  skipped > 0 ? ` ${skipped} V20 check(s) SKIPPED — re-run with VERIFY_GPU=1.` : "";
console.log(
  failures === 0
    ? `\n${slugs.length} entr${slugs.length === 1 ? "y" : "ies"} verified.${note} Frames in ${OUT}\n`
    : `\n${failures} failure(s).${note} Frames in ${OUT}\n`,
);
process.exit(failures === 0 ? 0 : 1);
