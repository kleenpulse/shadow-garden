import { asset } from "../../_shared/cdn";

type HoverListProps = {
  id?: number;
  value?: string;
  label: string;
};

type NavLinkProps = {
  id?: number;
  href: string;
  label: string;
};
export type StationCardProps = {
  id?: number;
  title: string;
  description: string;
  icon: string;
  color?: string;
};
export type FeaturesCardProps = {
  id?: number;
  title: string;
  description: string;
  image: string;
  color: string;
};

export const EV_OWNERS_CARDS: StationCardProps[] = [
  {
    id: 1,
    title: `Station Installation Guide`,
    description:
      "Kickstart the journey with an in-depth consultation. We delve into your project requirements, goals, and challenges. This phase is crucial for understanding your vision and aligning our expertise with your expectations.",
    icon: asset("voltline/station-ev-station"),
    color: "station",
  },
  {
    id: 2,
    title: "Charging History Tracker",
    description:
      "Our seasoned experts craft a customized plan tailored to your unique needs. This strategic roadmap outlines key milestones, timelines, and deliverables, ensuring clarity and alignment throughout the project.",
    icon: asset("voltline/station-battery-clock"),
    color: "tracker",
  },
  {
    id: 3,
    title: "Statistics & Reports",
    description:
      "Watch your vision take shape as our skilled development team brings concepts to life. We create prototypes and iterative versions, providing you with a tangible understanding of the evolving solution and room for feedback.",
    icon: asset("voltline/ev-owners-stats"),
    color: "stats",
  },
];

export const FEATURES_CARDS: FeaturesCardProps[] = [
  {
    id: 1,
    title: `Connect Your Charger`,
    description:
      "Kickstart the journey with an in-depth consultation. We delve into your project requirements, goals, and challenges. This phase is crucial for understanding your vision and aligning.",
    color: "bg-[#F7F5CE]",
    image: asset("voltline/station-feature-1"),
  },
  {
    id: 2,
    title: "Charging starts instantly",
    description:
      "Our seasoned experts craft a customized plan tailored to your unique needs. This strategic roadmap outlines key milestones, timelines, and deliverables, ensuring clarity and alignment.",
    color: "bg-[#F7CEDC]",
    image: asset("voltline/station-feature-2"),
  },
  {
    id: 3,
    title: "View charging summary",
    description:
      "Watch your vision take shape as our skilled development team brings concepts to life. We create prototypes and iterative versions, providing you with a tangible understanding of the evolving.",
    image: asset("voltline/station-feature-3"),
    color: "bg-[#B9F4AF]",
  },
];
export const STATION_CARDS: StationCardProps[] = [
  {
    id: 1,
    title: `Station Installation Guide`,
    description:
      "Kickstart the journey with an in-depth consultation. We delve into your project requirements, goals, and challenges. This phase is crucial for understanding your vision and aligning our expertise with your expectations.",
    icon: asset("voltline/station-ev-station"),
    color: "station",
  },
  {
    id: 2,
    title: "Charging History Tracker",
    description:
      "Our seasoned experts craft a customized plan tailored to your unique needs. This strategic roadmap outlines key milestones, timelines, and deliverables, ensuring clarity and alignment throughout the project.",
    icon: asset("voltline/station-battery-clock"),
    color: "tracker",
  },
  {
    id: 3,
    title: "Statistics & Reports",
    description:
      "Watch your vision take shape as our skilled development team brings concepts to life. We create prototypes and iterative versions, providing you with a tangible understanding of the evolving solution and room for feedback.",
    icon: asset("voltline/station-activity"),
    color: "stats",
  },
];

export const FOO_LINKS: NavLinkProps[] = [
  {
    id: 1,
    href: "/",
    label: "Home",
  },
  {
    id: 2,
    href: "about",
    label: "About Us",
  },
  {
    id: 3,
    href: "contact",
    label: "Contact Us",
  },
  {
    id: 4,
    href: "ev-owners",
    label: "EV Owners",
  },
  {
    id: 5,
    href: "station-owners",
    label: "Station Providers",
  },
];

export const Faqs: { question: string; answer: string; id: number }[] = [
  {
    id: 1,
    question: "How does it work?",
    answer: ` Our platform allows EV owners to easily locate nearby charging
          stations. For charging station owners, we provide comprehensive
          management tools for properties, installations, pricing, promotions,
          analytics, and more.`,
  },
  {
    id: 2,
    question: "Is it user-friendly?",
    answer: `Absolutely! User-first design for EV owners and station operators. Our support team is ready to assist.`,
  },
  {
    id: 3,
    question: "What analytics are available?",
    answer: `Deep insights with our analytics suite. Track station usage, user patterns, and campaign success. Make informed decisions for optimization.`,
  },
  {
    id: 4,
    question: "Can I manage multiple stations?",
    answer: `Certainly! Seamless management for multiple stations. Scale effortlessly as you expand your charging network.`,
  },
  {
    id: 5,
    question: "What information is available?",
    answer: `Real-time station availability, pricing details, and reliable support. Stay informed throughout your charging experience.`,
  },
];

export const ENERGY_LISTS: HoverListProps[] = [
  {
    id: 1,
    value: "comprehensive-tools ",
    label: "Comprehensive Tools ",
  },
  {
    id: 2,
    value: "energy-savings",
    label: "Energy Savings Transfer",
  },
  {
    id: 3,
    value: "find-charging-station",
    label: "Find Charging Stations ",
  },
];
export const STATION_LISTS: HoverListProps[] = [
  {
    id: 1,
    value: "comprehensive",
    label: "Comprehensive Management tool",
  },
  {
    id: 2,
    value: "helping",
    label: "Helping you find EV users",
  },
];
export const TARGET_LISTS: HoverListProps[] = [
  {
    id: 1,
    value: "ev-owners",
    label: "EV Owners",
  },
  {
    id: 2,
    value: "charging-station",
    label: "Charging Station Owners",
  },
  {
    id: 3,
    value: "charging-providers",
    label: "Charging Service Providers",
  },
];

export const NAV_LINKS: NavLinkProps[] = [
  {
    id: 1,
    href: "station-owners",
    label: "Station Owners",
  },
  {
    id: 2,
    href: "ev-owners",
    label: "EV Owners",
  },
  {
    id: 3,
    href: "about",
    label: "About Us",
  },
  {
    id: 4,
    href: "contact",
    label: "Contact Us",
  },
  // {
  //   id: 5,
  //   href: "our-team",
  //   label: "Our Team",
  // },
];
