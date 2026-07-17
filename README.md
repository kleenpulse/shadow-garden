# Shadow Garden

An animation-forward React component showcase — a dark, instrument-bench docs shell for browsing, tuning, and copying production-ready motion components. The name is borrowed from *The Eminence in the Shadow*.

Each component ships with a live preview, a Controls panel that tunes every prop in real time, the source on a Code tab, an install block, and a Props API table — all generated from a single registry entry per prop, so the docs never drift from the component.

## What's inside

16 components across four categories:

- **Backgrounds** (7) — WebGL/canvas ambience: Threads, Grainient, Light Rays, Side Rays, Dot Field, Strands, Ribbons.
- **Text Animations** (4) — Morphing Text, Animated Number, Marquee Text, Variable Proximity.
- **Micro-interactions** (4) — Pixel Transition, Border Glow, Spotlight Shell, Animated Hamburger.
- **Power-User Systems** (1) — Command Palette.

Components are tiered **free** (11) or **pro** (5). Pro source is gated server-side and never crosses to the client unless unlocked (env `SHADOW_GARDEN_PRO=1` or cookie `sg_pro=1`).

## How it works

- **Registry-driven.** Every prop is one `PropSchema` in `lib/registry/index.ts`, which drives both the Controls panel and the Props API table. Adding a component is a registry entry plus a component + preview file — no new page or template.
- **Tunable, shareable state.** Control values live in the URL via nuqs, so a tuned preview is a link you can share.
- **Server-highlighted code.** Source is read from disk server-side and highlighted with Shiki (`vesper` theme); entitlement gates which source you can see.

## Design

A dark graphite instrument bench with a single amethyst accent. The shell stays chromatically quiet so the live previews supply the color. Space Mono for display/readouts, Geist for body. Light and dark themes; dark is the default first impression. Every animated component respects `prefers-reduced-motion`, and the sidebar and all controls are fully keyboard-accessible.

## Stack

- Next.js 16 App Router with Cache Components / PPR on, React 19, TypeScript strict, Bun.
- Tailwind v4 (CSS-first, no config file — all tokens in `app/globals.css`).
- nuqs, Shiki, Zustand, motion/react, gsap, ogl, cmdk, react-colorful, next-themes, shadcn/Radix.

## Getting started

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

Build (must stay PPR-clean):

```bash
bun run build
```
