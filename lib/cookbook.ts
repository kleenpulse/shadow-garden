// The motion glossary behind /cookbook. Framework-free on purpose — no React,
// no nuqs — so scripts/registry/ can import it under plain `bun` to validate the
// terms every registry entry cites (§C5, same constraint as lib/registry/kinds.ts).
//
// A ComponentEntry declares the terms it demonstrates via `cookbook: string[]`;
// the page inverts that mapping. Term strings are the join key, so they are
// matched exactly — check:registry fails the build on a citation that does not
// resolve here.

export interface CookbookTerm {
  /** Display name and join key. Must be unique across every section. */
  term: string;
  /** One-line definition. */
  description: string;
}

export interface CookbookSection {
  title: string;
  /** What this group of terms is about, shown under the section heading. */
  blurb: string;
  terms: CookbookTerm[];
}

export const COOKBOOK: CookbookSection[] = [
  {
    title: "Entrances & Exits",
    blurb: "How elements appear and disappear.",
    terms: [
      {
        term: "Fade in / Fade out",
        description: "Element appears or disappears by changing opacity.",
      },
      {
        term: "Slide in",
        description:
          "Element enters by sliding in from off-screen (left, right, top, or bottom).",
      },
      {
        term: "Scale in",
        description:
          "Element grows from smaller to full size as it appears, often paired with a fade.",
      },
      {
        term: "Pop in",
        description:
          "Element appears with a slight overshoot, like it bounces into place.",
      },
      {
        term: "Reveal",
        description:
          "Content is uncovered gradually, often by animating a clip-path or mask.",
      },
      {
        term: "Enter / Exit",
        description:
          "The animation an element plays when it's added to or removed from the screen.",
      },
    ],
  },
  {
    title: "Sequencing & Timing",
    blurb: "Coordinating multiple elements or moments.",
    terms: [
      {
        term: "Keyframes",
        description:
          "Defined points in an animation (0%, 50%, 100%) that the browser fills the gaps between.",
      },
      {
        term: "Interpolation / Tween",
        description:
          "Generating all the in-between frames between a start and end value, so motion is continuous.",
      },
      {
        term: "Stagger",
        description:
          "Animate several items one after another with a small delay between each, creating a cascade.",
      },
      {
        term: "Orchestration",
        description:
          "Deliberately timing multiple animations so they feel like one coordinated motion.",
      },
      { term: "Delay", description: "Time before an animation starts." },
      { term: "Duration", description: "How long an animation takes." },
      {
        term: "Fill mode",
        description:
          "Whether an element keeps its first or last frame's styles before the animation starts or after it ends (e.g. forwards).",
      },
      {
        term: "Stepped animation",
        description:
          "An animation that is divided into discrete steps, like a countdown timer.",
      },
    ],
  },
  {
    title: "Movement & Transforms",
    blurb: "Changing an element's position, size, or angle.",
    terms: [
      { term: "Translate", description: "Move an element along the X or Y axis." },
      { term: "Scale", description: "Make an element bigger or smaller." },
      { term: "Rotate", description: "Spin an element around a point." },
      {
        term: "Skew",
        description:
          "Slant an element along the X or Y axis, shearing it out of its rectangular shape.",
      },
      {
        term: "3D tilt / Flip",
        description: "Rotate in 3D space (rotateX / rotateY) to add depth.",
      },
      {
        term: "Perspective",
        description:
          "How strong the 3D effect looks — a lower value exaggerates depth, like the viewer is closer.",
      },
      {
        term: "Transform origin",
        description: "The anchor point a scale or rotation grows or spins from.",
      },
      {
        term: "Origin-aware animation",
        description:
          "An element animates out of its trigger, like a popover growing from the button that opened it instead of from its own center which is the default in CSS.",
      },
    ],
  },
  {
    title: "Transitions Between States",
    blurb: "Connecting one state, view, or element to another.",
    terms: [
      {
        term: "Crossfade",
        description: "One element fades out as another fades in, in the same spot.",
      },
      {
        term: "Continuity transition",
        description:
          "A change that keeps the user oriented by visually connecting before and after. For example, making the same rectangle bigger and smaller.",
      },
      {
        term: "Morph",
        description: "One shape smoothly turns into another shape, e.g. Dynamic Island.",
      },
      {
        term: "Shared element transition",
        description:
          "An element travels and transforms from one position into another, like a thumbnail expanding into a card.",
      },
      {
        term: "Layout animation",
        description:
          "When an element's size or position changes, it animates to the new spot instead of snapping.",
      },
      {
        term: "Accordion / Collapse",
        description:
          "A section smoothly expands and collapses its height to show or hide content.",
      },
      {
        term: "Direction-aware transition",
        description:
          "Content slides one way going forward and the opposite way going back, so navigation has a sense of direction.",
      },
    ],
  },
  {
    title: "Scroll",
    blurb: "Motion tied to scrolling or navigating between views.",
    terms: [
      {
        term: "Scroll reveal",
        description: "Elements fade or slide into place as they enter the viewport.",
      },
      {
        term: "Scroll-driven animation",
        description: "An animation whose progress is tied directly to scroll position.",
      },
      {
        term: "Parallax",
        description:
          "Background and foreground move at different speeds while scrolling, creating depth.",
      },
      {
        term: "Page transition",
        description:
          "An animation that plays when navigating from one page or route to another.",
      },
      {
        term: "View transition",
        description:
          "The browser morphs between two states or pages, connecting shared elements.",
      },
    ],
  },
  {
    title: "Feedback & Interaction",
    blurb: "Responding to the user's actions.",
    terms: [
      {
        term: "Hover effect",
        description: "Visual change when the cursor moves over an element.",
      },
      {
        term: "Press / Tap feedback",
        description:
          "A subtle scale-down when an element is clicked, so it feels physical.",
      },
      {
        term: "Hold to confirm",
        description: "A progress effect that fills up while the user holds a button.",
      },
      {
        term: "Drag",
        description:
          "Moving an element by grabbing it, often with momentum when released.",
      },
      {
        term: "Drag to reorder",
        description:
          "Dragging items in a list to rearrange them, while the others shift to make room.",
      },
      {
        term: "Swipe to dismiss",
        description:
          "Dragging an element off-screen to close it, like a drawer or toast.",
      },
      {
        term: "Rubber-banding",
        description:
          "Resistance and snap-back when you drag past a boundary (the iOS overscroll feel).",
      },
      {
        term: "Shake / Wiggle",
        description:
          "A quick side-to-side jitter signaling an error or rejected input.",
      },
      {
        term: "Ripple",
        description: "A circle expanding from the point of a tap, confirming the press.",
      },
    ],
  },
  {
    title: "Easing",
    blurb: "How speed changes over an animation.",
    terms: [
      {
        term: "Easing",
        description: "The rate at which an animation speeds up or slows down.",
      },
      {
        term: "Ease-out",
        description:
          "Starts fast, ends slow. The default for most UI and anything responding to the user.",
      },
      {
        term: "Ease-in",
        description: "Starts slow, ends fast. Usually avoided; can feel sluggish.",
      },
      {
        term: "Ease-in-out",
        description:
          "Slow, fast, slow. Good for elements already on screen moving from A to B.",
      },
      {
        term: "Linear",
        description: "Constant speed. Avoid for UI; reserve for spinners or marquees.",
      },
      {
        term: "Cubic-bezier",
        description: "A custom easing curve you define for precise control.",
      },
      {
        term: "Asymmetric easing",
        description:
          "A curve that accelerates and decelerates at different rates. Feels more alive than a symmetric one.",
      },
    ],
  },
  {
    title: "Spring Animations",
    blurb: "Physics-based motion as an alternative to fixed-duration easing.",
    terms: [
      {
        term: "Spring",
        description:
          "Motion driven by physics (tension, mass, damping) rather than a set duration.",
      },
      {
        term: "Stiffness / Tension",
        description:
          "How strongly the spring pulls toward its target. Higher feels snappier.",
      },
      {
        term: "Damping",
        description:
          "How quickly a spring settles. Lower damping means more bounce and oscillation.",
      },
      {
        term: "Mass",
        description:
          "How heavy the animated element feels. More mass makes it slower and more sluggish.",
      },
      {
        term: "Bounce",
        description: "A spring that overshoots and settles, adding playfulness.",
      },
      {
        term: "Perceptual duration",
        description:
          "How long a spring feels finished, even though it keeps micro-settling underneath.",
      },
      {
        term: "Momentum",
        description:
          "Motion that carries velocity, especially after a drag or interruption.",
      },
      {
        term: "Velocity",
        description:
          "How fast and in which direction an element is moving. A spring carries it into the next animation when interrupted, so a flicked element keeps its speed.",
      },
      {
        term: "Interruptible animation",
        description:
          "An animation that can be smoothly redirected mid-flight instead of finishing first.",
      },
    ],
  },
  {
    title: "Looping & Ambient Motion",
    blurb: "Animations that run on their own.",
    terms: [
      {
        term: "Marquee",
        description: "Text or content that scrolls continuously in a loop.",
      },
      {
        term: "Loop",
        description: "An animation that repeats, a set number of times or infinitely.",
      },
      {
        term: "Alternate (yoyo)",
        description:
          "A loop that plays forward then reverses each iteration, instead of jumping back to the start.",
      },
      {
        term: "Orbit",
        description: "An element circling around another in a continuous path.",
      },
      {
        term: "Pulse",
        description: "A gentle repeating scale or opacity change to draw attention.",
      },
      {
        term: "Float",
        description:
          "A gentle, continuous up-and-down drift that makes a static element feel alive and weightless.",
      },
      {
        term: "Idle animation",
        description:
          "Subtle motion that plays while an element is just sitting there, waiting to be interacted with.",
      },
    ],
  },
  {
    title: "Polish & Effects",
    blurb: "The small touches that separate good from great.",
    terms: [
      {
        term: "Blur",
        description: "A blur filter used to soften an element or mask tiny imperfections.",
      },
      {
        term: "Clip-path",
        description:
          "Clipping an element to a shape, used for reveals, masks, and before/after sliders.",
      },
      {
        term: "Mask",
        description:
          "Hiding or revealing parts of an element using a shape or gradient — like clip-path, but with soft, fadeable edges.",
      },
      {
        term: "Before / after slider",
        description:
          "A draggable divider that wipes between two overlaid images to compare them.",
      },
      {
        term: "Line drawing",
        description: "An SVG path that draws itself in, like an invisible pen tracing it.",
      },
      {
        term: "Text morph",
        description:
          "Text that animates character by character when it changes, drawing attention to the new value.",
      },
      {
        term: "Skeleton / Shimmer",
        description:
          "A placeholder with a moving sheen shown while content loads.",
      },
      { term: "Number ticker", description: "Digits rolling or counting up to a value." },
      {
        term: "Tabular numbers",
        description:
          "Fixed-width digits so numbers don't shift around as they change. Essential for tickers, timers, and counters.",
      },
      {
        term: "Typewriter",
        description: "Text appearing one character at a time, as if being typed.",
      },
    ],
  },
  {
    title: "Performance",
    blurb: "What keeps motion smooth instead of stuttering.",
    terms: [
      {
        term: "Frame rate (FPS)",
        description:
          "Frames drawn per second. 60fps is the baseline for smooth motion; 120fps on newer displays.",
      },
      {
        term: "Jank",
        description:
          "Visible stutter when the browser drops frames because it can't keep up with the animation.",
      },
      {
        term: "Dropped frame",
        description:
          "A frame the browser missed its deadline to draw, causing a tiny hitch in motion.",
      },
      {
        term: "Compositing",
        description:
          "Letting the GPU move or fade an element on its own layer without redoing layout or paint.",
      },
      {
        term: "will-change",
        description:
          "A CSS hint that an element is about to animate, so the browser can promote it to its own layer ahead of time.",
      },
      {
        term: "Layout thrashing",
        description:
          "Animating properties like width, height, top, or left that force the browser to recalculate layout every frame, causing jank.",
      },
    ],
  },
  {
    title: "Principles to Know",
    blurb: "Concepts that guide when and how to animate.",
    terms: [
      {
        term: "Purposeful animation",
        description:
          "Motion should serve a function — orient, give feedback, show relationships — not just decorate.",
      },
      {
        term: "Anticipation",
        description:
          "A small wind-up in the opposite direction before a move, hinting at what's about to happen.",
      },
      {
        term: "Follow-through",
        description:
          "Parts of an element keep moving and settle slightly after the main motion stops, adding weight.",
      },
      {
        term: "Squash & stretch",
        description:
          "Deforming an element as it moves to convey weight, speed, and flexibility.",
      },
      {
        term: "Perceived performance",
        description:
          "The right animation makes an interface feel faster, even when it isn't.",
      },
      {
        term: "Frequency of use",
        description:
          "The more often a user sees an animation, the shorter and subtler it should be.",
      },
      {
        term: "Spatial consistency",
        description:
          "Animating so an element keeps its identity and position across states, so users never lose track of where things went.",
      },
      {
        term: "Hardware acceleration",
        description:
          "Animating transform and opacity lets the GPU keep motion smooth.",
      },
      {
        term: "Reduced motion",
        description:
          "Respecting the user's prefers-reduced-motion setting by toning down or removing motion.",
      },
    ],
  },
];

/** Every term string, for exact-match validation. Built once at module load. */
export const COOKBOOK_TERMS: ReadonlySet<string> = new Set(
  COOKBOOK.flatMap((section) => section.terms.map((t) => t.term)),
);

/** Term → its definition. Lets a component page print what its declared terms
 *  actually mean instead of listing bare words, without duplicating the glossary. */
const TERM_INDEX: ReadonlyMap<string, string> = new Map(
  COOKBOOK.flatMap((section) => section.terms.map((t) => [t.term, t.description])),
);

export function termDefinition(term: string): string | undefined {
  return TERM_INDEX.get(term);
}

/** URL-safe anchor for a term, so /cookbook#spring resolves from anywhere. */
export function termAnchor(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
