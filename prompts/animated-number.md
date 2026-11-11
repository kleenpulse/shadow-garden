The file exports three components, and the props table above describes only one of them:

- `AnimatedNumberAdvanced` animates digit by digit. It is what the live preview on the reference page shows, and it is the only one that takes `staggerDelay`. Its `animationType` defaults to `"slide"`.
- `AnimatedNumber` swaps the whole value at once. It takes `value`, `animationType`, `duration` and `className`, and has no `staggerDelay` — passing it is a type error. Its `animationType` defaults to `"flip"`.
- `SmoothCounter` wraps `AnimatedNumber` in a layout spring, for a number whose width changes.

Ask me which one I want if my request does not make it clear. All three accept a pre-formatted string as `value` (for example `"$300,000"`), so currency and grouping survive.
