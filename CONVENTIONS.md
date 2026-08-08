# Conventions

The rules that keep the catalog consistent. Most of them exist because the bug they prevent already happened once. For project structure and the PR flow, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Stack — fixed, don't swap

- Next.js 16 App Router with Cache Components / PPR **on**. React 19. TypeScript strict. Bun.
- Tailwind v4 CSS-first — **no config file**; all tokens live in `app/globals.css`.
- nuqs (tuned control values in the URL), Shiki (server-side highlight), Zustand (chrome UI state), motion/react, gsap, ogl, cmdk, react-colorful, next-themes, shadcn/Radix.
- `cn` from `lib/utils.ts` (clsx + tailwind-merge).
- Anything that reads cookies or the URL (the Code panel, the live workspace via nuqs) **must** render inside `<Suspense>`, or the Cache Components build breaks ("uncached data outside Suspense").

## Design tokens — bench identity

The shell is a dark graphite instrument bench with one Amethyst accent. Mono display and readouts (Space Mono), Geist body. The shell stays chromatically quiet; the live previews supply the color.

- Semantic roles are runtime `--sg-*` CSS variables on `:root` (light) / `.dark` (dark), re-exposed to utilities via `@theme inline`. The static graphite ramp `--color-bench-*` stays in `@theme`.
- Style with the semantic utilities: `bg-surface` / `bg-panel` / `bg-raised`, `border-hairline`, `text-ink` / `-dim` / `-mute`, `text-accent`, `text-on-accent`.
- **Never** hardcode `bench-950`, white, or black on a themed surface — it breaks light mode.
- `.shiki-wrap` stays graphite in **both** themes. Shiki highlights with a dark theme, so its tokens are only legible on dark; don't make the code surface theme-aware.
- Full keyboard access on the sidebar and every control.

## shadcn — never run `shadcn init`

`shadcn init` injects a rival `--color-accent` and a duplicate `@custom-variant dark` into `globals.css`, killing the purple accent. shadcn is already configured (`components.json`). To add a primitive, vendor its source into `components/ui/` and restyle it to bench tokens (`bg-panel`, `border-hairline`, `text-ink`, amethyst `focus:bg-accent/15`). Reference: `components/ui/select.tsx`.

## Icons — one package, ever

`lucide-react` is the only icon dependency permitted in `package.json` or in any registry entry's `dependencies` array. That array is customer-facing install instructions — a second icon library bills every user for a package they need one glyph from.

Two kinds of glyph are authored in-repo instead of imported:

- **Brand marks** lucide refuses to ship (it dropped brand logos in v1.0.1).
- **Glyphs whose geometry has to animate** — a lucide icon is a frozen `d` string, and a state morph needs the shape split into parts that transform independently.

Both live in `components/icons/<name>.tsx` as a `forwardRef` SVG on lucide's grid: `viewBox="0 0 24 24"`, `width={24} height={24}`, `stroke="currentColor"`, `strokeWidth={2}`, round cap/join — never the artwork's native dimensions, which paint at full size before CSS lands. An animated glyph stays **one** component driven by one boolean prop: never crossfade two lucide icons, never interpolate mismatched `d` strings, never add a morph plugin. References: `components/icons/github.tsx` (brand), `components/icons/cook-book.tsx` (animated).

## The registry contract

- Each tunable prop is one `PropSchema` in the component's entry under `lib/registry/categories/<category>.ts`. It drives **both** the Controls panel and the Props API table — props docs are never written twice.
- An entry's `dependencies` array is the **transitive import closure of every declared variant**, not the component file's own imports. A shipped file that imports `@/lib/utils` or a sibling must declare that file as a variant too (`role: "util"` / `"peer"`), and the peer's own packages (`clsx`, `tailwind-merge`) are the host entry's to declare. Previews are outside the closure by design — a package only the preview imports is over-declaration and fails `check:registry`.
- Anything served to a user of the showcase must be **shippable on its own**. `lib/utils.ts` ships behind every `cn` import, so shell-only helpers do not live in it (`displayName` sits in `lib/display-name.ts` for exactly this reason).
- Shipped source is served with comments stripped (`lib/registry/strip-comments.ts`), so the checked-in component keeps its "why" notes while the Code tab, copy button, and AI prompt serve bare source. Tool directives (`eslint-*`, `@ts-*`, `prettier-ignore`) survive on purpose. If you touch the stripper, run `bun run check:strip`.
- Anything that varies by prop kind lives in `lib/registry/kinds.ts` (`KIND_TABLE`, keyed by `PropKind`). It stays free of React/nuqs so `scripts/registry/` can import it under plain `bun`. The two framework-bound tables (`CONTROLS` in `ControlsPanel.tsx`, `PARSERS` in `useTunedProps.ts`) are `satisfies`-checked `Record<PropKind, …>`, so a new kind is a compile error at all three tables, never a silent hole.

## Animation loops

- Every animation component drives its loop through `hooks/use-animation-loop.ts` and ships the hook as a second variant with `role: "hook"`. Raw `requestAnimationFrame` / `new ResizeObserver` inside `components/registry/` fails `check:registry`.
- `onFrame` halts on a **literal `false`**; returning nothing means keep going. Never coalesce the draw call: `drawRef.current?.(dt) ?? false` reads as a null-guard but hands the host its halt signal on every successful frame, freezing the component after one. Write `drawRef.current ? drawRef.current(dt) : false`. The `no-nullish-halt` rule fails the build on both `??` and `||` forms.
- Canvas/WebGL components observe their container with a ResizeObserver and repaint on resize even while the loop is halted — a paused canvas that goes blank on window resize reads as broken.
- `bun run verify:loop <slug>` is the only check that can see a canvas actually moving — it counts draw calls over 2 seconds. It needs the dev server up.

## Touch and drag

A component whose **drag or finger-track drives the effect** sets `touch-action: none` on its hit target, inline in the component so copied source carries it:

- `touch-none` on the JSX `<canvas>`,
- `[&_canvas]:touch-none` on the container when the canvas is appended imperatively,
- `touch-none` on the root when the surface is DOM.

Without it, a finger drag scrolls the page instead of driving the effect. Bind `pointermove`, never `mousemove` — a touch drag emits no mouse events, so a mouse-only binding is inert on a phone.

If the drag surface holds **text**, it also needs `select-none`: a drag across text selects it, a press that starts on selected text starts a native drag-and-drop, and the browser answers with `pointercancel` — motion abandons the gesture mid-throw and the element stops dead under a still-moving cursor.

## 3D scenes ship camera controls

A rotating solid you cannot turn is a video. Every component that renders a 3D scene ships pointer orbit controls: horizontal drag → yaw, vertical drag → pitch, momentum on release, pitch clamped short of the poles.

Two things are always wrong the first time, and both are silent:

- **The vertical sign.** Screen `y` grows downward while pitch grows upward. Which way to correct it depends on what you rotate: negate when the shader moves the **camera** (`ro.yz *= rot(pitch)`), do **not** negate when it moves the **geometry** (`p.yz *= rot(pitch)`). Verify by dragging down: the top of the object should come toward you.
- **The drag needs `touch-action: none`** (see above), or a finger scrolls the page.

Auto-rotation resumes only when nothing is held. Orbit state lives in a **ref** written from the loop, never in React state. Where the pointer already drives something else (e.g. hover repels particles), bind the orbit to **drag** and leave hover to the effect — sharing one gesture means every attempt to look around also disturbs what you are looking at. References: `ascii-engine`, `swarm`.

## motion + SVG traps

- **Never seed an SVG child's opacity through `style`.** motion animates SVG `opacity` as an attribute, and CSS beats a presentation attribute — motion writes `opacity="1"` next to your `style="opacity:0"` with no warning, the value animates correctly in the DOM, and nothing appears on screen. Let `initial` set it. Transforms are safe (motion writes the same `style.transform` channel).
- motion overwrites `transformOrigin` with `50% 50%`, so set an SVG pivot with `transformBox: "view-box"` — against the view-box, 50% is the middle of the 24-unit grid; against the default `fill-box` it's the middle of each shape's own bounding box, which drifts as the shape scales.

## Shader lifetime

Time-driven shaders decay over their lifetime if unbounded:

- Differential-rotation winding aliases into moiré — cap the accumulated shear.
- Unbounded `uTime` rots float32 precision — reduce time-like uniforms mod 2π and keep noise coordinates bounded.

## JS-measured layout (Masonry)

`components/registry/masonry/` is the only component that measures the DOM and writes positions back. If you touch it — or write anything like it — every line below is load-bearing:

- **Pack synchronously in `useLayoutEffect`**, never in the ResizeObserver or a rAF. React runs a child's layout effect before any parent's passive effect, which is the only reason a parent's `scrollIntoView` measures final geometry. RO and rAF handle async height change only (images, fonts, text rewrap).
- **All reads, then all writes.** Measure every item in one pass, position in a second. Interleaving forces a full layout per item.
- **The container's ResizeObserver reacts to width only.** Its height is what the pack just wrote; reacting to it is a feedback loop.
- **Tie-break on strictly shorter.** `<=` lets two equal columns trade an item back and forth on every repack.
- **Stagger is `transition-delay`, not `setTimeout`.** A timer cancelled by an effect re-run mid-flight strands an item at `opacity: 0` forever.
- **No negative `rootMargin` on the reveal observer, and cap the stagger index** — otherwise the last row of a page that can't scroll further never intersects and stays invisible.
- **A reveal that rises fights any jump to an anchor inside it.** Settle the target first (`settleMasonryReveal(el)`), then measure.
- **`reducedMotion` is not optional** on a component that hides its own content. Anything wired to `usePrefersReducedMotion` must actually pass it down.
- **`will-change: transform` lives exactly as long as the tween**, cleared on a timer — `transitionend` doesn't fire for a cancelled transition.
- **`contain: layout style`, never `paint`** — `paint` clips rings/shadows at the container edge. `overflow-anchor: none` too.
- **`content-visibility: auto` is rejected, permanently.** Offscreen items report a placeholder size — a lie the measurement pass cannot detect.
- **One parent, `transform` to move.** Reparenting an item across DOM columns is a remount — focus, playing media, and local state die on resize. One parent also keeps DOM order equal to reading order.
- **Depend on a key signature, not `children` identity**, or every parent keystroke buys a full forced-layout remeasure.
- Zero-width container → bail without writing.

## Build & install

- `bun run build` must stay PPR-clean (◐ Partial Prerender, no Cache Components violations).
- A dev server usually runs on `:3000`. Don't run `bun run build` while it runs — they fight over `.next`. Stop the dev server first.
- Don't run `bun install` / `bun add` while the dev server runs — the bundler compiles half-written `node_modules` mid-install, producing phantom parse errors in Next internals and Fast Refresh loops. Stop dev, install, restart; if it happened anyway, delete `.next` before restarting.
- Editing a shader string won't show on the dev server until a **hard** reload — Fast Refresh keeps the cached GPU program.

## The check gate

```bash
bun run check        # tsc --noEmit + check:registry + check:strip
bun run verify:loop <slug>   # animation components; needs the dev server
```

`check:registry` gates the registry invariants `tsc` can't reach. If you add a rule in `scripts/registry/rules.ts`, add a matching case in `scripts/registry/selftest.ts` — an uncovered rule fails the selftest.
