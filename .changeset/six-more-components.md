---
"shadow-garden": minor
---

Five new components, taking the catalog to 87.

- **Contour** (Backgrounds) — a topographic map of terrain that will not hold still. The lines are not drawn, they are found: a height field is sampled onto a grid every frame and marching squares walks it once per altitude, emitting segments wherever the land crosses that height. The pointer raises a hill the contours route around, and because the contour interval is fixed rather than the line count, the extra altitude produces extra rings instead of restretching the ones already on screen.
- **Rainglass** (Backgrounds) — rain on a window with a city somewhere behind it. There is no scene being blurred; the backdrop is built out of focus to begin with, so the drops have something to bend without a render target or a blur pass anywhere in the frame. Each drop is a pure function of time inside its own grid cell, and the descent is stick-slip — holding by surface tension, breaking loose, running, stopping — with the trail existing only above the drop that made it.
- **Neon** (Text Animations) — a neon sign, with everything that is wrong with a neon sign. Tubes strike one at a time rather than together, the steady state carries a mains hum, and every so often one tube gives up for a third of a second and comes back. The glow is baked once per letter into a sprite, so a frame is a handful of draws no matter how wide the word.
- **Rime** (Text Animations) — hoarfrost taking a word, Molten's opposite number. Crystal tips seeded on the glyph edges creep across the letters, fork at a fixed lattice angle, and die where they run out of glyph, so cost tracks the growing edge rather than the area. The text underneath is never redrawn, which makes the thaw nothing more than fading ice off type that was always there.
- **Dial** (Micro-interactions) — a machined rotary knob: angular drag with detents you feel on the way past, inertia on a flick, and a spring that settles into the nearest stop. The angle lives in a motion value, so the only thing React holds is the detent index — and arrow keys step through the same spring the hand does.
