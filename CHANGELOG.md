# motion-garden

## 0.4.0

### Minor Changes

- [`42dda33`](https://github.com/kleenpulse/shadow-garden/commit/42dda33c3b754748087526e43cadbf1aec404eb6) Thanks [@kleenpulse](https://github.com/kleenpulse)! - One new component, taking the catalog to 157 (148 in production while Landing Pages stays hidden).

  - **Anima** (Backgrounds): a still illustration that looks alive. One image runs through a shader. The marked parts sway, the glowing parts pulse, a band of light crosses the metal, the light of the scene rises and falls, and glowing motes drift over it. The pointer slides the near parts more than the far ones. A second, small image (sway in red, glow in green, depth in blue) tells the shader what can move.

- [`3aa8c0a`](https://github.com/kleenpulse/shadow-garden/commit/3aa8c0ad9c8bbac6e96776e5c8b781317ab04857) Thanks [@kleenpulse](https://github.com/kleenpulse)! - Five new components, one in each component category, taking the catalog to 162 (153 in production while Landing Pages stays hidden).

  - **Circuit** (Backgrounds): a circuit board that draws itself. Chips are placed first, every pin grows a trace across a grid with 45 degree bends, and the gaps fill with loose traces and vias. Pulses of light run along the copper and can pass through a chip and out of another pin. The pointer lights the copper near it and starts pulses there.
  - **Reel** (Text Animations): a sentence with one slot that keeps changing. The next word rolls up from below as a whole or letter by letter, and the slot's width springs to fit it, so the rest of the sentence is pushed along instead of jumping.
  - **Sheet** (Micro-interactions): a bottom sheet with three heights. A release carries the speed of the hand forward to pick the height, a pull past either end stretches like a rubber band, the page behind dims and steps back, and a pull past the bottom closes it. Arrow keys on the handle step between heights.
  - **Treemap** (Power-User Systems): a squarified treemap you can walk into. Click a frame and it grows to fill the view, with a path back out. Cells keep their place inside their frame for the whole zoom. Arrow keys move between cells by where they are on screen, and a live mode lets the values wander.
  - **Sky Lanterns** (Hero Templates, Pro): a night lake with hundreds of paper lanterns rising off it, each lit from inside, with a soft glow and a broken reflection on the water. Sweep the pointer through a lantern to knock it away with real collision physics, a click lets go of a new cluster, and a drag turns the camera around the lake.

- [`28efccb`](https://github.com/kleenpulse/shadow-garden/commit/28efccbd25b7ff324e27b4aefa7d93e89a007fbc) Thanks [@kleenpulse](https://github.com/kleenpulse)! - A new hero template, taking the catalog to 163 (154 in production while Landing Pages stays hidden).

  - **Kusanagi** (Hero Templates): a long sword planted in a foggy field of tall grass, under a wide, heavy title and a thin editorial frame with film grain. Wind rolls through thousands of blades of grass and the fog gets thicker toward the horizon. On load the fog lifts, the grass rises and the camera glides in to the sword (the `intro` control turns this off). A click or tap sends a cut out from the sword: the grass in its path is cut short, then grows back. The button draws the sword out of the ground and cuts the whole field in a ring. A drag turns the camera around the sword, and a `distance` control sets how close the camera stands.

- [`7764ba6`](https://github.com/kleenpulse/shadow-garden/commit/7764ba641d25ca086f835a33a12a62c48d62f876) Thanks [@kleenpulse](https://github.com/kleenpulse)! - Ten new components, taking the catalog to 156 (147 in production while Landing Pages stays hidden).

  - **Chladni** (Backgrounds): sand on a vibrating plate. The grains jump off the parts that shake and settle on the still lines, drawing a Chladni figure that changes every few seconds. The pointer scatters them like a violin bow.
  - **Marbling** (Backgrounds, Pro): paper marbling built on the drop and comb math from _Mathematical Marbling_. New drops push the old rings outward without tearing them, a comb pulls the ink into feathers, and a drag pulls it like a stylus.
  - **Annotate** (Text Animations): hand-drawn marker notes (underlines, circles, boxes, highlights, strike-throughs, brackets) that draw themselves around marked words, line by line, and re-measure when the layout changes.
  - **Flipdot** (Text Animations, Pro): a mechanical flip-dot sign. Discs turn over in a sweep to show the next word, squash as they turn and swing past flat before they settle. Hover flips the discs under the pointer; a click sends a wave.
  - **Scratch** (Micro-interactions): a scratch-off card. Drag to scrape the foil, flakes fall where you scratch, and the rest fades once enough is gone. Enter or Space reveals it from the keyboard.
  - **SwipeActions** (Micro-interactions, Pro): list rows you swipe to show actions, like iOS Mail. A full swipe runs the outer action and folds the row away. Arrow keys and Enter work too.
  - **Kanban** (Power-User Systems, Pro): a drag-and-drop board with work-in-progress limits and columns that fold to a rail. Space picks up a card and the arrow keys move it.
  - **Pathfinder** (Power-User Systems): A\*, Dijkstra, breadth-first and greedy search spreading through a maze. Draw walls or move the start and goal while it runs, and the path updates live.
  - **Silvergrass** (Hero Templates, Pro): a moonlit field of GPU-drawn grass beside left-aligned copy. The blades part around the pointer, a click sends a ring of wind through them, and a drag turns the view.
  - **Penumbra** (Hero Templates, Pro): a cloud of dark shards between a spotlight and a wall. From most angles its shadow is noise; at the true angle it spells a word. Drag it and the word breaks; let go and it comes back.

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
