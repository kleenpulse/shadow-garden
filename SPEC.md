# SPEC — Shadow Garden

Full-project spec. Was resize-scoped (V1,V2 / T1-T5 / B1,B2) → widened 2026-07-25.

## §G

G1: registry canvas|WebGL|rAF components → stay sized & centered ∀ resize (window | container-only).
G2: ∀ invariant ∈ prose | reviewer memory → fail a command instead. check > convention.
G3: ∀ concept (Pro state, favourites merge, creds presence, prop kind) → ∃! module owns it.

## §C

- C1: animation BODY (shader | physics | particle math | draw call) stays inline per-component. ⊥ shared abstraction over it.
- C1a: animation RUNTIME HOST (rAF arm/halt, ResizeObserver, DPR, timers, dispose) → ∃! `hooks/use-animation-loop.ts`. host ⊥ know animation math; halt predicate caller-supplied ∴ host ⊥ prescriptive.
- C1b: host ships to customer ∴ 2nd `Variant` on entry (`lib/registry/types.ts:62-67` — array "kept extensible"). CodePanel tab ∀ variant. install: copy ∀ file. ⊥ npm package, ⊥ private import.
- C2: motion = deliverable (registry ships animated components) ∴ reduced-motion gate ? per-component call, ⊥ blanket mandate. loops self-halt at speed 0 | paused regardless.
- C3: build ! stay PPR-clean.
- C4: registry default = truth. source ≠ registry → patch source (⊥ patch registry). customer copy === bench shown.
- C5: checks run headless under plain `bun` — relative imports, ⊥ `@/`, ⊥ React|Next|DOM, ⊥ new runtime dep. precedent: `scripts/gen-readme.ts:10`.

## §I

Component sizing contract (per `components/registry/<slug>/<Name>.tsx`):

- measure fn (`resize` | `updatePlacement` | `doResize`) → `renderer.setSize` + resolution uniform | `canvas.width/height` + dpr transform
- `startLoopRef.current` → re-arms halted loop; draws 1 frame, self-halts again if still paused
- ro: `new ResizeObserver(cb)` observe container; cb → measure + `startLoopRef.current?.()`; `ro.disconnect()` on cleanup

Registry check (`scripts/registry/`, headless):

- cmd: `bun scripts/check-registry.ts` → stdout violations; exit 0 ⇔ ⊥ error-severity
- fn: `checkRegistry(ctx, rules)` → `Violation[]` — pure, io injected
- type: `CheckContext` → `{ registry, previewKeys:Set, dirs:Set, fileExists(rel), previewReads(slug), sourceDefaults(slug), loopUsage(slug), packageDeps:Set, promptOverlays:Set }`
- type: `Rule` → `{ id, severity:"error"|"warn", what, run(ctx): Finding[] }`
- type: `Violation` → `Finding & { rule, severity }`; `Finding` → `{ slug?, prop?, detail }`
- new rule → ! selftest case (uncovered rule → selftest exit ≠ 0) ∧ ! default ∈ selftest `context()` factory

Animation runtime host (`hooks/use-animation-loop.ts`, `"use client"`):

- hook: `useAnimationLoop(opts)` → `{ start, stop, paint, resize, running }`
- opts → `{ target, halted, dpr:"auto"|number, onResize(m), onFrame(f): void|false, paintWhenHalted?=true, gl?(), onDispose?(), deps?=[] }`
- type: `Metrics` → `{ width, height, dpr, bufferWidth, bufferHeight }`; `FrameInfo` → `{ now, dt, elapsed, frame }`
- `onFrame` returns literal `false` → halt from inside body. ⊥ return → continue. host ⊥ name `paused` ⊥ name `reducedMotion`
- ⊥ `drawRef.current?.(x) ?? false` — void draw → `undefined` → coalesces to halt. ∴ `drawRef.current ? drawRef.current(x) : false`

Loop verifier (`scripts/verify-loop.mjs`, real browser over CDP):

- cmd: `bun run verify:loop <slug…>` → exit ≠ 0 on failure. ! dev server up
- asserts: backing store ∧ ⊥ blank ∧ fills container ∧ V20 continuity ∧ V1 resize ∧ V2 repaint-while-paused
- V20 probe: patch `drawArrays|drawElements|clearRect|fillRect|drawImage|stroke|fill|putImageData` → tag count on `canvas` element (∀ canvas, ⊥ page-wide: sidebar draws too)
- floor: ≥3 draws / 2000ms = liveness ⊥ frame-rate. swiftshader → heavy shader 6-9 fps; frozen → ∃! 0
- `VERIFY_GPU=1` → real driver. `NEEDS_GPU` map → SKIP + reason + summary count (⊥ silent pass)

Pro seam:

- srv: `getPro()` → `Promise<ProState>` — ∃! ladder. `getEntitlement` | `getBilling` = projections
- type: `ProState` → `{ pro, source:"env"|"cookie"|"db"|"none", type, status, currentPeriodEnd, cancelAtPeriodEnd, hasSubscription }`
- mod: `lib/pro-client.ts` → ∃! client cache. ⊥ React ∴ lib/ ⊥ import hooks/
- fn: `loadPro()`, `proSnapshot()` → `BillingSummary|null`, `subscribePro(fn)` → unsub, `invalidatePro()` → `void`
- hook: `usePro()` → `BillingSummary|null`; `useIsPro()` → `boolean|null` = projection — ⊥ own state
- `invalidatePro` called ∀ session change (`use-auth-user`), ∀ polar return (`CheckoutResult`)
- ⊥ `/api/entitlement` — deleted. ∃! client route `/api/billing` (post-T29 same query)

Favourites reconcile (`lib/favorites/reconcile.ts`, pure):

- fn: `order(slugs)` → `string[]` — canonical shape: newest-first, deduped. ∀ other fn returns it
- fn: `sanitize(input: unknown, allowed?)` → `string[]`; `adopt(server, allowed?)` → `string[]`
- fn: `add|remove|toggle(slugs, slug)` → `string[]` — ordering rules ∴ store ⊥ own them
- fn: `diff(prev, next)` → `Delta {added, removed}`; `isEmpty(delta)` → `boolean`
- ⊥ `mergeUp` — union computed ∃! by INSERT (POST local → adopt response). client merge = 2nd impl

Capability predicate (`lib/capabilities.ts`):

- type: `Capability` → `"db" | "supabase" | "polar" | "polarWebhook" | "email"`
- fn: `has(c)` → `boolean` — sync, ⊥ throw, ⊥ async

Prop kind table (`lib/registry/kinds.ts`):

- type: `KIND_TABLE` → `Record<PropKind, { typeLabel, formatDefault, validateDefault }>` — pure, ⊥ React ⊥ nuqs ∴ headless-importable (C5)
- `CONTROLS` ∈ `ControlsPanel.tsx`, `PARSERS` ∈ `useTunedProps.ts` → `satisfies Record<PropKind,…>` — framework-side, same totality
- consumers: PropsTable, ControlsPanel, useTunedProps, `scripts/registry/rules.ts` (rule `default-in-domain`)
- new kind → tsc error ∀ 3 tables

AI prompt (`lib/registry/prompt.ts`, server-only):

- fn: `getPrompt(entry)` → `Promise<PromptResult>`; type: `PromptResult` → `{status:"ok",text} | {status:"locked"} | {status:"pending"}`
- gate inherited ∃! `getSource` — ⊥ 2nd entitlement read. locked | pending → pass through
- text derived: entry meta + `installCommand("bun",entry)` + ∀ `SourceFile.raw` (incl `role:"hook"` peer) + props table via KIND_TABLE + usage from documented defaults + conditional contract lines
- overlay ? `prompts/<slug>.md` → appended as "Component-specific notes". ⊥ file = normal case
- fence width = longest backtick run + 1. ⊥ fixed 3 — source | overlay ∋ ``` → block truncates silently
- `getSource` = `cache()`d ∴ ∃! disk read ∧ ∃! Shiki run / entry / request (CodePanel ∧ prompt both call it)
- ui: `PromptButton` (srv, own Suspense) → `CopyPromptButton` | `PromptLocked` | ⊥ (pending)
- fx: copy ok → sparkle burst + `play("select")`. tab → `"code"` → `useBorderGlow` sweep (`autoplay` 1400ms pulse ≈ 230° @ 2200ms/rev).
  ∀ fx reduced-motion gated at call site. glow shell owns border+bg (button transparent) — button border would occlude ring
- api: POST `/api/stats` `{slug, event:"prompt"}` → 204; col `component_stats.prompt_count` ≠ `copy_count`

Feedback submit (`lib/feedback/submit.ts`):

- fn: `submitFeedback(input)` → `Promise<SubmitResult>` — ⊥ throw ∀ path (⊥ network ⊥ parse)
- type: `SubmitResult` → `{ ok:true } | { ok:false, reason }`; reason ∈ `too_short|too_long|rate_limited|invalid_body|network|server`
- const: `REASON_COPY` → `Record<Reason, {title, description}>` — total ∴ new reason ! ship copy
- const: `LIMITS` → `{messageMin, messageMax, subjectMax, emailMax}` — route & widget ∀ read it
- fn: `validate(message)` → `Reason|null`; unknown server code → `server` (⊥ render verbatim)

## §V

V1: ∀ canvas|WebGL|rAF component → ResizeObserver on container (⊥ window-only listener)
V2: ∀ resize → repaint ≥1 frame even if render loop self-halted (paused | speed 0 | reduced motion)
V3: prod → ⊥ cookie|env Pro unlock. ∀ dev override (`SHADOW_GARDEN_PRO`, `sg_pro`) → ! IS_LOCAL_DEV
V4: ∀ db reach → ∃ capability guard upstream. creds ∉ env → typed refusal ∴ ⊥ throw at module-import
V5: ∃! registry check module. headless ∧ violation → exit ≠ 0
V6: ∀ entry → slug unique ∧ slug === dir name ∧ slug ∈ previews keys ∧ ∀ variant.file ∃ on disk ∧ ∈ {`components/registry/`, `hooks/`}
V7: ∀ prop → default ∈ domain (number ∈ [min,max], enum ∈ options) ∧ `disabledWhen.prop` ∈ same entry props
V8: ∀ prop → `prop.name` ∈ preview read-keys ∧ registry default === source default. conflict → registry wins ∴ patch source
V9: ∀ entry → `addedAt` ∈ YYYY-MM-DD ∧ `dependencies` ⊆ package.json deps ∧ `pausable` ⇔ preview forwards `paused`
V10: ∃! animation runtime host. ∀ rAF|RO|DPR registry component → host it. ⊥ hand-rolled rAF ⊥ hand-rolled RO.
     `PENDING_MIGRATION` = debt ledger, ⊥ 2nd allowlist ∴ ! drain to ∅ & stay ∅ (∅ @ 2026-07-27).
     entry ⊥ hostable → `NOT_A_LOOP` + reason. observer state (IO, visibilitychange) ∉ `halted` (⊥ render state) → halt ∈ frame via `return false`, re-arm via `loop.start()`
V11: host → ≤1 live rAF ∧ cancel+latch on unmount (⊥ re-arm post-unmount) ∧ ∀ timer cleared ∧ GL → `loseContext()` ∧ dispose idempotent ∧ ⊥ dep on props object identity
V12: ∀ hosted entry → variants ∋ host file ∧ CodePanel tab ∀ variant ∧ install says copy ∀ file
V13: ∃! Pro read seam (server) ∧ ∃! Pro cache (client). ⊥ 2nd resolution ladder ⊥ 2nd fetch cache
V14: ∃! favourites reconcile module, pure (⊥ fetch ⊥ store ⊥ db ⊥ React). ∀ merge|diff|order rule → from it
V15: ∃! capability predicate module, 1 shape. ⊥ inline `process.env` truthiness at call site
V16: ∃! kind table keyed PropKind, total. new kind → tsc error ∀ site. ⊥ open switch on kind
V17: audio Pro gate ∈ engine — engine subscribes `lib/pro-client`. ⊥ external `setPro` writer.
     caller learns ≤ {enabled, volume, play, availability:boolean|null}. unresolved → fail closed
V18: ∃! feedback submit seam. error modes = closed union returned as data (⊥ thrown string)
V19: vendored registry copy (admin) → content-identical (⊥ byte: CRLF ≠ LF across repos) | drift check exit ≠ 0
V20: `onFrame` → `undefined` = continue; ∃! literal `false` halts. ⊥ nullish-coalesce void draw → `false`.
     ∀ hosted entry → sustained draw calls ∀ 2s window (⊥ 1 stranded frame)
V21: prompt text ∉ `ComponentEntry` — entry client-serialized ∀ visitor (Sidebar, command-groups, LiveWorkspace props).
     ∴ ∃! gate = `getSource` ⇒ tier pro ∧ ¬pro → locked ∧ ⊥ source bytes cross
V22: ∀ `prompts/*.md` → basename ∈ slugs | check exit ≠ 0 (⊥ silently-dropped overlay)
V23: ∀ clipboard write → text in hand pre-click (prop, ⊥ fetch on click) — await before write → ⊥ user-gesture @ Safari.
     ∀ success FX (sparkle, sound, trackEvent) ∈ try post-await. ⊥ fire on click ∴ failed copy ⊥ celebrates
V24: reduced-motion gate ? optional per §C2. ∃ gate → ! own it in JS: globals.css `@media (prefers-reduced-motion)` backstop reaches CSS ⊥ motion/react ⊥ gsap ⊥ rAF ⊥ canvas
V25: ∀ hover|focus reveal → resting state reachable ⊥ completion event. `transitionend` ⊥ fires on cancel ∧ ⊥ fires when write ≡ current value ∴ ∃ latch → ! timer backstop ≥ duration.
     park → travel ∈ same task (flush = before-state). ⊥ deferred frame between: leave lands in gap ∧ park writes ≡ exit writes ∴ ⊥ invalidation ∴ `will-change` layer holds last frame
V26: hover ∧ focus → 2 flags OR'd, ⊥ 1 shared. focusin/focusout bubble ∴ ! ignore relatedTarget ∈ currentTarget.
     1 flag → blur @ pointer-still-inside clears it ∧ ⊥ pointerenter ∀ pointer that never left ∴ ⊥ recovery
V27: ∀ programmatic scroll-to-anchor → ! measure after the render that produced the target list commits.
     ⊥ scroll against a `useDeferredValue`/`useTransition` copy — stale layout ∴ right anchor, wrong offset.
     ∴ jump state ∈ same batch as list state | gate the jump on deferred ≡ source
V28: ∀ anchor target → `scroll-margin-top` ≥ bottom edge of ∀ sticky layer above it, ⊥ topmost only.
     stop = Σ(each layer `top` + height), ! re-derived ∀ breakpoint the layers vary at.
     ∴ reading line ≥ deepest stop — shallower ∴ jump lands ∧ spy hands rail to previous section
V29: composited child ∈ rounded `overflow-hidden` ancestor → ⊥ permanent `will-change` ∧ ⊥ identity `filter`.
     `blur(0px)` ≠ no-op: ∀ non-`none` filter = own render surface ∧ redefines damage rect. drop the declaration, ⊥ animate → 0.
     `visibility:hidden` ⊥ forces re-raster of clip region on a promoted layer ∴ stale tiles survive a correct DOM
V30: stale-composited-frame bug ⊥ observable by `Page.captureScreenshot` — capture forces the repaint that clears it ∴ ∀ green = ⊥ signal.
     swiftshader ⊥ reproduces damage-rect bugs (∴ `VERIFY_GPU` exists). CDP synthetic pointer ⊥ reproduced it @ real GPU, headful, presented-frame diff.
     ∴ ∀ compositor artifact → human eye @ real hardware = ∃! proof. harness ⊥ substitute
V31: ∀ JS-measured layout ∈ page ∃ programmatic scroll-to-anchor → ! pack synchronously ∈ `useLayoutEffect`.
     child layout effect ≺ parent passive effect ∴ scroll measures final geometry.
     ⊥ pack ∈ RO callback | rAF — RO delivery ⊥ ordered vs React passive flush ∴ §B10 again.
     RO|rAF = async height change only (image, font, rewrap post column-count change)
V32: ∀ measure-then-position layout → ∀ read ≺ ∀ write, 1 pass each. ⊥ measure-move-measure per item = layout thrashing.
     ⊥ `content-visibility:auto` on measured items — placeholder size ⊥ real height.
     RO on own container → width only; height = own output ∴ feedback loop.
     tie-break argmin strictly-shorter (⊥ `≤`) ∴ 2 equal columns ⊥ swap item ∀ repack.
     stagger = `transition-delay`, ⊥ `setTimeout` — timer orphaned by re-run mid-flight ∴ item stranded @ opacity 0.
     `will-change` ∀ in-flight tween only, cleared on timer (§V25, §V29).
     IO reveal → ⊥ negative `rootMargin` — item ∈ trimmed band @ max scroll ⊥ intersects ∴ invisible ∀ good.
     stagger index ! capped — batch = ∀ item crossing @ once ∴ uncapped 30-item batch = >1s tail in plain sight.
     reveal ∃ travel ∧ page ∃ anchor scroll → rise = transform on ancestor ∈ box `scrollIntoView` measures
     ∴ land, then drift `revealDistance` above stop (≡ §B11 symptom).
     ∴ ! settle target reveal ≺ ∀ measure (`settleMasonryReveal`), ⊥ ban travel. target loses own rise, ∀ peer still animates
V34: ∀ component that hides own content → `reducedMotion` ⊥ optional @ call site.
     omitted → entrance armed ∀ reduced-motion user: 73/91 cards @ opacity 0 until scrolled to (/cookbook, measured).
     globals.css backstop crushes duration ⊥ opacity ∴ masks symptom, ⊥ fixes
V35: ∀ programmatic smooth scroll → animate ≤ ~1 viewport. distance = jank, ⊥ frame budget.
     7400px @ browser-allotted ~1.1s = ~300px/frame @ peak ∴ 1 slow frame → ~1900px lurch (median step 30, max 1900).
     ⊥ page's fault: identical @ reveal disabled ∧ WebGL backdrop disabled.
     ∴ close gap > SMOOTH_MAX instantly, animate last APPROACH only → max step 22-68px.
     browser owns final leg ∴ `scroll-margin-top` still decides rest (§V28)
V36: ∀ server-rendered node passed as prop into client component → ⊥ bare sibling ∈ multi-child array. wrap ∈ own element.
     streamed RSC node reaches client as lazy, ⊥ element ∴ `jsx()` ⊥ mark it key-validated ∴ reconciler warns "unique key" @ resolve.
     wrapper = real element ∴ validated @ jsx time, ∧ slot reconciles as ∃! child ⊥ array. explicit `key` also silences, ⊥ survives refactor
V33: ∀ masonry-ish layout → ∃! parent, items move by `transform`. ⊥ DOM-column-per-column.
     reparent = remount ∴ focus | playing media | open popover | local state dies ∀ resize.
     ∧ DOM order ≡ reading order ∴ Tab ≡ eye. CSS `columns` ⊥ (fills col 1 top→bottom first).
     pre-hydration paint → CSS `columns` fallback (`column-width` + `column-count` ≡ same arithmetic), absolute ← 1st layout effect.
     parent re-render ∀ keystroke → key-signature dep, ⊥ `children` identity ∴ ⊥ forced remeasure ∀ keystroke

## §T

id|status|task|cites
T1|x|BlackHole: repaint in RO callback|V2
T2|x|LightRays: add RO on container + repaint|V1,V2
T3|x|Strands: add RO on container + repaint|V1,V2
T4|x|DotField: add RO on parent + repaint post-debounce|V1,V2
T5|x|SideRays: repaint in RO/window callback|V2
T6|x|entitlement.ts+billing.ts: `sg_pro` & `SHADOW_GARDEN_PRO` → ! IS_LOCAL_DEV (copy `SoundToggle.tsx:26`)|V3
T7|x|lib/db: ⊥ module-scope throw. export `dbConfigured()` + `getDb()`→`Db`\|`null`; repoint lazy-import sites|V4
T8|x|reconcile/notify/auth-callback/webhook: `getDb()` null → typed refusal; polar webhook 503 when db ⊥|V4
T9|x|scripts/registry/: CheckContext + Rule[] core, injected io. cheap rules only|V5,V6,V7,V9,I.check
T10|x|scripts/check-registry.ts runner + `check:registry` script; exit≠0 on error severity|V5,I.check
T11|x|read-keys.ts (TS API): previews.ts key parse + `values.<ident>` extraction; wire 2 rules|V6,V8
T12|x|source-defaults.ts (TS API): binding-pattern initializers, const resolve, Number() compare. WARN-only|V8
T13|x|patch source defaults → registry: backgrounds|V8,C4
T14|x|patch source defaults → registry: text-animations|V8,C4
T15|x|patch source defaults → registry: micro-interactions|V8,C4
T16|x|patch source defaults → registry: power-user-systems|V8,C4
T17|x|default-drift rule WARN → ERROR; pausable⇔paused rule added WARN-only|V8,V9
T18|x|hooks/use-animation-loop.ts: host seam. ⊥ animation body|V10,V11,C1a
T19|x|types.ts Variant += role?/label?; source.ts → per-variant list, 2 static roots, traversal guard|V12,V6,C1b
T20|x|CodeTabs client wrapper + CodePanel tab ∀ variant; InstallBlock file manifest|V12,C1b
T21|x|side-rays: migrate to host + 2nd Variant. reference migration ∴ proves C1a/C1b|V10,V11,V12
T22|x|migrate+fix: threads, constellation, plus-grid (⊥ repaint on resize)|V2,V10,V11
T23|x|migrate+fix: ribbons (⊥ repaint + [options] rebuild), starfield (orphan rAF)|V2,V10,V11
T24|x|migrate+fix: world-map-ascii (re-arm post unmount), light-rays (uncleared timer)|V10,V11
T25|x|migrate+fix: aurora, grainient (⊥ loseContext; twin shadowflame:476 correct)|V11
T26|x|migrate loopers batch A (5 clean entries)|V10,V11,V12
T27|x|migrate loopers batch B (5 clean entries)|V10,V11,V12
T28|x|check rule: ⊥ raw `requestAnimationFrame`\|`new ResizeObserver` ∈ components/registry ∉ allowlist|V10
T29|x|lib/pro.ts: ∃! server Pro seam. entitlement.ts/billing.ts → projections|V13
T30|x|hooks/use-pro.ts owns THE client cache (+invalidate); AuthMenu, CheckoutResult read it|V13
T31|x|lib/favorites/reconcile.ts: pure order/sanitize/add/remove/toggle/adopt/diff|V14
T32|x|favorites-store, FavoritesSync, api/favorites → reconcile module only|V14
T33|x|lib/capabilities.ts: ∃! predicate set (db\|supabase\|polar\|polarWebhook\|email)|V15
T34|x|repoint ~22 guards; supabase predicate 3× → 1 (server.ts, client.ts, proxy.ts)|V15
T35|x|lib/registry/kinds.ts: PropKind + total KIND_TABLE; 4 consumers read it|V16
T36|x|audio: engine subscribes Pro seam. ⊥ SoundToggle setPro. facade = {enabled,volume,play}|V17,V13
T37|x|lib/feedback/submit.ts: closed SubmitResult union + reason→copy table; widget ⊥ taxonomy|V18
T38|x|admin: check-schema-drift.ts exit≠0 on drift; re-copy 6 vendored files|V19
T39|x|verify-loop.mjs: draw-call continuity probe + `VERIFY_GPU` + `NEEDS_GPU` skip|V20
T40|x|19 entries: `?? false` → ternary. ⊥ draw-body change|V20,B7
T41|x|`no-nullish-halt` rule (loop-usage `nullishHalts`) + selftest; onFrame doc|V20,G2
T42|x|`lib/registry/prompt.ts`: derived AI brief + `prompts/<slug>.md` overlay + dynamic fence|V21,G3
T43|x|`getSource` → `cache()` ∴ ⊥ 2× Shiki / page (CodePanel + prompt)|I.AI prompt
T44|x|`PromptButton` srv 3-way (ok\|locked\|pending) → `CopyPromptButton`\|`PromptLocked`; own Suspense|V21,V13
T45|x|`SparkleBurst`: hook + renderer, burst ∈ click handler ⊥ effect; reduced-motion → ⊥ spawn|V23,V24
T46|x|`promptSlot` chain page → LiveWorkspace → WorkspaceTabs; stub replaced, `mb-4` → row|V21
T47|x|stat event `prompt` + `prompt_count` col + migration 0006 + admin schema mirror|I.AI prompt
T48|x|`prompt-overlay-slug` rule + `promptOverlays` ∈ CheckContext + selftest case|V22,V5
T49|x|magnetic-button `rippleColor` source `#0a0a0c` → `#d2abfd` (registry = truth)|V8,C4
T50|x|prompt button: code-tab sweep. reuse `useBorderGlow` `autoplay` pulsed 1400ms (⊥ edit registry src). border+bg → shell wrapper ∴ ring ∉ occluded. trigger = zustand `subscribe` prev→next (⊥ setState-in-effect)|V24,G3
T51|x|approach rewrite: 2 rAF deleted (park→flush→travel 1 task) ∴ V10 ✓. ∃! `apply()` writes complete set. hover/focus split. timer backstop; `transitionend` → optimisation + `e.target` guard. documentElement pointerleave. re-apply ∀ prop change|V25,V26,V10
T52|x|cookbook filter: `query` (popup) ≠ `committed` (grid) split, ⊥ `useDeferredValue`, jump effect abandons on anchor miss, Enter ⊥ popup → commit raw text, readout `↵ to filter`|V27,B9
T53|x|cookbook anchors: `ANCHOR_STOP` = `scroll-mt-24 sm:scroll-mt-28` ∀ section + article (⊥ `scroll-mt-20`), READING_LINE 88 → 120|V28,B10
T54|~|approach round 2: drop `will-change-transform`; `filter` declaration + transition leg gated on `blur > 0` (⊥ animate identity filter). ⊥ harness-reproducible ∴ awaiting user eye @ real hw|V29,V30,B12
T55|x|masonry (pro, Power-User Systems): ∃! parent + absolute + `translate3d`, container-derived column count, CSS-`columns` pre-hydration fallback, sync pack ∈ layout effect, RO ∀ async height, IO reveal w/ `transition-delay` stagger. `NOT_A_LOOP` entry|V31,V32,V33,V6
T56|x|/cookbook §terms: `grid gap-3 sm:grid-cols-2` → `<Masonry minColumnWidth=240 maxColumns=3 gap=12 revealDistance=20 reducedMotion>` ∀ section. ANCHOR_STOP ∧ `id` ∀ article unchanged ∴ V27/V28 hold|V31,V33,V27,V28
T57|x|`scrollToAnchor`: settle target reveal ≺ measure; stage instantly when > SMOOTH_MAX(1.4) vh, animate APPROACH(0.55) vh only. proven: drift 0 ∀ fresh-load term pick (target `revealed:-` ∧ opacity 0 pre-click), max step 1900→68px|V33,V34,V35
T58|x|shadowflame `flameWidth` source `1` → `1.6` (registry = truth, ≡ T49). straggler of T13. bench ∀ rendered 1.6 ∴ ⊥ site visual change; ∃! copied source drifted. `check:registry` → 0 errors|V8,C4,B8
T59|x|physics-engine + variable-proximity → runtime host. `PENDING_MIGRATION` drained to ∅. both entries + `role:"hook"` variant. physics: IO/visibility → `return false` ∈ frame, `loop.start()` on re-arm; dpr ← metrics ∀ resize (was 1× @ mount); `MAX_FRAME_DELTA` dropped (host clamps tighter); `acc = 0` @ `dt === 0` = post-halt burst guard. vp: local `useAnimationFrame` deleted, `paintWhenHalted:false` (⊥ backing store ∴ paint-while-paused would re-apply weights pause exists to settle)|V10,V12,V1,V2
T60|x|selftest `loop-allowlist-current` case repointed PENDING_MIGRATION → NOT_A_LOOP branch (`masonry`, 0 rAF ∧ 0 RO). draining the ledger left the rule uncovered ∴ selftest caught it — working as designed|V5
T61|x|`WorkspaceTabs` wraps `{promptSlot}` ∈ `<Fragment>` ∴ dev key warning gone. ⊥ layout change (fragment ⊥ DOM)|V36,B13

## §B

id|date|cause|fix
B1|2026-07-19|LightRays/DotField/Strands window-resize only → stale/stretched on container-only resize|V1
B2|2026-07-19|BlackHole resize() clears canvas+FBO, no redraw while loop halted → blank/off-center after resize|V2
B3|2026-07-25|entitlement.ts:34 accepts `sg_pro=1` unconditionally in prod → unauth Pro source unlock via source.ts:22|V3
B4|2026-07-25|db/index.ts:12 throws at import; reconcile.ts:97/:139, notify.ts:30, auth/callback:40 unguarded → polar webhook 500-retries forever|V4
B5|2026-07-25|OPEN. build warns "whole project traced unintentionally": `source.ts:59` `readFile(absolute)` arg fully dynamic ∴ turbopack ⊥ scope trace despite literal roots (`:17-18`). build ✓, PPR ✓ — bundle size only. ⊥ regression (∈ since T19). `turbopackIgnore` ⊥ fix — would drop the files Pro reads need. T42 adds a 2nd dynamic `readFile` (`prompt.ts` overlay, literal `PROMPTS_ROOT`) — same cause, ⊥ new class|—
B6|2026-07-25|admin `check-schema-drift.ts:46` `process.exit(0)` unconditional ∴ warned ∀ run, failed ⊥ run. 5/6 vendored files stale (incl. whole entry `long-shadow` added upstream). 2nd cause: byte-hash over CRLF-vs-LF checkouts → ∀ file reported drifted ∴ signal worthless|V19
B7|2026-07-25|19 entries frozen ∀ 1 frame. `onFrame: drawRef.current?.(x) ?? false` — draw typed `void \| false` ∴ good frame → `undefined` → `?? false` → `false` = host halt signal. reads as null-guard ∴ survived review 19×. 2nd-order: `verify-loop.mjs` asserted 1st frame + V1 + V2, ⊥ continuity — frozen loop passed ∀ assertion. control: `side-rays` ∃! entry ⊥ wrapper ∧ ∃! entry still animating|V20
B8|2026-07-26|magnetic-button `rippleColor` source `#0a0a0c` vs registry `#d2abfd` → bench shows amethyst, customer paste ships near-black. `documented-default-matches-source` already detected ∴ ⊥ new invariant — gap = check ⊥ run before commit. amplified by T42: prompt embeds `raw` ∴ drifted default reaches LLM too|V8,C4
B9|2026-07-27|approach overlay frozen mid-travel ∀ fast pointer, ⊥ self-clears. park+flush then rAF-deferred travel: fast re-cross of SAME edge → `transition:"none"` cancels in-flight travel, ∧ park writes ≡ exit writes (`d = away ? offsetDistance : 0` ∴ both = away formula) ∴ ⊥ computed-value change ∴ ⊥ style invalidation ∴ `will-change` layer keeps last rasterized frame. painted state ∄ specified state ∴ ∀ later write also no-op. `transitionend` = ∃! recovery ∧ ⊥ fires on cancel|no-op ∴ visibility latch left open. repro: CDP edge-oscillation, 4/4 tiles unlatched 3/3 runs; DOM read clean ∴ computed-style assert ⊥ sufficient — ! screenshot ∧ forced-repaint diff. rAF was added to hide a 1-frame park flicker the flush already made unnecessary ∴ cure ≡ cause. 2nd cause: V10 flagged the 2 rAF as error pre-commit, check ⊥ run (≡ B8)|V25,V26,V10
B10|2026-07-27|/cookbook: pick section suggestion → scroll lands wrong + rail lies 1500ms. `filtered` ← `useDeferredValue(result)` ∴ click render still paints the pre-clear 3-section list; effect resolves anchor @ stale offset, scrolls, nulls `pendingRef`. deferred render then expands 3→11 sections ∴ target slides down, ⊥ re-jump. `useScrollSpy` pin holds until `SETTLE_TIMEOUT_MS`. term/component picks = same cause, list shrinks ∴ less visible. 2nd cause: live grid filter under open popup = 2 narrowing mechanisms ∀ keystroke ∴ 91 cards reflow beneath a floating listbox|V27
B11|2026-07-27|/cookbook: heading lands under the filter bar ∀ jump. `scroll-mt-20` (80) reserved the shell TopBar only; page's own sticky filter sits below it @ `top-10`/`sm:top-14` + ~50 height ∴ real stop = 90 \| 106. masked by B10 — while the scroll landed wrong anyway the 10-26px shortfall read as part of that|V28
B12|2026-07-27|approach: round-1 fix (B9) landed ∧ artifact PERSISTED — 2nd, distinct cause @ compositor, ⊥ DOM. purple fragments ⊥ full-tile-width (∃ ~75% width bar; ∃ 40px strip carrying the card radius; ∃ multi-fragment tile) ∴ damage-rect granularity, ⊥ any specified transform. user: scroll|resize|devtools-toggle ∀ clear it ∴ DOM healthy, painted output stale. cause: ∃! entry stacking permanent `will-change` + animated `filter` + rounded `overflow-hidden` on ancestor. `blur` default 0 ∴ `filter: blur(0px)` bought a render surface ∀ 0 visual ∧ redefined damage rect; `will-change` kept layer promoted ∴ stale raster never discarded. controls ∈ repo: spotlight-shell = same clip + skew-translate, ⊥ will-change ⊥ filter, ⊥ artifacts; tilt = will-change + radius but clip on static child. fix: drop both. 2nd-order: round 1 declared "fixed ∧ proven" on a harness run under swiftshader ∴ green was ⊥ signal (V30); real-GPU + headful + presented-frame diff ALSO ⊥ reproduce ∴ ⊥ harness-verified — user eye = ∃! proof|V29,V30
B13|2026-07-27|dev console: `Each child in a list should have a unique "key" prop. Check the render method of WorkspaceTabs. It was passed a child from ComponentPage.` ⊥ real missing key — `promptSlot` = ∃! prop passed server→client that lands as bare sibling ∈ 2-child array (`[<PillTabs>, promptSlot]`). streamed RSC node = lazy @ jsxs time ∴ `validateChildKeys` skips it (⊥ `isValidElement`) ∴ `_store.validated` stays 0; resolves to keyless element ∴ `warnForMissingKey` fires. `code` = same origin ⊥ warns — reconciled as ∃! child, ⊥ array. dev-only noise, ⊥ runtime effect|V36
