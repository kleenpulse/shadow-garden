import { registry } from "./registry/index";
import type { Category, ComponentEntry } from "./registry/types";
import { IS_LOCAL_DEV } from "./env";

// Landing surfaces for the queries a component page can't answer. `/components`
// targets the head term; a single entry targets one effect name. Nothing on the
// site targeted "react hover effects" or "gsap react components" until this.
//
// Every member set is COMPUTED from fields the registry already declares —
// category, cookbook terms, dependencies. There is no second taxonomy to
// maintain and no way for a collection to drift from the catalog: add a
// component that cites "Stagger" and it appears here on the next build.
//
// Shell-only, same rule as lib/seo.ts: this is how the site describes itself to a
// crawler, not something a buyer pastes. Never import from components/registry/.
//
// Relative imports and no framework edges on purpose — scripts/registry/ imports
// this under plain `bun` to run the collection rules (§C5).

export type CollectionFilter =
  | { kind: "category"; category: Category }
  | { kind: "terms"; terms: string[] }
  | { kind: "deps"; packages: string[] };

export interface Collection {
  /** URL segment under /collections/. Shaped like the query, not like the filter. */
  slug: string;
  /** H1 and <title>. */
  title: string;
  /**
   * The one piece of authored prose on the page. Without it these are 18 filtered
   * grids differing only by membership, which is the exact shape of a thin-content
   * penalty — `collection-intro` enforces a floor of 40 words.
   */
  intro: string;
  filter: CollectionFilter;
}

/** Heading the index groups under, in display order. */
export const COLLECTION_GROUPS = [
  "By Category",
  "By Technique",
  "By Library",
] as const;

export type CollectionGroup = (typeof COLLECTION_GROUPS)[number];

const GROUP_OF: Record<CollectionFilter["kind"], CollectionGroup> = {
  category: "By Category",
  terms: "By Technique",
  deps: "By Library",
};

export const COLLECTIONS: Collection[] = [
  // ── By category ────────────────────────────────────────────────────────────
  {
    slug: "react-micro-interactions",
    title: "React Micro-Interaction Components",
    intro:
      "The small responses that make an interface feel like it answered you. Forty-three components covering hover states, cursor effects, card transforms, dialogs, menus and machined controls. Nobody notices this layer until it is missing. Every one runs off a real pointer event, not a CSS transition alone, so the behaviour holds up under a fast cursor, a slow drag, and a touch screen.",
    filter: { kind: "category", category: "Micro-interactions" },
  },
  {
    slug: "react-background-components",
    title: "React Background Components",
    intro:
      "Motion for the layer that sits behind everything else. Thirty-five backgrounds that run at the back of a hero, a section, or a whole page: WebGL shader fields, canvas particle systems, drifting contour maps, and pure-CSS grids. Each one sizes itself to its container instead of the viewport, so it drops into a section as easily as a page. Palette and speed are props, and you can tune them in the browser before you copy anything.",
    filter: { kind: "category", category: "Backgrounds" },
  },
  {
    slug: "react-power-user-components",
    title: "React Power-User Components",
    intro:
      "Components that carry state and physics instead of decoration. Command palettes, ledgers, orbital systems, ASCII render engines, particle and rigid-body simulations. These are the heaviest pieces in the registry and the ones with real APIs. Most run a simulation loop, several own their own layout, and all of them expect to be wired to your data rather than dropped in as ornament.",
    filter: { kind: "category", category: "Power-User Systems" },
  },
  {
    slug: "react-text-animations",
    title: "React Text Animation Components",
    intro:
      "Type that moves for a reason. Twenty-six components for the moment a headline lands, a number counts, or a word swaps: scramble, split-flap, variable-font proximity, marquee, redaction, neon ignition, frost and shadow effects. Each one animates real text nodes, not an image or a canvas copy, so the words stay selectable, searchable, and readable to a screen reader while they move.",
    filter: { kind: "category", category: "Text Animations" },
  },
  // Hidden alongside the Landing Pages category while it is off in production
  // (see the registry barrel) — in a prod build its membership would resolve to
  // 0, under the 5-member floor, and every consumer (footer, sitemap,
  // /collections, the category About link) tolerates the absence.
  ...(IS_LOCAL_DEV
    ? [
        {
          slug: "react-landing-page-templates",
          title: "React Landing Page Templates",
          intro:
            "Whole landing pages, not fragments. Nine complete pages you can retint from one token dial: a brutalist advisory firm, a darkroom portfolio, an observatory retreat, product launches and more. Each ships its entire directory — sections, shaders, hooks, a scoped stylesheet — and renders full-bleed in its own frame, so what you preview is exactly the page a visitor gets. The shared token set means the Controls panel reads the same on every one of them.",
          filter: { kind: "category", category: "Landing Pages" },
        } satisfies Collection,
      ]
    : []),

  // ── By technique ───────────────────────────────────────────────────────────
  {
    slug: "react-hover-effects",
    title: "React Hover Effects",
    intro:
      "Forty-seven components whose main state change is the pointer arriving. Glows that follow the cursor, cards that tilt toward it, lists that dim every row but one, surfaces that dissolve or shift underneath it. Hover is the cheapest interaction in the browser and the easiest to overdo, so each of these picks one property to move and commits to it instead of animating everything at once.",
    filter: { kind: "terms", terms: ["Hover effect"] },
  },
  {
    slug: "react-stagger-animation",
    title: "React Stagger Animation",
    intro:
      "Stagger is the delay you put between siblings so a group arrives as a sequence instead of a block. Thirty-seven components here use it: letters peeling off a word, rows entering a list, cells lighting across a grid, neon tubes striking one at a time, particles seeded out of phase. The interesting number is never the duration. It is the offset between items, and every one of these exposes it as a control you can drag.",
    filter: { kind: "terms", terms: ["Stagger"] },
  },
  {
    slug: "react-drag-animations",
    title: "React Drag Animations",
    intro:
      "Thirty-eight components you move with a finger or a cursor, and that keep moving after you let go. Drag with momentum, rubber-banding at a boundary, reorderable lists, rigid bodies you can fling, cloth you can load until it tears, a knob you can spin through its detents. All of them bind pointer events instead of mouse events and set touch-action on the drag surface. That is the difference between a gesture that works on a phone and one that scrolls the page instead.",
    filter: { kind: "terms", terms: ["Drag", "Momentum", "Rubber-banding"] },
  },
  {
    slug: "react-reveal-animations",
    title: "React Reveal Animations",
    intro:
      "Content that is uncovered instead of faded in. Twenty-five components animate a mask, a clip-path, or a wipe, so the element is exposed a piece at a time rather than only changing opacity: pixel dissolves, curtain wipes, thawing frost, scroll-triggered entrances. A reveal reads as deliberate where a fade reads as a page still loading. That is why the extra property is worth animating.",
    filter: { kind: "terms", terms: ["Reveal", "Scroll reveal"] },
  },
  {
    slug: "react-spring-animation",
    title: "React Spring Animation",
    intro:
      "Motion described by physics instead of a curve. A spring has stiffness, damping and mass rather than a duration, so it settles on its own when something interrupts it and overshoots the way a real object does. Twenty-nine components here are spring-driven: magnetic buttons, bouncing dialogs, thrown lists, follow-through on a cursor, a scrubbing history head, a knob settling into its detent. Pull the damping toward zero on any of them and watch where the overshoot stops being charming.",
    filter: { kind: "terms", terms: ["Spring", "Bounce"] },
  },
  {
    slug: "react-blur-effects",
    title: "React Blur Effects",
    intro:
      "Sixteen components that use blur as a material, not a filter. Progressive edge gradients, depth-of-field falloff, frosted panels, a city built permanently out of focus behind wet glass, motion blur on a fast-moving element, focus pulls that sharpen as you approach. Blur is expensive to composite, so each of these keeps the blurred layer off the main paint path or bounds its radius. An unbounded full-page backdrop-filter is the fastest way to drop frames.",
    filter: { kind: "terms", terms: ["Blur"] },
  },
  {
    slug: "react-scroll-animations",
    title: "React Scroll Animations",
    intro:
      "Twenty-one components whose timeline is the scrollbar. Parallax rails, scroll-triggered entrances, sections that scrub a transform against progress. Scroll-driven animation is the one case where the user controls playback, so it has to look right at any speed and in both directions. Every one of these is driven by position, not by a trigger that fires once.",
    filter: {
      kind: "terms",
      terms: ["Scroll-driven animation", "Scroll reveal", "Parallax"],
    },
  },
  {
    slug: "react-clip-path-mask-effects",
    title: "React Clip-Path & Mask Effects",
    intro:
      "Fourteen components that animate the shape of what you can see instead of the element itself. Clip-path wipes, gradient masks, spotlight cutouts, torchlight that reveals a layer beneath. Masking composites on the GPU and never triggers layout, so it is the cheapest way to make something appear from nowhere. It is also the only way to show one layer through another without copying the content.",
    filter: { kind: "terms", terms: ["Clip-path", "Mask"] },
  },
  {
    slug: "react-layout-animation",
    title: "React Layout Animation",
    intro:
      "Fourteen components that animate between two layouts, not between two styles. A card that expands into a dialog, a grid that reflows when an item leaves, a panel that resizes without its contents jumping. Layout animation means measuring the before and after positions and interpolating the difference. Done right it keeps the element continuous, so the user follows one object instead of watching one disappear and another appear.",
    filter: { kind: "terms", terms: ["Layout animation"] },
  },
  {
    slug: "react-3d-tilt-effects",
    title: "React 3D Tilt Effects",
    intro:
      "Thirteen components that put an element in perspective and rotate it against the pointer. Tilting cards, holofoil surfaces, orbital layouts, depth that reacts to where you are looking. What decides whether this reads as expensive or cheap is the perspective distance, not the rotation angle. Too near and a small tilt distorts violently. Too far and the whole effect flattens into a slide.",
    filter: { kind: "terms", terms: ["3D tilt / Flip", "Perspective"] },
  },

  // ── By library ─────────────────────────────────────────────────────────────
  {
    slug: "framer-motion-components",
    title: "Framer Motion Components for React",
    intro:
      "Fifty-three components built on Motion, the animation library that used to be published as Framer Motion. It ships as the motion package now, and these lean on what it does best: layout animation, gesture handling, and springs that survive an interruption. Every one installs with a single dependency beyond React, and the source is plain idiomatic Motion, so it reads like code you would have written instead of a wrapper you have to learn.",
    filter: { kind: "deps", packages: ["motion"] },
  },
  {
    slug: "react-webgl-backgrounds",
    title: "React WebGL Backgrounds",
    intro:
      "Forty-two components that render on the GPU through a WebGL context: fragment-shader gradients, particle fields, fluid simulations, an agent-based slime mould, rain running down a pane of glass, a raymarched black hole. Thirty-five use ogl, a wrapper small enough that the whole bundle costs less than one hero image. Seven use Three.js, where the scene really does need a scene graph. All of them size to their container and halt the render loop when the tab is hidden.",
    filter: { kind: "deps", packages: ["ogl", "three"] },
  },
];

export function collectionPath(collection: Collection): string {
  return `/collections/${collection.slug}`;
}

export function getCollection(slug: string): Collection | undefined {
  return COLLECTIONS.find((collection) => collection.slug === slug);
}

export function collectionGroup(collection: Collection): CollectionGroup {
  return GROUP_OF[collection.filter.kind];
}

/** The collection that mirrors a catalog category, for the /components headings. */
export function categoryCollection(category: Category): Collection | undefined {
  return COLLECTIONS.find(
    (collection) =>
      collection.filter.kind === "category" &&
      collection.filter.category === category,
  );
}

function matches(filter: CollectionFilter, entry: ComponentEntry): boolean {
  switch (filter.kind) {
    case "category":
      return entry.category === filter.category;
    case "terms":
      return filter.terms.some((term) => (entry.cookbook ?? []).includes(term));
    case "deps":
      return filter.packages.some((pkg) =>
        (entry.dependencies ?? []).includes(pkg),
      );
  }
}

/**
 * Members in registry order — the same convention componentsByTerm() uses, so a
 * collection lists components the way the catalog and the sidebar already do.
 *
 * `entries` is injectable for the same reason CheckContext exists: the selftest
 * runs the collection rules against a synthetic registry with no disk.
 */
export function resolveCollection(
  collection: Collection,
  entries: ComponentEntry[] = registry,
): ComponentEntry[] {
  return entries.filter((entry) => matches(collection.filter, entry));
}

/**
 * Why this entry is on this page. Rendered under each member, and the reason the
 * member list is page-specific rather than the same card repeated across 18
 * URLs — `word-reveal` reads "Stagger, Reveal" here and "Built with motion"
 * there. Category collections have nothing to add: the heading already said it.
 */
export function matchReasons(
  collection: Collection,
  entry: ComponentEntry,
): string[] {
  const filter = collection.filter;
  if (filter.kind === "terms") {
    return filter.terms.filter((term) => (entry.cookbook ?? []).includes(term));
  }
  if (filter.kind === "deps") {
    return filter.packages.filter((pkg) =>
      (entry.dependencies ?? []).includes(pkg),
    );
  }
  return [];
}

/** Glossary terms whose definitions the page prints. Technique collections only. */
export function collectionTerms(collection: Collection): string[] {
  return collection.filter.kind === "terms" ? collection.filter.terms : [];
}

/** Reverse edge: the collections containing this component. Closes the cluster. */
export function collectionsFor(entry: ComponentEntry): Collection[] {
  return COLLECTIONS.filter((collection) =>
    matches(collection.filter, entry),
  );
}

/** Same-group collections, for the cross-links at the foot of a collection page. */
export function siblingCollections(collection: Collection): Collection[] {
  const group = collectionGroup(collection);
  return COLLECTIONS.filter(
    (other) =>
      other.slug !== collection.slug && collectionGroup(other) === group,
  );
}

