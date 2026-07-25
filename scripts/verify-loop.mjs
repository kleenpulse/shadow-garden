/**
 * Visual verification for entries on the animation runtime host (SPEC §V.V1/V2).
 *
 *   bun run build && bun run start          # in one shell
 *   bun run verify:loop side-rays threads   # in another
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
 *   2. resizing the container resizes that backing store   (V1)
 *   3. a resize WHILE PAUSED still repaints                (V2)
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
    // Headless has no real GPU and every one of these entries is a shader.
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
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
  };
})()`;

const CLICK_PAUSE = `(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'pause');
  if (!b) return false;
  b.click();
  return true;
})()`;

let failures = 0;

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
  check(
    initial !== null && initial.w > 0 && initial.h > 0,
    "canvas has a backing store",
    initial ? `${initial.w}x${initial.h}` : "no canvas found",
  );
  if (!initial) return;

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

  const paused = await evaluate(sessionId, CLICK_PAUSE);
  check(paused === true, "pause control found and clicked");
  await sleep(900);

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

console.log(
  failures === 0
    ? `\n${slugs.length} entr${slugs.length === 1 ? "y" : "ies"} verified. Frames in ${OUT}\n`
    : `\n${failures} failure(s). Frames in ${OUT}\n`,
);
process.exit(failures === 0 ? 0 : 1);
