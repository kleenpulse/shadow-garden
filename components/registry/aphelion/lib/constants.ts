// APHELION — every string on the page lives here.
//
// Rebranding the template is an edit to this file, template.css and nothing
// else. The sections read their copy from these tables; none of them hard-code
// a word of it.

export const BRAND = {
  name: "Aphelion",
  wordmark: "APHELION",
  tagline: "A dark-sky retreat",
  location: "Valdrin Ridge · 2,140 m",
} as const;

export const NAV_LINKS = [
  { label: "Experiences", href: "#experiences" },
  { label: "Rooms", href: "#rooms" },
  { label: "Sky calendar", href: "#calendar" },
  { label: "Story", href: "#story" },
] as const;

export const NAV_CTA = { label: "Book a season", href: "#book" } as const;

export const HERO = {
  eyebrow: "Bortle class 1 · furthest from the light",
  title: "Sleep under a darker sky.",
  subtitle:
    "Nine suites on a ridge above the weather, four hours past the last streetlight. The observatory is open all night. Breakfast is late by design.",
  scrollCue: "The night is long — scroll",
  stats: [
    { value: "Bortle 1", label: "measured sky class" },
    { value: "2,140 m", label: "above the haze line" },
    { value: "310", label: "clear nights a year" },
    { value: "140 km", label: "to the nearest streetlight" },
  ],
} as const;

export const EXPERIENCES = {
  eyebrow: "After dark",
  title: "Four ways to spend a night",
  items: [
    {
      index: "01",
      title: "Guided deep-sky session",
      description:
        "Two hours at the 60 cm reflector with our resident astronomer. Galaxies first, then whatever the ridge decides to show you.",
      meta: "Nightly · 23:00",
    },
    {
      index: "02",
      title: "Astrophotography masterclass",
      description:
        "From tracking mount to first stacked frame in one night. Bring any camera; leave with the Andromeda galaxy on it.",
      meta: "Tue & Fri · 22:00",
    },
    {
      index: "03",
      title: "Dawn ridge walk",
      description:
        "The zodiacal light shows for forty minutes before sunrise. A slow walk to the east cairn, thermos included.",
      meta: "Daily · 05:10",
    },
    {
      index: "04",
      title: "Zero-light dinner",
      description:
        "Seven courses served in full darkness under the open roof. Your eyes adapt around the second course; the sky does the rest.",
      meta: "Sat · 21:00",
    },
  ],
} as const;

export const ROOMS = {
  eyebrow: "Stay",
  title: "Three ways to sleep",
  items: [
    {
      name: "Parallax Cabin",
      price: "€420",
      unit: "night",
      description:
        "A single-room timber cabin turned to face the winter rising of Orion. Wood stove, deep bath, no clock.",
      features: ["Sleeps 2", "Skylight berth", "Private terrace"],
      sky: "east",
    },
    {
      name: "Meridian Suite",
      price: "€640",
      unit: "night",
      description:
        "The long suite under the south meridian line. The roof over the bed opens on rails — silently, because 3 a.m. matters here.",
      features: ["Sleeps 2", "Opening roof", "Observatory priority"],
      sky: "south",
    },
    {
      name: "Zenith Dome",
      price: "€880",
      unit: "night",
      description:
        "A five-metre glass dome at the highest point of the ridge. You are in bed and inside the sky at the same time.",
      features: ["Sleeps 2", "Full-sky dome", "Private telescope"],
      sky: "zenith",
    },
  ],
} as const;

export const CALENDAR = {
  eyebrow: "Sky calendar",
  title: "What the ridge will show you",
  note: "Times local to the ridge. Clear-sky probability from our own weather mast.",
  columns: ["Event", "Date", "Best window", "Outlook"],
  rows: [
    {
      event: "New moon — darkest week",
      date: "Sep 11, 2026",
      window: "All night",
      outlook: "Excellent",
      phase: 0,
    },
    {
      event: "Zodiacal light season opens",
      date: "Sep 28, 2026",
      window: "05:00 – 05:40",
      outlook: "Good",
      phase: 0.15,
    },
    {
      event: "Orionid meteor shower peak",
      date: "Oct 21, 2026",
      window: "01:00 – 04:30",
      outlook: "Good",
      phase: 0.35,
    },
    {
      event: "Total lunar eclipse",
      date: "Dec 4, 2026",
      window: "22:12 – 23:47",
      outlook: "Fair",
      phase: 1,
    },
    {
      event: "Geminid meteor shower peak",
      date: "Dec 14, 2026",
      window: "21:00 – 05:00",
      outlook: "Excellent",
      phase: 0.2,
    },
    {
      event: "Saturn at opposition",
      date: "Jan 9, 2027",
      window: "23:30 – 02:00",
      outlook: "Good",
      phase: 0.6,
    },
  ],
} as const;

export const STORY = {
  eyebrow: "Story",
  title: "Built where the light ends",
  quote:
    "On the Bortle scale, one is a sky most people alive have never seen. We did not build an hotel and look for a view. We found the darkness first.",
  paragraphs: [
    "The Bortle scale runs from nine — an inner-city sky holding a dozen stars — down to one, where the Milky Way casts a shadow at your feet. Class 1 sites are vanishing at around ten percent a decade; the ridge is one of the last in Europe, and the reserve around it now protects the dark the way a national park protects a forest.",
    "Everything here is built to defend it. Amber path-lights below knee height, blackout rails on every window, a kitchen that finishes service before astronomical twilight ends. The nearest town glows faintly behind the western col — our only horizon that isn't black — and we planted a treeline on it.",
  ],
  signature: "The keepers of Valdrin Ridge",
} as const;

export const FOOTER = {
  cta: {
    eyebrow: "Booking opens seasonally",
    title: "The sky is waiting.",
    action: "Request a season brochure",
    href: "#",
  },
  contact: [
    { label: "stay@aphelion.example", href: "mailto:stay@aphelion.example" },
    { label: "+43 000 0000", href: "tel:+430000000" },
  ],
  meta: [
    { label: "Valdrin Ridge Dark-Sky Reserve" },
    { label: "46.87° N · 13.12° E" },
  ],
  smallPrint: "Aphelion is a fictional brand. All events are illustrative.",
} as const;

export const INTRO = {
  wordmark: "APHELION",
  line: "furthest point from the sun",
} as const;
