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
- C2: ! respect `prefers-reduced-motion` — loops self-halt at speed 0 | paused.
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
- type: `CheckContext` → `{ registry, previewKeys:Set, dirs:Set, fileExists(rel), readKeys(slug), sourceDefaults(slug), packageDeps:Set, today }`
- type: `Rule` → `{ id, severity:"error"|"warn", run(ctx): Violation[] }`
- type: `Violation` → `{ rule, severity, slug?, prop?, detail }`

Animation runtime host (`hooks/use-animation-loop.ts`, `"use client"`):

- hook: `useAnimationLoop(opts)` → `{ start, stop, paint, resize, running }`
- opts → `{ target, halted, dpr:"auto"|number, onResize(m), onFrame(f): void|false, paintWhenHalted?=true, gl?(), onDispose?(), deps?=[] }`
- type: `Metrics` → `{ width, height, dpr, bufferWidth, bufferHeight }`; `FrameInfo` → `{ now, dt, elapsed, frame }`
- `onFrame` returns `false` → halt from inside body. host ⊥ name `paused` ⊥ name `reducedMotion`

Pro seam:

- srv: `getPro()` → `Promise<ProState>` — ∃! ladder. `getEntitlement` | `getBilling` = projections
- type: `ProState` → `{ pro, source:"env"|"cookie"|"db"|"none", type, status, currentPeriodEnd, cancelAtPeriodEnd, hasSubscription }`
- hook: `usePro()` → `ProState|null`; `invalidatePro()` → `void` — ∃! client cache

Favourites reconcile (`lib/favorites/reconcile.ts`, pure):

- fn: `sanitize(input, allowed)` → `string[]`; `mergeUp(local, server)` → `string[]`; `adopt(server)` → `string[]`
- fn: `diff(prev, next)` → `{ added, removed }`; `order(slugs)` → `string[]` newest-first

Capability predicate (`lib/capabilities.ts`):

- type: `Capability` → `"db" | "supabase" | "polar" | "polarWebhook" | "email"`
- fn: `has(c)` → `boolean` — sync, ⊥ throw, ⊥ async

Prop kind table (`lib/registry/kinds.ts`):

- type: `KIND_TABLE` → `Record<PropKind, { parser, Control, typeLabel, formatDefault, validateDefault }>` — total ∴ new kind = tsc error at 1 site

Feedback submit (`lib/feedback/submit.ts`):

- fn: `submitFeedback(i)` → `Promise<SubmitResult>` — ⊥ throw
- type: `SubmitResult` → `{ ok:true } | { ok:false, reason }`; reason ∈ `too_short|too_long|rate_limited|invalid_body|network|server`
- const: `REASON_COPY` → `Record<Reason, string>` — widget renders from table

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
V10: ∃! animation runtime host. ∀ rAF|RO|DPR registry component → host it. ⊥ hand-rolled rAF ⊥ hand-rolled RO
V11: host → ≤1 live rAF ∧ cancel+latch on unmount (⊥ re-arm post-unmount) ∧ ∀ timer cleared ∧ GL → `loseContext()` ∧ dispose idempotent ∧ ⊥ dep on props object identity
V12: ∀ hosted entry → variants ∋ host file ∧ CodePanel tab ∀ variant ∧ install says copy ∀ file
V13: ∃! Pro read seam (server) ∧ ∃! Pro cache (client). ⊥ 2nd resolution ladder ⊥ 2nd fetch cache
V14: ∃! favourites reconcile module, pure (⊥ fetch ⊥ store ⊥ db ⊥ React). ∀ merge|diff|order rule → from it
V15: ∃! capability predicate module, 1 shape. ⊥ inline `process.env` truthiness at call site
V16: ∃! kind table keyed PropKind, total. new kind → tsc error ∀ site. ⊥ open switch on kind
V17: audio Pro gate ∈ engine. ⊥ external `setPro` writer. caller learns ≤ {enabled, volume, play}
V18: ∃! feedback submit seam. error modes = closed union returned as data (⊥ thrown string)
V19: vendored registry copy (admin) → byte-identical | drift check exit ≠ 0

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
T11|.|read-keys.ts (TS API): previews.ts key parse + `values.<ident>` extraction; wire 2 rules|V6,V8
T12|.|source-defaults.ts (TS API): binding-pattern initializers, const resolve, Number() compare. WARN-only|V8
T13|.|patch source defaults → registry: backgrounds|V8,C4
T14|.|patch source defaults → registry: text-animations|V8,C4
T15|.|patch source defaults → registry: micro-interactions|V8,C4
T16|.|patch source defaults → registry: power-user-systems|V8,C4
T17|.|default-drift rule WARN → ERROR; pausable⇔paused rule added WARN-only|V8,V9
T18|.|hooks/use-animation-loop.ts: host seam. ⊥ animation body|V10,V11,C1a
T19|.|types.ts Variant += role?/label?; source.ts → per-variant list, 2 static roots, traversal guard|V12,V6,C1b
T20|.|CodeTabs client wrapper + CodePanel tab ∀ variant; InstallBlock file manifest|V12,C1b
T21|.|side-rays: migrate to host + 2nd Variant. reference migration ∴ proves C1a/C1b|V10,V11,V12
T22|.|migrate+fix: threads, constellation, plus-grid (⊥ repaint on resize)|V2,V10,V11
T23|.|migrate+fix: ribbons (⊥ repaint + [options] rebuild), starfield (orphan rAF)|V2,V10,V11
T24|.|migrate+fix: world-map-ascii (re-arm post unmount), light-rays (uncleared timer)|V10,V11
T25|.|migrate+fix: aurora, grainient (⊥ loseContext; twin shadowflame:476 correct)|V11
T26|.|migrate loopers batch A (5 clean entries)|V10,V11,V12
T27|.|migrate loopers batch B (5 clean entries)|V10,V11,V12
T28|.|check rule: ⊥ raw `requestAnimationFrame`\|`new ResizeObserver` ∈ components/registry ∉ allowlist|V10
T29|.|lib/pro.ts: ∃! server Pro seam. entitlement.ts/billing.ts → projections|V13
T30|.|hooks/use-pro.ts owns THE client cache (+invalidate); AuthMenu, CheckoutResult read it|V13
T31|.|lib/favorites/reconcile.ts: pure sanitize/mergeUp/adopt/diff/order|V14
T32|.|favorites-store, FavoritesSync, api/favorites → reconcile module only|V14
T33|.|lib/capabilities.ts: ∃! predicate set (db\|supabase\|polar\|polarWebhook\|email)|V15
T34|.|repoint ~22 guards; supabase predicate 3× → 1 (server.ts, client.ts, proxy.ts)|V15
T35|.|lib/registry/kinds.ts: PropKind + total KIND_TABLE; 4 consumers read it|V16
T36|.|audio: engine subscribes Pro seam. ⊥ SoundToggle setPro. facade = {enabled,volume,play}|V17,V13
T37|.|lib/feedback/submit.ts: closed SubmitResult union + reason→copy table; widget ⊥ taxonomy|V18
T38|.|admin: check-schema-drift.ts exit≠0 on drift; re-copy 6 vendored files|V19

## §B

id|date|cause|fix
B1|2026-07-19|LightRays/DotField/Strands window-resize only → stale/stretched on container-only resize|V1
B2|2026-07-19|BlackHole resize() clears canvas+FBO, no redraw while loop halted → blank/off-center after resize|V2
B3|2026-07-25|entitlement.ts:34 accepts `sg_pro=1` unconditionally in prod → unauth Pro source unlock via source.ts:22|V3
B4|2026-07-25|db/index.ts:12 throws at import; reconcile.ts:97/:139, notify.ts:30, auth/callback:40 unguarded → polar webhook 500-retries forever|V4
