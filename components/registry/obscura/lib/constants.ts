// OBSCURA — every string on the page lives here.
//
// Rebranding the template is an edit to this file, template.css and nothing
// else. The `id` fields are Cloudinary public ids resolved through
// ../_shared/cdn.ts — re-upload your own photography under the same ids (or
// change the ids here) and the whole site reshoots itself.

export const BRAND = {
  name: "Obscura",
  wordmark: "OBSCURA",
  tagline: "Photographic studio & darkroom",
  location: "Studio 9, Halide Lane",
} as const;

export const NAV_LINKS = [
  { label: "Work", href: "#work" },
  { label: "Studio", href: "#studio" },
  { label: "Services", href: "#services" },
] as const;

export const NAV_CTA = { label: "Commission", href: "#contact" } as const;

export const HERO = {
  eyebrow: "Analog first · printed always",
  titleA: "Light,",
  titleB: "developed slowly.",
  subtitle:
    "A photographic studio working in long exposures and silver prints. Everything below was shot on the premises and developed in the red room downstairs.",
  image: { id: "obscura/hero", alt: "Long-exposure light study across a dark studio wall" },
  meta: ["f/2.0", "120s", "ISO 50", "silver gelatin"],
} as const;

export const WORK = {
  eyebrow: "Selected work",
  title: "Studies in available darkness",
  items: [
    {
      index: "01",
      title: "Study in Sodium",
      meta: "Long exposure · 2026",
      id: "obscura/work-01",
      alt: "Warm sodium light bleeding across a dark field",
    },
    {
      index: "02",
      title: "Meridian Frames",
      meta: "Large format · 2026",
      id: "obscura/work-02",
      alt: "Cold vertical light dividing a black frame",
    },
    {
      index: "03",
      title: "The Red Hour",
      meta: "Darkroom study · 2025",
      id: "obscura/work-03",
      alt: "Safelight red wash over developing trays",
    },
    {
      index: "04",
      title: "Halide Field",
      meta: "Silver print · 2025",
      id: "obscura/work-04",
      alt: "Grain field resolving into a pale horizon",
    },
    {
      index: "05",
      title: "Aperture Songs",
      meta: "Long exposure · 2025",
      id: "obscura/work-05",
      alt: "Circular light trails around a dark centre",
    },
    {
      index: "06",
      title: "Vantablack Coast",
      meta: "Night series · 2024",
      id: "obscura/work-06",
      alt: "A coastline described only by its highlights",
    },
  ],
} as const;

export const STUDIO = {
  eyebrow: "The studio",
  title: "A room built for patience",
  portrait: { id: "obscura/portrait", alt: "The studio's printing wall under working light" },
  paragraphs: [
    "Obscura runs on the slowest equipment we could find: a century of lenses, a wall of enlargers, and a darkroom where phones do not get reception on purpose. Digital happens here too — but it is graded like film, printed like film, and it waits its turn like film.",
    "The studio takes eight commissions a season. That number is the whole business model: enough to keep the lights amber, few enough that every negative gets an evening of somebody's full attention.",
  ],
  facts: [
    { value: "1968", label: "the year of our newest enlarger" },
    { value: "8", label: "commissions a season" },
    { value: "0", label: "presets used, ever" },
  ],
} as const;

export const SERVICES = {
  eyebrow: "Services",
  title: "What the red room does",
  items: [
    {
      index: "01",
      title: "Editorial",
      description: "Portrait and interior series for print publications, shot on location or under the studio's north light.",
    },
    {
      index: "02",
      title: "Commissions",
      description: "Private long-exposure and architectural work. One subject, one season, one print run.",
    },
    {
      index: "03",
      title: "Printing",
      description: "Silver gelatin and archival pigment printing from your negatives or files, proofed by hand.",
    },
    {
      index: "04",
      title: "The Archive",
      description: "Editioned prints from the studio's own studies — including several hanging on this page.",
    },
  ],
} as const;

export const FOOTER = {
  cta: {
    eyebrow: "Now booking next season",
    title: "Worth printing.",
    action: "Start a commission",
    href: "#",
  },
  contact: [
    { label: "studio@obscura.example", href: "mailto:studio@obscura.example" },
    { label: "+44 000 0000", href: "tel:+440000000" },
  ],
  meta: [{ label: "Studio 9, Halide Lane" }, { label: "Open by appointment" }],
  smallPrint:
    "Obscura is a fictional brand. The photography is the studio's own generated light studies.",
} as const;

export const INTRO = {
  wordmark: "OBSCURA",
  line: "developing",
} as const;
