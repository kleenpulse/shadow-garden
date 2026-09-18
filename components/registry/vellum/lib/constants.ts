// All copy for the template, in one file. A buyer replaces this and has replaced
// the site — which is the point of shipping the shell rather than the client work
// (SPEC §C16).
//
// Every name here is invented. No third-party marks, logos or trademarks travel
// with a template (§C15), and a marquee of real exchange logos would be worse
// than useless to someone building a bakery site anyway.

export const PARTNERS = [
  { name: "Northwind" },
  { name: "Meridian" },
  { name: "Halcyon" },
  { name: "Orbital" },
  { name: "Lumen" },
  { name: "Vantage" },
  { name: "Corvus" },
  { name: "Ridgeline" },
  { name: "Beacon" },
  { name: "Quanta" },
  { name: "Atlas Bay" },
  { name: "Kestrel" },
  { name: "Solstice" },
];

export const MODELS = [
  {
    id: "01",
    name: "BUILD FROM ZERO",
    subtitle: "Plan and build with us from day one.",
    description:
      "Bring the domain knowledge; we bring everything around it. We work alongside your team as an in-house partner — architecting, developing and launching from concept to market, with operational support across every discipline you would otherwise have to hire for.",
    idealFor:
      "New ventures, teams with deep domain expertise and no in-house build capacity, companies entering an unfamiliar market",
  },
  {
    id: "02",
    name: "SCALE WHAT EXISTS",
    subtitle: "We invest in what you have already proven and open every door.",
    description:
      "Already live? We deploy capital into the business and open the network around it — distribution, partnerships, infrastructure, hiring and growth. Proven process, applied to something that already works, so the compounding starts immediately rather than after a rebuild.",
    idealFor:
      "Existing products seeking acceleration, teams that need capital paired with operators, companies ready to scale aggressively",
  },
];

export const PROCESS_STEPS = [
  {
    number: "01",
    title: "Assess",
    description:
      "We analyse the market, map the competitive landscape and test the strength of the category narrative. Before anything is built we understand exactly where the opportunity lives — and where the traps are.",
  },
  {
    number: "02",
    title: "Plan",
    description:
      "We draft a roadmap modelled on what has actually worked, tailored to your constraints. Every workstream is outlined, every milestone sequenced, every dependency accounted for before the first commit.",
  },
  {
    number: "03",
    title: "Execute",
    description:
      "This is where the work happens. Launch strategy, partnerships, distribution, software, campaigns — run across every vertical at once, because momentum is a compounding asset and sequencing it away wastes it.",
  },
  {
    number: "04",
    title: "Report",
    description:
      "We monitor conditions and adjust in real time. Markets shift, narratives rotate and windows open. The reporting framework is what keeps the plan adapting instead of ageing.",
  },
];

/**
 * Portfolio entries. `bg` is the plate colour behind each generated mark — the
 * template renders no photography, so this is what carries the visual identity of
 * a card.
 */
const projects = [
  {
    id: "northwind-grid",
    name: "Northwind Grid",
    bg: "#0D0D1A",
    link: "#",
    category: "platform",
    description:
      "Distributed energy routing for industrial sites. Real-time load balancing across on-site generation, storage and the public grid, with sub-second failover.",
  },
  {
    id: "idle-network",
    name: "Idle Network",
    bg: "#060919",
    link: "#",
    category: "platform",
    description:
      "Monetises idle robotics, drones and compute through an optimisation engine, turning underutilised hardware into billable capacity without touching the fleet software.",
  },
  {
    id: "edel-finance",
    name: "Edel Finance",
    bg: "#0A2418",
    link: "#",
    category: "platform",
    description:
      "Securities lending for mid-market treasuries. Earn on held equities or borrow against them, with collateral terms that settle same day instead of same quarter.",
  },
  {
    id: "solchat",
    name: "Solchat",
    bg: "#0A1A2A",
    link: "#",
    category: "platform",
    description:
      "End-to-end encrypted messaging, voice and video built on WebRTC, with identity that belongs to the user rather than the directory.",
  },
  {
    id: "keeta",
    name: "Keeta",
    bg: "#111111",
    link: "#",
    category: "platform",
    description:
      "A payments rail built for asset transfer, with cross-network interoperability, compliance hooks and 400ms settlement as a design constraint rather than a roadmap item.",
  },
  {
    id: "halcyon-labs",
    name: "Halcyon Labs",
    bg: "#0A0A14",
    link: "#",
    category: "platform",
    description:
      "Open research infrastructure for applied machine learning, formed out of four teams who were solving the same problem separately and badly.",
  },
  {
    id: "pawtocol",
    name: "Pawtocol",
    bg: "#050505",
    link: "#",
    category: "consumer",
    description:
      "A record that follows the animal rather than the clinic — combining veterinary history, wearables and ownership into one portable file.",
  },
  {
    id: "mog",
    name: "Mog",
    bg: "#1A0A00",
    link: "#",
    category: "consumer",
    description:
      "Community-first distribution, from first post to storefront. Software, listings and market presence handled as one motion instead of three vendors.",
  },
  {
    id: "gigachad",
    name: "Gigachad",
    bg: "#1A1A1A",
    link: "#",
    category: "consumer",
    description:
      "A fitness and self-improvement community that grew a product out of its own culture, then needed the operations to match the audience.",
  },
  {
    id: "peanut",
    name: "Peanut",
    bg: "#B8D4F0",
    link: "#",
    category: "consumer",
    description:
      "A rescue-animal advocacy platform born from a single viral story, built to convert attention into sustained funding for shelters.",
  },
  {
    id: "myro",
    name: "Myro",
    bg: "#1A2020",
    link: "#",
    category: "consumer",
    description:
      "Community tooling for creator-led brands — the bots, storefronts and drops that a following expects and a small team cannot build twice.",
  },
];

export { projects };
