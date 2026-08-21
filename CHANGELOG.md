# shadow-garden

## 0.3.0

### Minor Changes

- [`841762b`](https://github.com/kleenpulse/shadow-garden/commit/841762b52225419c0556b3819a5d36fab39335b4) Thanks [@kleenpulse](https://github.com/kleenpulse)! - Five new components, taking the catalog to 87.

  - **Contour** (Backgrounds) — a topographic map of terrain that will not hold still. The lines are not drawn, they are found: a height field is sampled onto a grid every frame and marching squares walks it once per altitude, emitting segments wherever the land crosses that height. The pointer raises a hill the contours route around, and because the contour interval is fixed rather than the line count, the extra altitude produces extra rings instead of restretching the ones already on screen.
  - **Rainglass** (Backgrounds) — rain on a window with a city somewhere behind it. There is no scene being blurred; the backdrop is built out of focus to begin with, so the drops have something to bend without a render target or a blur pass anywhere in the frame. Each drop is a pure function of time inside its own grid cell, and the descent is stick-slip — holding by surface tension, breaking loose, running, stopping — with the trail existing only above the drop that made it.
  - **Neon** (Text Animations) — a neon sign, with everything that is wrong with a neon sign. Tubes strike one at a time rather than together, the steady state carries a mains hum, and every so often one tube gives up for a third of a second and comes back. The glow is baked once per letter into a sprite, so a frame is a handful of draws no matter how wide the word.
  - **Rime** (Text Animations) — hoarfrost taking a word, Molten's opposite number. Crystal tips seeded on the glyph edges creep across the letters, fork at a fixed lattice angle, and die where they run out of glyph, so cost tracks the growing edge rather than the area. The text underneath is never redrawn, which makes the thaw nothing more than fading ice off type that was always there.
  - **Dial** (Micro-interactions) — a machined rotary knob: angular drag with detents you feel on the way past, inertia on a flick, and a spring that settles into the nearest stop. The angle lives in a motion value, so the only thing React holds is the detent index — and arrow keys step through the same spring the hand does.

- [`841762b`](https://github.com/kleenpulse/shadow-garden/commit/841762b52225419c0556b3819a5d36fab39335b4) Thanks [@kleenpulse](https://github.com/kleenpulse)! - Six new components, taking the catalog to 82.

  - **Mycelium** (Backgrounds) — a Physarum slime mould run as a swarm rather than a field equation: up to a million agents in a floating-point texture, each sensing the trail ahead of itself, turning toward it and depositing more. The pointer is food laid into the trail map, so the veins route to your cursor over several seconds instead of snapping to it.
  - **Molten** (Text Animations) — type that melts and fuses, by thresholding a blurred coverage field rather than moving glyphs, so two stems close into one surface instead of overlapping. The real word stays in the DOM the whole time: selectable, searchable and read correctly aloud.
  - **Weave** (Power-User Systems) — a position-based cloth solver. Distance constraints relaxed to convergence on a fixed timestep, draggable, and shaded by each quad's own extension against the tear threshold, so the load path is visible long before anything fails.
  - **Telemetry** (Power-User Systems) — a metric board that behaves as one instrument: hovering any tile broadcasts a single timestamp and every other tile reports its own value at that same instant. Threshold breaches are recorded on the sample, so a scar travels with its data.
  - **Passcode** (Micro-interactions) — a one-time-code field with per-character springs, a staggered paste, a shake on rejection and a fold into a tick on success, built on one real input so SMS autofill, password managers and screen readers all keep working.
  - **Rewind** (Power-User Systems) — a scrubbable undo history that draws the futures you abandoned instead of destroying them. Controlled, in the same shape as Ledger.

## 0.2.0

### Minor Changes

- [`3d4161a`](https://github.com/kleenpulse/shadow-garden/commit/3d4161a500a83d789557ba3fa3d850a9c4406995) Thanks [@kleenpulse](https://github.com/kleenpulse)! - Shadow Garden is fully open source under MIT, and the catalog reflects it: the free/pro tier concept is gone from the data model and every surface. All 76 components ship complete source, the sidebar filter is now All/New (old persisted filters migrate automatically), the free-components collection folded into the 16 that remain, and structured data declares `isAccessibleForFree`. Premium components live in a separate private repo.

### Patch Changes

- [`3d4161a`](https://github.com/kleenpulse/shadow-garden/commit/3d4161a500a83d789557ba3fa3d850a9c4406995) Thanks [@kleenpulse](https://github.com/kleenpulse)! - The workspace Preview/Code pill no longer flies in from the previous page's position when navigating between components — its shared-layout id is now scoped per slug. Mask Blur also gained its React Bits attribution.
